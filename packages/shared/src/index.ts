export type Speaker = {
  speakerKey: string;
  displayName: string | null;
  role?: string | null;
};

export type TranscriptSegment = {
  speakerKey: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type DiarizedTranscript = {
  language: string;
  speakers: Speaker[];
  segments: TranscriptSegment[];
};

export type SceneImageContext = {
  imageId: string;
  sourceKind?: "SCENE" | "CALL_FOR_SERVICE";
  observations: string[];
};

export type KnownSpeakerHint = {
  speakerKey?: string;
  displayName: string;
  role: "OFFICER" | "CALLER" | "WITNESS" | "SUBJECT" | "OTHER";
};

export type DraftNarrativeRequest = {
  incidentTitle: string;
  officerPerspective: string;
  objective?: string;
  includeSceneSummary: boolean;
  includeWitnessSummary: boolean;
  includeCallForServiceContext?: boolean;
  selectedEvidenceIds?: string[];
};

export type JobRecord = {
  id: string;
  type: "INGEST_AUDIO" | "GENERATE_REPORT" | "EXPORT_REPORT";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  incidentId?: string;
  createdAt?: string;
  completedAt?: string | null;
  resultJson?: string | null;
  errorMessage?: string | null;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  type: "JOB_COMPLETED" | "JOB_FAILED" | "REPORT_APPROVED" | "REPORT_EXPORTED";
  readAt?: string | null;
  createdAt?: string;
};

export const draftNarrativeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body", "citations", "confidence"],
  properties: {
    body: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceType", "sourceId", "note", "sourceLabel", "excerpt"],
        properties: {
          sourceType: { type: "string" },
          sourceId: { type: "string" },
          note: { type: "string" },
          sourceLabel: { type: "string" },
          excerpt: { type: "string" }
        }
      }
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "notes"],
      properties: {
        overall: {
          type: "string",
          enum: ["low", "medium", "high"]
        },
        notes: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  }
} as const;

export function buildNarrativePrompt(input: {
  request: DraftNarrativeRequest;
  transcript: DiarizedTranscript;
  sceneContext: SceneImageContext[];
}) {
  const speakerText = input.transcript.speakers
    .map((speaker) => `${speaker.speakerKey}: ${speaker.displayName || "Unlabeled speaker"}${speaker.role ? ` (${speaker.role})` : ""}`)
    .join("\n");

  const transcriptText = input.transcript.segments
    .map((segment) => `${segment.speakerKey} [${segment.startMs}-${segment.endMs}]: ${segment.text}`)
    .join("\n");

  const sceneText = input.sceneContext
    .map((image) => `[${image.sourceKind || "SCENE"}] ${image.imageId}: ${image.observations.join("; ")}`)
    .join("\n");

  return [
    "You are drafting a law-enforcement incident narrative.",
    "Use only grounded information from the transcript and scene observations provided.",
    "Do not invent names, actions, or conclusions that do not appear in the sources.",
    "If facts are uncertain or incomplete, say so directly in the confidence notes.",
    "Write the narrative in short, professional report prose.",
    "Prefer this order when supported by the evidence: call context, officer observations, witness or subject statements, officer actions, disposition.",
    "If call-for-service details are available, use them only as context and not as proof of what actually occurred.",
    "Every citation must identify the source, explain why it supports the narrative, and include a short excerpt or observation summary.",
    "",
    `Incident title: ${input.request.incidentTitle}`,
    `Officer perspective: ${input.request.officerPerspective}`,
    `Objective: ${input.request.objective || "Create an accurate and neutral first draft."}`,
    `Include scene summary: ${String(input.request.includeSceneSummary)}`,
    `Include witness summary: ${String(input.request.includeWitnessSummary)}`,
    `Include call for service context: ${String(input.request.includeCallForServiceContext ?? true)}`,
    "",
    "Known speakers:",
    speakerText || "No known speakers provided.",
    "",
    "Transcript:",
    transcriptText,
    "",
    "Scene observations:",
    sceneText || "No scene observations provided.",
    "",
    "Return JSON with body, citations, and confidence.",
    "For citations, include sourceType, sourceId, note, sourceLabel, and excerpt."
  ].join("\n");
}
