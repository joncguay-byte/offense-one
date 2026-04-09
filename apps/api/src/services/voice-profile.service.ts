import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";

type VoiceProfileRecord = {
  userId: string;
  displayName: string;
  evidencePath: string;
  updatedAt: string;
};

type VoiceProfileRegistry = Record<string, VoiceProfileRecord>;

function getRegistryPath() {
  return path.join(env.EVIDENCE_STORAGE_PATH, "voice-profiles.json");
}

async function readRegistry(): Promise<VoiceProfileRegistry> {
  try {
    const file = await readFile(getRegistryPath(), "utf8");
    return JSON.parse(file) as VoiceProfileRegistry;
  } catch {
    return {};
  }
}

async function writeRegistry(registry: VoiceProfileRegistry) {
  await mkdir(env.EVIDENCE_STORAGE_PATH, { recursive: true });
  await writeFile(getRegistryPath(), JSON.stringify(registry, null, 2), "utf8");
}

export async function upsertVoiceProfile(input: {
  userId: string;
  displayName: string;
  evidencePath: string;
}) {
  const registry = await readRegistry();
  registry[input.userId] = {
    userId: input.userId,
    displayName: input.displayName,
    evidencePath: input.evidencePath,
    updatedAt: new Date().toISOString()
  };
  await writeRegistry(registry);
  return registry[input.userId];
}

export async function getVoiceProfile(userId: string) {
  const registry = await readRegistry();
  return registry[userId] || null;
}

export async function deleteVoiceProfile(userId: string) {
  const registry = await readRegistry();
  if (!registry[userId]) {
    return false;
  }

  delete registry[userId];
  await writeRegistry(registry);
  return true;
}
