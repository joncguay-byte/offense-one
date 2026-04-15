import { Directory, File, Paths } from "expo-file-system";
import type { RecordingCueVolume } from "./audio-settings";

function encodeBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[chunk & 63] : "=";
  }

  return output;
}

export function buildToneDataUri(frequency: number, durationMs: number) {
  return `data:audio/wav;base64,${encodeBase64(buildToneBytes(frequency, durationMs))}`;
}

function buildToneBytes(frequency: number, durationMs: number) {
  const sampleRate = 8000;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.sin((Math.PI * index) / sampleCount);
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.65 * envelope;
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }

  return new Uint8Array(buffer);
}

function cueDirectory() {
  const directory = new Directory(Paths.cache, "offense-one-cues");
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

export async function ensureCueFile(name: "start" | "stop") {
  const cueFile = new File(cueDirectory(), name === "start" ? "recording-start.wav" : "recording-stop.wav");
  if (!cueFile.exists) {
    const bytes =
      name === "start"
        ? buildToneBytes(1760, 180)
        : buildToneBytes(740, 260);
    cueFile.create({ overwrite: true, intermediates: true });
    cueFile.write(bytes);
  }

  return cueFile.uri;
}

export function getCueVolumeLevel(volume: RecordingCueVolume) {
  if (volume === "soft") {
    return 0.5;
  }

  if (volume === "loud") {
    return 1;
  }

  return 0.85;
}
