import { File, Paths } from "expo-file-system";

export type RecordingCueVolume = "soft" | "standard" | "loud";

export type RecordingCueSettings = {
  enabled: boolean;
  volume: RecordingCueVolume;
  preferredInputUid?: string | null;
  defaultNarrativeStyle?: "concise" | "detailed";
  autoIncludeCallForServiceContext?: boolean;
  queueAlertsEnabled?: boolean;
};

const DEFAULT_SETTINGS: RecordingCueSettings = {
  enabled: true,
  volume: "standard",
  preferredInputUid: null,
  defaultNarrativeStyle: "concise",
  autoIncludeCallForServiceContext: true,
  queueAlertsEnabled: true
};

const settingsFile = new File(Paths.document, "offense-one-audio-settings.json");

export async function loadRecordingCueSettings(): Promise<RecordingCueSettings> {
  try {
    if (!settingsFile.exists) {
      return DEFAULT_SETTINGS;
    }

    const content = await settingsFile.text();
    const parsed = JSON.parse(content) as Partial<RecordingCueSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      volume: parsed.volume === "soft" || parsed.volume === "standard" || parsed.volume === "loud" ? parsed.volume : DEFAULT_SETTINGS.volume,
      preferredInputUid: typeof parsed.preferredInputUid === "string" ? parsed.preferredInputUid : null,
      defaultNarrativeStyle: parsed.defaultNarrativeStyle === "detailed" ? "detailed" : "concise",
      autoIncludeCallForServiceContext: typeof parsed.autoIncludeCallForServiceContext === "boolean" ? parsed.autoIncludeCallForServiceContext : DEFAULT_SETTINGS.autoIncludeCallForServiceContext,
      queueAlertsEnabled: typeof parsed.queueAlertsEnabled === "boolean" ? parsed.queueAlertsEnabled : DEFAULT_SETTINGS.queueAlertsEnabled
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveRecordingCueSettings(settings: RecordingCueSettings) {
  if (!settingsFile.exists) {
    settingsFile.create({ intermediates: true, overwrite: true });
  }

  settingsFile.write(JSON.stringify(settings));
}
