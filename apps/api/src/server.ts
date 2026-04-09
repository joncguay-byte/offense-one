import { authRoutes } from "./routes/auth.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config.js";
import { verifyAnyAccessToken } from "./services/auth.service.js";
import { seedDemoUsers } from "./services/auth.service.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { healthRoutes } from "./routes/health.js";
import { incidentRoutes } from "./routes/incidents.js";
import { jobRoutes } from "./routes/jobs.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reportRoutes } from "./routes/reports.js";
import { userRoutes } from "./routes/users.js";
import { startJobWorker } from "./services/job.service.js";

const app = Fastify({
  logger: env.NODE_ENV !== "test"
});

await app.register(cors, { origin: true });
await app.register(multipart);
await app.register(swagger, {
  openapi: {
    info: {
      title: "Offense One API",
      version: "0.1.0"
    }
  }
});
await app.register(swaggerUi, {
  routePrefix: "/docs"
});

app.addHook("preHandler", async (request, reply) => {
  if (
    request.url.startsWith("/api/health") ||
    request.url.startsWith("/api/auth/login") ||
    request.url.startsWith("/docs")
  ) {
    return;
  }

  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!token) {
    reply.code(401);
    throw new Error("Missing bearer token.");
  }

  const verifiedSession = await verifyAnyAccessToken(token);
  if (!verifiedSession) {
    reply.code(401);
    throw new Error("Invalid or expired token.");
  }

  request.authUser = verifiedSession;
});

await app.register(authRoutes, { prefix: "/api" });
await app.register(healthRoutes, { prefix: "/api" });
await app.register(incidentRoutes, { prefix: "/api" });
await app.register(evidenceRoutes, { prefix: "/api" });
await app.register(jobRoutes, { prefix: "/api" });
await app.register(notificationRoutes, { prefix: "/api" });
await app.register(reportRoutes, { prefix: "/api" });
await app.register(userRoutes, { prefix: "/api" });

await seedDemoUsers();
startJobWorker();

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const statusCode = reply.statusCode >= 400 ? reply.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const stack = error instanceof Error ? error.stack : undefined;
  reply.status(statusCode).send({
    message,
    stack: env.NODE_ENV === "development" ? stack : undefined
  });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
