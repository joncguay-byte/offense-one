import { createReadStream } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import {
  buildNarrativePrompt,
  draftNarrativeSchema,
  type DiarizedTranscript,
  type DraftNarrativeRequest,
  type KnownSpeakerHint,
  type SceneImageContext
} from "@scene-report/shared";
import { env } from "../config.js";
import { materializeEvidenceToLocalPath, readEvidenceBuffer } from "./storage.service.js";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;
const allowPlaceholderAi = env.NODE_ENV !== "production";

function requireAiClient(feature: "audio transcription" | "scene analysis" | "narrative generation") {
  if (client) {
    return client;
  }

  if (allowPlaceholderAi) {
    return null;
  }

  throw new Error(`OpenAI API key is not configured on the hosted API service, so ${feature} is unavailable.`);
}

function secondsToMs(value: number | string | undefined) {
  if (value === undefined) {
    return 0;
  }

  const numeric = typeof value === "string" ? Number(value) : value;
  return Math.round(numeric * 1000);
}

function mimeTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function audioMimeTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".wav") {
    return "audio/wav";
  }
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".aac") {
    return "audio/aac";
  }
  if (extension === ".m4a" || extension === ".mp4") {
    return "audio/mp4";
  }
  return "audio/mp4";
}

function buildSingleSpeakerTranscript(text: string, knownSpeakers: KnownSpeakerHint[] = []): DiarizedTranscript {
  const trimmedText = text.trim() || "Audio was transcribed, but no text content was returned.";
  return applyKnownSpeakerHints({
    language: "en",
    speakers: [{ speakerKey: "speaker_1", displayName: null, role: null }],
    segments: [
      {
        speakerKey: "speaker_1",
        startMs: 0,
        endMs: Math.max(4000, trimmedText.split(/\s+/).length * 450),
        text: trimmedText
      }
    ]
  }, knownSpeakers);
}

async function fallbackTranscribeAudio(localPath: string, knownSpeakers: KnownSpeakerHint[] = []) {
  const aiClient = requireAiClient("audio transcription");
  if (!aiClient) {
    throw new Error("OpenAI client is unavailable for fallback transcription.");
  }

  const fallbackResponse = await aiClient.audio.transcriptions.create({
    file: createReadStream(localPath),
    model: "whisper-1",
    response_format: "text"
  } as never);

  const fallbackText =
    typeof fallbackResponse === "string"
      ? fallbackResponse
      : String((fallbackResponse as { text?: unknown }).text || "");

  return buildSingleSpeakerTranscript(fallbackText, knownSpeakers);
}

function applyKnownSpeakerHints(
  transcript: DiarizedTranscript,
  knownSpeakers: KnownSpeakerHint[] = []
) {
  if (knownSpeakers.length === 0) {
    return transcript;
  }

  const nextSpeakers = [...transcript.speakers];
  const officerHint = knownSpeakers.find((speaker) => speaker.role === "OFFICER") || knownSpeakers[0];
  const firstSpeaker = nextSpeakers[0];
  if (officerHint && firstSpeaker) {
    firstSpeaker.displayName = officerHint.displayName;
    firstSpeaker.role = officerHint.role;
  }

  return {
    ...transcript,
    speakers: nextSpeakers
  };
}

export async function diarizeAudioFromEvidence(filePath: string, knownSpeakers: KnownSpeakerHint[] = []): Promise<DiarizedTranscript> {
  const aiClient = requireAiClient("audio transcription");
  if (!aiClient) {
    return applyKnownSpeakerHints({
      language: "en",
      speakers: [
        { speakerKey: "speaker_1", displayName: null, role: null },
        { speakerKey: "speaker_2", displayName: null, role: null }
      ],
      segments: [
        {
          speakerKey: "speaker_1",
          startMs: 0,
          endMs: 4200,
          text: "Placeholder diarized transcript. Connect OpenAI transcription for live output."
        },
        {
          speakerKey: "speaker_2",
          startMs: 4500,
          endMs: 8100,
          text: "This record is a scaffold so the rest of the workflow can be built now."
        }
      ]
    }, knownSpeakers);
  }

  const localPath = await materializeEvidenceToLocalPath(filePath);
  let transcription: unknown;
  try {
    transcription = await aiClient.audio.transcriptions.create({
      file: createReadStream(localPath),
      model: "gpt-4o-transcribe-diarize",
      response_format: "diarized_json",
      chunking_strategy: "auto"
    } as never);
  } catch (error) {
    return fallbackTranscribeAudio(localPath, knownSpeakers).catch(() => {
      throw error;
    });
  }

  const payload = transcription as unknown as Record<string, unknown>;
  const rawSegments = Array.isArray(payload.segments) ? payload.segments as Array<Record<string, unknown>> : [];
  const segments = rawSegments.map((segment, index) => {
    const speakerKey = String(segment.speaker || segment.speaker_id || `speaker_${index + 1}`);
    return {
      speakerKey,
      startMs: secondsToMs(segment.start as number | string | undefined),
      endMs: secondsToMs(segment.end as number | string | undefined),
      text: String(segment.text || "")
    };
  });

  const speakers = Array.from(new Set(segments.map((segment) => segment.speakerKey))).map((speakerKey) => ({
    speakerKey,
    displayName: null,
    role: null
  }));

  return applyKnownSpeakerHints({
    language: String(payload.language || "en"),
    speakers,
    segments
  }, knownSpeakers);
}

