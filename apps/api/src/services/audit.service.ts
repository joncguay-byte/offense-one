import { prisma } from "../db.js";

export async function writeAuditLog(input: {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
    }
  });
}
