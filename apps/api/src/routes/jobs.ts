import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const prismaWithJobs = prisma as typeof prisma & {
  job: {
    findUniqueOrThrow: (...args: any[]) => Promise<any>;
  };
};

export const jobRoutes: FastifyPluginAsync = async (app) => {
  app.get("/jobs", async (request) => {
    const query = z.object({
      incidentId: z.string().optional(),
      status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).optional(),
      take: z.coerce.number().min(1).max(100).default(20)
    }).parse(request.query);

    return prismaWithJobs.job.findMany({
      where: {
        incidentId: query.incidentId,
        status: query.status
      },
      orderBy: { createdAt: "desc" },
      take: query.take
    });
  });

  app.get("/jobs/:jobId", async (request) => {
    const params = z.object({ jobId: z.string() }).parse(request.params);
    return prismaWithJobs.job.findUniqueOrThrow({
      where: { id: params.jobId }
    });
  });
};
