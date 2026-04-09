import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env")
});

const envSchema = z.object({
  PORT: z.string().default("4000").transform(Number),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENAI_API_KEY: z.string().optional(),
  DATABASE_URL: z.string(),
  EVIDENCE_STORAGE_PATH: z.string().default("./uploads"),
  STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  EXPORT_ADAPTER: z.enum(["local-json", "webhook"]).default("local-json"),
  EXPORT_WEBHOOK_URL: z.string().optional(),
  EXPO_PUSH_ACCESS_TOKEN: z.string().optional(),
  AUTH_MODE: z.enum(["demo", "oidc"]).default("demo"),
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_JWKS_URL: z.string().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_ROLES_CLAIM: z.string().default("realm_access.roles"),
  JWT_SECRET: z.string().min(8),
  DEMO_USER_EMAIL: z.string().email().default("officer@example.gov"),
  DEMO_USER_PASSWORD: z.string().min(8).default("ChangeMe123!"),
  DEMO_SUPERVISOR_EMAIL: z.string().email().default("supervisor@example.gov"),
  DEMO_SUPERVISOR_PASSWORD: z.string().min(8).default("ChangeMe123!")
});

export const env = envSchema.parse(process.env);
