import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAuditLog } from "../services/audit.service.js";
import { enqueueJob } from "../services/job.service.js";

const prismaWithIncidentSupervisor = prisma as typeof prisma & {
  incident: {
    findMany: (...args: any[]) => Promise<any>;
    create: (...args: any[]) => Promise<any>;
    findUniqueOrThrow: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
};

const createIncidentSchema = z.object({
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  occurredAt: z.string().datetime(),
  createdById: z.string().min(1).optional(),
  assignedSupervisorId: z.string().min(1).optional()
});

const draftReportSchema = z.object({
  incidentTitle: z.string().min(1),
  officerPerspective: z.string().min(1),
  objective: z.string().optional(),
  includeSceneSummary: z.boolean().default(true),
  includeWitnessSummary: z.boolean().default(true),
  includeCallForServiceContext: z.boolean().default(true),
  selectedEvidenceIds: z.array(z.string()).optional()
});

const ingestAudioSchema = z.object({
  evidenceId: z.string().optional(),
  knownSpeakers: z.array(z.object({
    speakerKey: z.string().optional(),
    displayName: z.string().min(1),
    role: z.enum(["OFFICER", "CALLER", "WITNESS", "SUBJECT", "OTHER"])
  })).optional(),
  referenceEvidenceId: z.string().optional()
});

export const incidentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/incidents", async () => prismaWithIncidentSupervisor.incident.findMany({
    include: {
      createdBy: true,
      assignedSupervisor: true,
      participants: true,
      evidenceItems: true,
      generatedReports: true,
      transcriptDrafts: true
    },
    orderBy: { createdAt: "desc" }
  }));

  app.post("/incidents", async (request, reply) => {
    const body = createIncidentSchema.parse(request.body);
    const createdById = body.createdById || request.authUser?.sub;

    if (!createdById) {
      reply.code(400);
      return { message: "A creator is required." };
    }

    const incident = await prismaWithIncidentSupervisor.incident.create({
      data: {
        caseNumber: body.caseNumber,
        title: body.title,
        location: body.location,
        occurredAt: new Date(body.occurredAt),
        createdById,
        assignedSupervisorId: body.assignedSupervisorId
      } as any
    });

    await writeAuditLog({
      userId: createdById,
      action: "incident.created",
      entityType: "incident",
      entityId: incident.id,
      summary: `Created incident ${incident.caseNumber}`
    });

    reply.code(201);
    return incident;
  });

  app.get("/incidents/:incidentId", async (request) => {
    const params = z.object({ incidentId: z.string() }).parse(request.params);
    return prismaWithIncidentSupervisor.incident.findUniqueOrThrow({
      where: { id: params.incidentId },
      include: {
        createdBy: true,
        assignedSupervisor: true,
        participants: true,
        evidenceItems: true,
        transcriptDrafts: true,
        generatedReports: true
      }
    });
  });

  app.patch("/incidents/:incidentId/assign-supervisor", async (request, reply) => {
    const params = z.object({ incidentId: z.string() }).parse(request.params);
    const body = z.object({ assignedSupervisorId: z.string().min(1) }).parse(request.body);

    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const supervisor = await prisma.user.findUnique({
      where: { id: body.assignedSupervisorId }
    });

    if (!supervisor || supervisor.role !== "SUPERVISOR") {
      reply.code(400);
      return { message: "Assigned user must be a supervisor." };
    }

    const incident = await prismaWithIncidentSupervisor.incident.update({
      where: { id: params.incidentId },
      data: { assignedSupervisorId: body.assignedSupervisorId } as any,
      include: {
        assignedSupervisor: true
      }
    });

    await writeAuditLog({
      userId: request.authUser.sub,
      action: "incident.assigned_supervisor",
      entityType: "incident",
      entityId: incident.id,
      summary: `Assigned supervisor ${supervisor.fullName} to incident ${incident.caseNumber}`
    });

    return incident;
  });

  app.post("/incidents/:incidentId/ingest-audio", async (request, reply) => {
    const params = z.object({ incidentId: z.string() }).parse(request.params);
    const body = ingestAudioSchema.parse(request.body || {});
    const latestAudio = await prisma.evidenceItem.findFirst({
      where: {
        incidentId: params.incidentId,
        type: "AUDIO",
        ...(body.evidenceId ? { id: body.evidenceId } : {})
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!latestAudio) {
      reply.code(400);
      return { message: "No uploaded audio evidence is available for this incident." };
    }

    const job = await enqueueJob({
      incidentId: params.incidentId,
      type: "INGEST_AUDIO",
      payload: {
        evidenceId: latestAudio.id,
        knownSpeakers: body.knownSpeakers || [],
        referenceEvidenceId: body.referenceEvidenceId
      }
    });

    reply.code(201);
    return { jobId: job.id, status: job.status };
  });

  app.post("/incidents/:incidentId/generate-report", async (request, reply) => {
    const params = z.object({ incidentId: z.string() }).parse(request.params);
    const body = draftReportSchema.parse(request.body);

    const transcriptCount = await prisma.transcriptDraft.count({
      where: { incidentId: params.incidentId }
    });
    if (transcriptCount === 0) {
      reply.code(400);
      return { message: "No transcript draft is available for this incident." };
    }

    const job = await enqueueJob({
      incidentId: params.incidentId,
      type: "GENERATE_REPORT",
      payload: body
    });

    reply.code(201);
    return { jobId: job.id, status: job.status };
  });
};
