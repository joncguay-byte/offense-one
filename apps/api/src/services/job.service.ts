import { prisma } from "../db.js";
import { analyzeSceneImages, diarizeAudioFromEvidence, diarizeAudioFromEvidenceWithReferences, generateNarrativeDraft } from "./ai.service.js";
import { writeAuditLog } from "./audit.service.js";
import { exportApprovedReport } from "./export.service.js";
import { notifyUsers } from "./notification.service.js";
import type { KnownSpeakerHint } from "@scene-report/shared";
import { getVoiceProfile } from "./voice-profile.service.js";

const prismaWithJobs = prisma as typeof prisma & {
  job: {
    create: (...args: any[]) => Promise<any>;
    updateMany: (...args: any[]) => Promise<any>;
    findUniqueOrThrow: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  incident: {
    findUniqueOrThrow: (...args: any[]) => Promise<any>;
  };
};

type GenerateReportPayload = {
  incidentTitle: string;
  officerPerspective: string;
  objective?: string;
  includeSceneSummary: boolean;
  includeWitnessSummary: boolean;
  includeCallForServiceContext?: boolean;
  selectedEvidenceIds?: string[];
};

type IngestAudioPayload = {
  evidenceId?: string;
  knownSpeakers?: KnownSpeakerHint[];
  referenceEvidenceId?: string;
};

function parseEvidenceMetadata(metadataJson?: string | null) {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function getIncidentOwnerId(incidentId: string) {
  const incident = await prismaWithJobs.incident.findUniqueOrThrow({
    where: { id: incidentId },
    select: { createdById: true, assignedSupervisorId: true, caseNumber: true, title: true }
  });

  return incident;
}

export async function enqueueJob(input: {
  incidentId: string;
  type: "INGEST_AUDIO" | "GENERATE_REPORT" | "EXPORT_REPORT";
  payload: Record<string, unknown>;
}) {
  return prismaWithJobs.job.create({
    data: {
      incidentId: input.incidentId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload)
    }
  });
}

async function processIngestAudio(jobId: string, incidentId: string, payload: IngestAudioPayload) {
  const audioEvidence = await prisma.evidenceItem.findMany({
    where: { incidentId, type: "AUDIO" },
    orderBy: { createdAt: "desc" }
  });

  const latestAudio = audioEvidence.find((item) => {
    if (payload.evidenceId && item.id !== payload.evidenceId) {
      return false;
    }
    const metadata = parseEvidenceMetadata(item.metadataJson);
    return metadata.sourceKind !== "OFFICER_REFERENCE";
  });

  if (!latestAudio) {
    throw new Error("No uploaded audio evidence is available for this incident.");
  }

  const referenceEvidence =
    audioEvidence.find((item) => item.id === payload.referenceEvidenceId) ||
    audioEvidence.find((item) => {
      const metadata = parseEvidenceMetadata(item.metadataJson);
      return metadata.sourceKind === "OFFICER_REFERENCE";
    });

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: {
      createdById: true,
      createdBy: {
        select: {
          fullName: true
        }
      }
    }
  });
  const reusableVoiceProfile = incident ? await getVoiceProfile(incident.createdById) : null;

  const referenceMetadata = parseEvidenceMetadata(referenceEvidence?.metadataJson);
  const officerDisplayName =
    typeof (referenceMetadata.knownOfficer as Record<string, unknown> | undefined)?.displayName === "string"
      ? String((referenceMetadata.knownOfficer as Record<string, unknown>).displayName)
      : payload.knownSpeakers?.find((speaker) => speaker.role === "OFFICER")?.displayName || reusableVoiceProfile?.displayName || incident?.createdBy.fullName;

  const transcript = (referenceEvidence || reusableVoiceProfile) && officerDisplayName
    ? await diarizeAudioFromEvidenceWithReferences(
        latestAudio.path,
        payload.knownSpeakers || [],
        [{
          displayName: officerDisplayName,
          filePath: referenceEvidence?.path || reusableVoiceProfile!.evidencePath
        }]
      )
    : await diarizeAudioFromEvidence(latestAudio.path, payload.knownSpeakers || []);
  const draft = await prisma.transcriptDraft.create({
    data: {
      incidentId,
      sourceEvidenceId: latestAudio.id,
      rawText: transcript.segments.map((segment) => segment.text).join(" "),
      diarizedJson: JSON.stringify(transcript)
    }
  });

  for (const speaker of transcript.speakers) {
    await prisma.participant.upsert({
      where: {
        incidentId_speakerKey: {
          incidentId,
          speakerKey: speaker.speakerKey
        }
      },
      update: {
        label: speaker.displayName || speaker.speakerKey,
        displayName: speaker.displayName
      },
      create: {
        incidentId,
        label: speaker.displayName || speaker.speakerKey,
        displayName: speaker.displayName,
        speakerKey: speaker.speakerKey
      }
    });
  }

  await writeAuditLog({
    action: "audio.ingested",
    entityType: "transcript_draft",
    entityId: draft.id,
    summary: "Generated diarized transcript from uploaded audio",
    metadata: { jobId }
  });

  return { transcriptDraftId: draft.id };
}

