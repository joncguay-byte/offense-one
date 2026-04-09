import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAuditLog } from "../services/audit.service.js";
import { persistEvidenceUpload } from "../services/storage.service.js";

const createEvidenceSchema = z.object({
  incidentId: z.string().min(1),
  type: z.enum(["AUDIO", "IMAGE", "VIDEO"]),
  mimeType: z.string().min(1),
  path: z.string().min(1),
  capturedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const renameSpeakerSchema = z.object({
  label: z.string().min(1),
  displayName: z.string().min(1).optional()
});

function getMultipartFieldValue(field: unknown) {
  if (!field || Array.isArray(field) || typeof field !== "object" || !("value" in field)) {
    return undefined;
  }

  return (field as { value?: unknown }).value;
}

function parseMultipartMetadata(field: unknown) {
  const rawValue = getMultipartFieldValue(field);
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  app.post("/incidents/:incidentId/upload-evidence", async (request, reply) => {
    const params = z.object({ incidentId: z.string().min(1) }).parse(request.params);
    const upload = await request.file();

    if (!upload) {
      reply.code(400);
      return { message: "No file was uploaded." };
    }

    const typeValue = String(getMultipartFieldValue(upload.fields.type) || "").toUpperCase();
    const evidenceType = z.enum(["AUDIO", "IMAGE", "VIDEO"]).parse(typeValue);
    const metadata = parseMultipartMetadata(upload.fields.metadata);
    const storedEvidence = await persistEvidenceUpload({
      incidentId: params.incidentId,
      fileName: upload.filename,
      mimeType: upload.mimetype,
      stream: upload.file
    });

    const evidence = await prisma.evidenceItem.create({
      data: {
        incidentId: params.incidentId,
        type: evidenceType,
        mimeType: upload.mimetype,
        path: storedEvidence.path,
        capturedAt: getMultipartFieldValue(upload.fields.capturedAt)
          ? new Date(String(getMultipartFieldValue(upload.fields.capturedAt)))
          : new Date(),
        metadataJson: JSON.stringify({
          originalFilename: upload.filename,
          fieldname: upload.fieldname,
          storageBackend: storedEvidence.storageBackend,
          ...metadata
        })
      }
    });

    await writeAuditLog({
      action: "evidence.uploaded",
      entityType: "evidence_item",
      entityId: evidence.id,
      summary: `Uploaded ${evidenceType.toLowerCase()} evidence`
    });

    reply.code(201);
    return evidence;
  });

  app.post("/evidence", async (request, reply) => {
    const body = createEvidenceSchema.parse(request.body);

    const evidence = await prisma.evidenceItem.create({
      data: {
        incidentId: body.incidentId,
        type: body.type,
        mimeType: body.mimeType,
        path: body.path,
        capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
        metadataJson: body.metadata ? JSON.stringify(body.metadata) : undefined
      }
    });

    await writeAuditLog({
      action: "evidence.created",
      entityType: "evidence_item",
      entityId: evidence.id,
      summary: `Registered ${body.type.toLowerCase()} evidence`
    });

    reply.code(201);
    return evidence;
  });

  app.patch("/participants/:participantId", async (request) => {
    const params = z.object({ participantId: z.string() }).parse(request.params);
    const body = renameSpeakerSchema.parse(request.body);

    const participant = await prisma.participant.update({
      where: { id: params.participantId },
      data: {
        label: body.label,
        displayName: body.displayName || body.label
      }
    });

    await writeAuditLog({
      action: "participant.renamed",
      entityType: "participant",
      entityId: participant.id,
      summary: `Updated speaker label to ${participant.label}`
    });

    return participant;
  });
};
