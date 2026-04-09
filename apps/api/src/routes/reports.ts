import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { writeAuditLog } from "../services/audit.service.js";
import { enqueueJob } from "../services/job.service.js";
import { notifyUsers } from "../services/notification.service.js";

const prismaWithIncidentSupervisor = prisma as typeof prisma & {
  incident: {
    findUniqueOrThrow: (...args: any[]) => Promise<any>;
  };
};

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "edit"]),
  body: z.string().optional(),
  reviewNotes: z.string().optional()
});

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/reports/:reportId", async (request) => {
    const params = z.object({ reportId: z.string() }).parse(request.params);
    return prisma.generatedReport.findUniqueOrThrow({
      where: { id: params.reportId },
      include: {
        incident: true,
        reviewedBy: true
      }
    });
  });

  app.patch("/reports/:reportId/review", async (request, reply) => {
    const params = z.object({ reportId: z.string() }).parse(request.params);
    const body = reviewSchema.parse(request.body);

    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const existing = await prisma.generatedReport.findUniqueOrThrow({
      where: { id: params.reportId }
    });

    const nextStatus =
      body.action === "approve"
        ? "APPROVED"
        : body.action === "reject"
          ? "REJECTED"
          : "OFFICER_EDITED";

    const updated = await prisma.generatedReport.update({
      where: { id: params.reportId },
      data: {
        body: body.body ?? existing.body,
        reviewNotes: body.reviewNotes,
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedById: request.authUser.sub
      }
    });

    await prisma.incident.update({
      where: { id: existing.incidentId },
      data: {
        status: nextStatus === "APPROVED" ? "APPROVED" : "REVIEW"
      }
    });

    await writeAuditLog({
      userId: request.authUser.sub,
      action: `report.${body.action}`,
      entityType: "generated_report",
      entityId: updated.id,
      summary: `Report ${body.action}d by ${request.authUser.email}`,
      metadata: {
        reviewNotes: body.reviewNotes
      }
    });

    if (body.action === "approve") {
      const incident = await prismaWithIncidentSupervisor.incident.findUniqueOrThrow({
        where: { id: existing.incidentId },
        select: { createdById: true, assignedSupervisorId: true, caseNumber: true, title: true }
      });
      await notifyUsers({
        userIds: [incident.createdById, incident.assignedSupervisorId || ""],
        title: "Report approved",
        body: `${incident.caseNumber} - ${incident.title}: a supervisor approved the report draft.`,
        type: "REPORT_APPROVED",
        metadata: { reportId: updated.id, incidentId: existing.incidentId }
      });
    }

    if (body.action === "approve") {
      const exportJob = await enqueueJob({
        incidentId: existing.incidentId,
        type: "EXPORT_REPORT",
        payload: { reportId: updated.id }
      });

      return { report: updated, exportJobId: exportJob.id };
    }

    return { report: updated };
  });
};