async function processGenerateReport(jobId: string, incidentId: string, payload: GenerateReportPayload) {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: incidentId },
    include: {
      transcriptDrafts: { orderBy: { createdAt: "asc" } },
      evidenceItems: true
    }
  });

  const selectedEvidenceIds = new Set(payload.selectedEvidenceIds || []);
  const transcriptRecords = selectedEvidenceIds.size > 0
    ? incident.transcriptDrafts.filter((draft: { sourceEvidenceId?: string | null }) => draft.sourceEvidenceId && selectedEvidenceIds.has(draft.sourceEvidenceId))
    : incident.transcriptDrafts.slice(-1);

  if (transcriptRecords.length === 0) {
    throw new Error("No transcript draft is available for this incident.");
  }

  const transcripts = transcriptRecords.map((transcriptRecord: { diarizedJson: string }) =>
    JSON.parse(transcriptRecord.diarizedJson) as Awaited<ReturnType<typeof diarizeAudioFromEvidence>>
  );
  const transcript = {
    language: transcripts[0].language,
    speakers: Array.from(
      new Map(transcripts.flatMap((item) => item.speakers).map((speaker) => [speaker.speakerKey, speaker])).values()
    ),
    segments: transcripts.flatMap((item) => item.segments)
  };
  const imageEvidence = incident.evidenceItems
    .filter((item) => item.type === "IMAGE")
    .filter((item) => selectedEvidenceIds.size === 0 || selectedEvidenceIds.has(item.id))
    .map((item) => {
      const metadata = parseEvidenceMetadata(item.metadataJson);
      return {
        path: item.path,
        sourceKind: metadata.sourceKind === "CALL_FOR_SERVICE" ? "CALL_FOR_SERVICE" as const : "SCENE" as const
      };
    });
  const sceneContext = await analyzeSceneImages(imageEvidence);
  const draft = await generateNarrativeDraft(payload, transcript, sceneContext);

  const generated = await prisma.generatedReport.create({
    data: {
      incidentId,
      body: draft.body,
      citationsJson: JSON.stringify(draft.citations),
      confidenceJson: JSON.stringify(draft.confidence)
    }
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "REVIEW" }
  });

  await writeAuditLog({
    action: "report.generated",
    entityType: "generated_report",
    entityId: generated.id,
    summary: "Generated AI draft narrative",
    metadata: { jobId }
  });

  return { reportId: generated.id };
}

async function processExportReport(jobId: string, incidentId: string, payload: { reportId: string }) {
  const report = await prisma.generatedReport.findUniqueOrThrow({
    where: { id: payload.reportId },
    include: { incident: true }
  });

  if (report.status !== "APPROVED") {
    throw new Error("Only approved reports can be exported.");
  }

  const exported = await exportApprovedReport({
    incidentId,
    reportId: report.id,
    caseNumber: report.incident.caseNumber,
    title: report.incident.title,
    body: report.body,
    reviewNotes: report.reviewNotes,
    reportStatus: report.status,
    approvedAt: report.reviewedAt?.toISOString() || null
  });

  await prisma.generatedReport.update({
    where: { id: report.id },
    data: {
      exportedAt: new Date(),
      exportPayloadJson: JSON.stringify(exported)
    } as any
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "EXPORTED" }
  });

  await writeAuditLog({
    action: "report.exported",
    entityType: "generated_report",
    entityId: report.id,
    summary: "Exported approved report",
    metadata: { jobId, adapter: exported.adapter, path: exported.path }
  });

  return { path: exported.path };
}

async function runJob(jobId: string) {
  const claimed = await prismaWithJobs.job.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      attempts: { increment: 1 }
    }
  });

  if (claimed.count === 0) {
    return false;
  }

  const job = await prismaWithJobs.job.findUniqueOrThrow({ where: { id: jobId } });
  const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;

  try {
    let result: Record<string, unknown>;
    if (job.type === "INGEST_AUDIO") {
      result = await processIngestAudio(job.id, job.incidentId, payload as IngestAudioPayload);
    } else if (job.type === "GENERATE_REPORT") {
      result = await processGenerateReport(job.id, job.incidentId, payload as unknown as GenerateReportPayload);
    } else {
      result = await processExportReport(job.id, job.incidentId, payload as unknown as { reportId: string });
    }

    await prismaWithJobs.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultJson: JSON.stringify(result),
        errorMessage: null
      }
    });

    const incident = await getIncidentOwnerId(job.incidentId);
    await notifyUsers({
      userIds: [incident.createdById, incident.assignedSupervisorId || ""],
      title: `${job.type} completed`,
      body: `${incident.caseNumber} - ${incident.title}: ${job.type} finished successfully.`,
      type: job.type === "EXPORT_REPORT" ? "REPORT_EXPORTED" : "JOB_COMPLETED",
      metadata: {
        jobId: job.id,
        incidentId: job.incidentId,
        result
      }
    });
    return true;
  } catch (error) {
    await prismaWithJobs.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown job failure"
      }
    });

    const incident = await getIncidentOwnerId(job.incidentId);
    await notifyUsers({
      userIds: [incident.createdById, incident.assignedSupervisorId || ""],
      title: `${job.type} failed`,
      body: `${incident.caseNumber} - ${incident.title}: ${error instanceof Error ? error.message : "Unknown job failure"}`,
      type: "JOB_FAILED",
      metadata: {
        jobId: job.id,
        incidentId: job.incidentId
      }
    });
    return true;
  }
}

let workerHandle: NodeJS.Timeout | null = null;

export function startJobWorker() {
  if (workerHandle) {
    return;
  }

  workerHandle = setInterval(async () => {
    const job = await prismaWithJobs.job.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" }
    });

    if (!job) {
      return;
    }

    await runJob(job.id);
  }, 1500);
}

export function stopJobWorker() {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
  }
}
