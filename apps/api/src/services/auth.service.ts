import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "../db.js";
import { env } from "../config.js";

export type SessionPayload = {
  sub: string;
  email: string;
  role: "OFFICER" | "SUPERVISOR" | "ADMIN";
  exp: number;
};

function createHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  return createHash(`${env.JWT_SECRET}:${password}`);
}

export function verifyPassword(password: string, passwordHash: string) {
  return hashPassword(password) === passwordHash;
}

function signValue(value: string) {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(value).digest("hex");
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function getRoleFromClaims(payload: Record<string, unknown>): "OFFICER" | "SUPERVISOR" | "ADMIN" {
  const segments = env.OIDC_ROLES_CLAIM.split(".");
  let current: unknown = payload;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  const roles = Array.isArray(current) ? current.map(String) : [];
  if (roles.some((role) => role.toLowerCase().includes("admin"))) {
    return "ADMIN";
  }
  if (roles.some((role) => role.toLowerCase().includes("supervisor"))) {
    return "SUPERVISOR";
  }
  return "OFFICER";
}

const jwks = env.OIDC_ISSUER_URL
  ? createRemoteJWKSet(new URL(env.OIDC_JWKS_URL || `${env.OIDC_ISSUER_URL}/protocol/openid-connect/certs`))
  : null;

export async function createSessionToken(payload: Omit<SessionPayload, "exp">, expiresInSeconds = 60 * 60 * 12) {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const encoded = encodePayload(fullPayload);
  const signature = signValue(encoded);
  const token = `${encoded}.${signature}`;

  await prisma.session.create({
    data: {
      tokenHash: createHash(token),
      userId: payload.sub,
      expiresAt: new Date(fullPayload.exp * 1000)
    }
  });

  return token;
}

export async function verifyDemoSessionToken(token: string): Promise<SessionPayload | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = signValue(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: createHash(token) }
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return payload;
}

export async function verifyOidcBearerToken(token: string): Promise<SessionPayload | null> {
  if (!jwks || !env.OIDC_ISSUER_URL) {
    return null;
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.OIDC_ISSUER_URL,
    audience: env.OIDC_AUDIENCE || undefined
  });

  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email || typeof payload.sub !== "string") {
    return null;
  }

  const role = getRoleFromClaims(payload as Record<string, unknown>);
  const fullName =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : email;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      role
    },
    create: {
      email,
      fullName,
      role,
      passwordHash: hashPassword(`oidc:${payload.sub}`)
    }
  });

  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: typeof payload.exp === "number" ? payload.exp : Math.floor(Date.now() / 1000) + 3600
  };
}

export async function verifyAnyAccessToken(token: string): Promise<SessionPayload | null> {
  if (env.AUTH_MODE === "oidc") {
    return verifyOidcBearerToken(token);
  }

  return verifyDemoSessionToken(token);
}

export async function seedDemoUsers() {
  if (env.AUTH_MODE !== "demo") {
    return;
  }

  const demoUsers = [
    {
      email: env.DEMO_USER_EMAIL,
      password: env.DEMO_USER_PASSWORD,
      fullName: "Demo Officer",
      badgeNumber: "1001",
      role: "OFFICER" as const
    },
    {
      email: env.DEMO_SUPERVISOR_EMAIL,
      password: env.DEMO_SUPERVISOR_PASSWORD,
      fullName: "Demo Supervisor",
      badgeNumber: "2001",
      role: "SUPERVISOR" as const
    }
  ];

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        badgeNumber: user.badgeNumber,
        role: user.role,
        passwordHash: hashPassword(user.password)
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        badgeNumber: user.badgeNumber,
        role: user.role,
        passwordHash: hashPassword(user.password)
      }
    });
  }
}
