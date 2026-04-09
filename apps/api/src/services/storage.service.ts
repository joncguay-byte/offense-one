import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { env } from "../config.js";

const s3Client =
  env.STORAGE_BACKEND === "s3" && env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY,
          secretAccessKey: env.S3_SECRET_KEY
        }
      })
    : null;

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildObjectKey(incidentId: string, fileName: string) {
  return `${incidentId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function ensureEvidenceDirectory(incidentId: string) {
  const incidentDir = path.join(env.EVIDENCE_STORAGE_PATH, incidentId);
  await mkdir(incidentDir, { recursive: true });
  return incidentDir;
}

export async function persistEvidenceUpload(input: {
  incidentId: string;
  fileName: string;
  mimeType: string;
  stream: Readable;
}) {
  const objectKey = buildObjectKey(input.incidentId, input.fileName);

  if (env.STORAGE_BACKEND === "s3") {
    if (!s3Client || !env.S3_BUCKET) {
      throw new Error("S3 storage is enabled but not fully configured.");
    }

    const buffer = await streamToBuffer(input.stream);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Body: buffer,
        ContentType: input.mimeType
      })
    );

    return {
      path: `s3://${env.S3_BUCKET}/${objectKey}`,
      storageBackend: "s3" as const
    };
  }

  const incidentDir = await ensureEvidenceDirectory(input.incidentId);
  const localPath = path.join(incidentDir, path.basename(objectKey));
  await pipeline(input.stream, createWriteStream(localPath));

  return {
    path: localPath,
    storageBackend: "local" as const
  };
}

export async function materializeEvidenceToLocalPath(storedPath: string) {
  if (!storedPath.startsWith("s3://")) {
    return storedPath;
  }

  if (!s3Client) {
    throw new Error("Cannot read S3 evidence without S3 configuration.");
  }

  const withoutScheme = storedPath.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  const bucket = withoutScheme.slice(0, slashIndex);
  const key = withoutScheme.slice(slashIndex + 1);
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );

  if (!response.Body || !(response.Body instanceof Readable)) {
    throw new Error("Unable to download S3 evidence.");
  }

  const buffer = await streamToBuffer(response.Body);
  const tempPath = path.join(os.tmpdir(), path.basename(key));
  await writeFile(tempPath, buffer);
  return tempPath;
}

export async function readEvidenceBuffer(storedPath: string) {
  if (!storedPath.startsWith("s3://")) {
    return readFile(storedPath);
  }

  const localPath = await materializeEvidenceToLocalPath(storedPath);
  return readFile(localPath);
}
