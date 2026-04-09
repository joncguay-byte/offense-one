import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listNotifications, markNotificationRead } from "../services/notification.service.js";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/notifications", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const query = z.object({
      take: z.coerce.number().min(1).max(100).default(30)
    }).parse(request.query);

    return listNotifications(request.authUser.sub, query.take);
  });

  app.patch("/notifications/:notificationId/read", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const params = z.object({ notificationId: z.string() }).parse(request.params);
    return markNotificationRead(params.notificationId);
  });
};
