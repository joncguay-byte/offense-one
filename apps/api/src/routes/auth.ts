import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";
import { createSessionToken, hashPassword, verifyPassword } from "../services/auth.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  badgeNumber: z.string().trim().optional(),
  role: z.enum(["OFFICER", "SUPERVISOR", "ADMIN"]).default("OFFICER")
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", async (request, reply) => {
    if (env.AUTH_MODE !== "demo") {
      reply.code(400);
      return { message: "Password signup is disabled while AUTH_MODE=oidc." };
    }

    const body = signupSchema.parse(request.body);
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (existingUser) {
      reply.code(409);
      return { message: "An account with that email already exists." };
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        fullName: body.fullName,
        badgeNumber: body.badgeNumber || null,
        role: body.role,
        passwordHash: hashPassword(body.password)
      }
    });

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    reply.code(201);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        badgeNumber: user.badgeNumber
      }
    };
  });

  app.post("/auth/login", async (request, reply) => {
    if (env.AUTH_MODE !== "demo") {
      reply.code(400);
      return { message: "Password login is disabled while AUTH_MODE=oidc. Use an OIDC bearer token instead." };
    }

    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      reply.code(401);
      return { message: "Invalid credentials." };
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        badgeNumber: user.badgeNumber
      }
    };
  });

  app.get("/auth/me", async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { message: "Unauthorized." };
    }

    const user = await prisma.user.findUnique({
      where: { id: request.authUser.sub }
    });

    if (!user) {
      reply.code(404);
      return { message: "User not found." };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        badgeNumber: user.badgeNumber
      }
    };
  });
};
