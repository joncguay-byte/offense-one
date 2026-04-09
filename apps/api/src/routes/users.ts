import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { registerPushToken } from "../services/push.service.js";
import { persistEvidenceUpload } from "../services/storage.service.js";
import { upsertVoiceProfile, getVoiceProfile, deleteVoiceProfile } from "../services/voice-profile.service.js";

const registerPushTokenSchema = z.object({
  provider: z.enum(["EXPO", "APNS", "FCM"]),
  token: z.string().min(1)
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/users/supervisors", async () => prisma.user.findMany({
    where: { role: "SUPERVISOR" },
    select: {
      id: true,
      email: true,
      fullName: true,
      badgeNumber: true,
      role: true
    },
    orderBy: { fullName: "asc" }
  }));

  app.post("/users/me/push-tokens", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const body = registerPushTokenSchema.parse(request.body);
    return registerPushToken({
      userId: request.authUser.sub,
      provider: body.provider,
      token: body.token
    });
  });

  app.get("/users/me/voice-profile", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const user = await prisma.user.findUnique({
      where: { id: request.authUser.sub },
      select: { id: true, fullName: true }
    });

    if (!user) {
      reply.code(404);
      return { message: "User not found." };
    }

    const profile = await getVoiceProfile(user.id);
    return {
      hasProfile: !!profile,
      profile
    };
  });

  app.post("/users/me/voice-profile", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const upload = await request.file();

    if (!upload) {
      reply.code(400);
      return { message: "No file was uploaded." };
    }

    const user = await prisma.user.findUnique({
      where: { id: request.authUser.sub },
      select: { id: true, fullName: true }
    });

    if (!user) {
      reply.code(404);
      return { message: "User not found." };
    }

    const stored = await persistEvidenceUpload({
      incidentId: `voice-profile-${user.id}`,
      fileName: upload.filename,
      mimeType: upload.mimetype,
      stream: upload.file
    });

    const profile = await upsertVoiceProfile({
      userId: user.id,
      displayName: user.fullName,
      evidencePath: stored.path
    });

    reply.code(201);
    return {
      hasProfile: true,
      profile
    };
  });

  app.delete("/users/me/voice-profile", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const deleted = await deleteVoiceProfile(request.authUser.sub);
    return {
      hasProfile: false,
      deleted
    };
  });
};
