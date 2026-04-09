import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      sub: string;
      email: string;
      role: "OFFICER" | "SUPERVISOR" | "ADMIN";
      exp: number;
    };
  }
}