export async function diarizeAudioFromEvidenceWithReferences(
  filePath: string,
  knownSpeakers: KnownSpeakerHint[] = [],
  referenceClips: Array<{ displayName: string; filePath: string }> = []
): Promise<DiarizedTranscript> {
  const aiClient = requireAiClient("audio transcription");
  if (!aiClient || referenceClips.length === 0) {
    return diarizeAudioFromEvidence(filePath, knownSpeakers);
  }

  const localPath = await materializeEvidenceToLocalPath(filePath);
  const knownSpeakerReferences = await Promise.all(
    referenceClips.map(async (clip) => {
      const buffer = await readEvidenceBuffer(clip.filePath);
      return `data:${audioMimeTypeForPath(clip.filePath)};base64,${buffer.toString("base64")}`;
    })
  );

  let transcription: unknown;
  try {
    transcription = await aiClient.audio.transcriptions.create({
      file: createReadStream(localPath),
      model: "gpt-4o-transcribe-diarize",
      response_format: "diarized_json",
      chunking_strategy: "auto",
      extra_body: {
        known_speaker_names: referenceClips.map((clip) => clip.displayName),
        known_speaker_references: knownSpeakerReferences
      }
    } as never);
  } catch (error) {
    return fallbackTranscribeAudio(localPath, knownSpeakers).catch(() => {
      throw error;
    });
  }

  const payload = transcription as unknown as Record<string, unknown>;
  const rawSegments = Array.isArray(payload.segments) ? payload.segments as Array<Record<string, unknown>> : [];
  const segments = rawSegments.map((segment, index) => {
    const speakerKey = String(segment.speaker || segment.speaker_id || `speaker_${index + 1}`);
    return {
      speakerKey,
      startMs: secondsToMs(segment.start as number | string | undefined),
      endMs: secondsToMs(segment.end as number | string | undefined),
      text: String(segment.text || "")
    };
  });

  const speakers = Array.from(new Set(segments.map((segment) => segment.speakerKey))).map((speakerKey) => ({
    speakerKey,
    displayName: referenceClips.find((clip) => clip.displayName === speakerKey)?.displayName || null,
    role: null
  }));

  return applyKnownSpeakerHints({
    language: String(payload.language || "en"),
    speakers,
    segments
  }, knownSpeakers);
}

export async function analyzeSceneImages(imageInputs: Array<{ path: string; sourceKind?: "SCENE" | "CALL_FOR_SERVICE" }>): Promise<SceneImageContext[]> {
  const aiClient = requireAiClient("scene analysis");
  if (!aiClient || imageInputs.length === 0) {
    return imageInputs.length === 0
      ? []
      : [
          {
            imageId: "scene-image-1",
            sourceKind: imageInputs[0]?.sourceKind || "SCENE",
            observations: [
              "Scene analysis placeholder",
              "Connect image upload and vision inference during integration"
            ]
          }
        ];
  }

  const results: SceneImageContext[] = [];

  for (const imageInput of imageInputs) {
    const imagePath = imageInput.path;
    const fileBuffer = await readEvidenceBuffer(imagePath);
    const base64 = fileBuffer.toString("base64");
    const mimeType = mimeTypeForPath(imagePath);
    const response = await aiClient.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                imageInput.sourceKind === "CALL_FOR_SERVICE"
                  ? "Read this police call-for-service image and list only concrete details visible in the text or layout, such as call nature, address, timestamps, or dispatch notes. Do not speculate."
                  : "List only concrete, observable scene facts from this law-enforcement scene image. Use short bullet-style sentences with no speculation."
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
              detail: "high"
            }
          ]
        }
      ]
    });

    results.push({
      imageId: path.basename(imagePath),
      sourceKind: imageInput.sourceKind || "SCENE",
      observations: response.output_text
        .split("\n")
        .map((line) => line.replace(/^[\-\*\d\.\s]+/, "").trim())
        .filter(Boolean)
    });
  }

  return results;
}

export async function generateNarrativeDraft(
  request: DraftNarrativeRequest,
  transcript: DiarizedTranscript,
  sceneContext: SceneImageContext[]
) {
  const prompt = buildNarrativePrompt({
    request,
    transcript,
    sceneContext
  });

  const aiClient = requireAiClient("narrative generation");
  if (!aiClient) {
    return {
      body: [
        "On the listed date and time, officers responded to the reported call for service.",
        "The draft below was generated from captured audio and scene imagery and requires officer review before use.",
        "",
        `Summary basis: ${request.incidentTitle}`,
        "",
        transcript.segments
          .map((segment) => `[${segment.speakerKey}] ${segment.text}`)
          .join("\n")
      ].join("\n"),
      citations: transcript.segments.map((segment, index) => ({
        sourceType: "audio_segment",
        sourceId: `${segment.speakerKey}-${index + 1}`,
        note: `${segment.startMs}ms-${segment.endMs}ms`,
        sourceLabel: segment.speakerKey,
        excerpt: segment.text
      })),
      confidence: {
        overall: "low" as const,
        notes: [
          "OpenAI API key is not configured; generated body is placeholder output.",
          "Enable vision and transcription integrations before field use."
        ]
      }
    };
  }

  const response = await aiClient.responses.create({
    model: "gpt-4.1",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "draft_narrative",
        schema: draftNarrativeSchema
      }
    }
  });

  return JSON.parse(response.output_text || "{}") as {
    body: string;
    citations: Array<{ sourceType: string; sourceId: string; note: string; sourceLabel: string; excerpt: string }>;
    confidence: { overall: "low" | "medium" | "high"; notes: string[] };
  };
}
