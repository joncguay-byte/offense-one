import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppButton, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { loadRecordingCueSettings, saveRecordingCueSettings, type RecordingCueSettings, type RecordingCueVolume } from "../../src/lib/audio-settings";
import { loadMyVoiceProfile, removeMyVoiceProfile } from "../../src/features/reporting";
import { theme } from "../../src/ui/theme";

export default function SettingsScreen() {
  const [settings, setSettings] = useState<RecordingCueSettings>({
    enabled: true,
    volume: "standard",
    preferredInputUid: null,
    defaultNarrativeStyle: "concise",
    autoIncludeCallForServiceContext: true,
    queueAlertsEnabled: true
  });
  const [hasVoiceProfile, setHasVoiceProfile] = useState(false);
  const [status, setStatus] = useState("Loading saved preferences...");

  useEffect(() => {
    loadRecordingCueSettings()
      .then((nextSettings) => {
        setSettings(nextSettings);
        setStatus("Saved device preferences are ready.");
      })
      .catch(() => {
        setStatus("Using default preferences.");
      });

    loadMyVoiceProfile()
      .then((result) => setHasVoiceProfile(Boolean(result.hasProfile)))
      .catch(() => undefined);
  }, []);

  async function updateSettings(nextPartial: Partial<RecordingCueSettings>) {
    const nextSettings = {
      ...settings,
      ...nextPartial
    };
    setSettings(nextSettings);
    await saveRecordingCueSettings(nextSettings);
    setStatus("Preferences saved on this device.");
  }

  async function setCueVolume(volume: RecordingCueVolume) {
    await updateSettings({ volume });
  }

  return (
    <Screen>
      <HeroCard
        eyebrow="Settings"
        title="Audio and device preferences"
        body="Manage the recording cues and saved microphone behavior that Offense One should reuse each time the app opens."
      />

      <SectionCard title="Recording Cue Sounds" subtitle={status}>
        <View style={styles.tagRow}>
          <Tag label={settings.enabled ? "Cue sounds enabled" : "Cue sounds disabled"} tone={settings.enabled ? "success" : "warning"} active />
          <Tag label={`Volume: ${settings.volume}`} />
        </View>
        <View style={styles.row}>
          <AppButton
            label={settings.enabled ? "Turn Cues Off" : "Turn Cues On"}
            onPress={() => void updateSettings({ enabled: !settings.enabled })}
            variant="secondary"
          />
          <AppButton label="Soft" onPress={() => void setCueVolume("soft")} variant={settings.volume === "soft" ? "primary" : "ghost"} />
          <AppButton label="Standard" onPress={() => void setCueVolume("standard")} variant={settings.volume === "standard" ? "primary" : "ghost"} />
          <AppButton label="Loud" onPress={() => void setCueVolume("loud")} variant={settings.volume === "loud" ? "primary" : "ghost"} />
        </View>
      </SectionCard>

      <SectionCard title="Preferred Microphone" subtitle="The audio screen will try to restore this saved input when the device exposes it again.">
        <View style={styles.tagRow}>
          <Tag label={settings.preferredInputUid ? "Preferred input saved" : "No saved input"} tone={settings.preferredInputUid ? "success" : "warning"} active />
        </View>
        <Text style={styles.preferenceValue}>
          {settings.preferredInputUid || "No microphone source has been saved yet. Pick one from the Audio screen and it will be remembered here."}
        </Text>
        <View style={styles.row}>
          <AppButton
            label="Clear Saved Input"
            onPress={() => void updateSettings({ preferredInputUid: null })}
            variant="ghost"
            disabled={!settings.preferredInputUid}
          />
        </View>
      </SectionCard>

      <SectionCard title="Report Defaults" subtitle="These settings affect how the Draft Report screen seeds new narratives.">
        <View style={styles.tagRow}>
          <Tag label={`Narrative style: ${settings.defaultNarrativeStyle || "concise"}`} active />
          <Tag label={settings.autoIncludeCallForServiceContext ? "Call context on" : "Call context off"} tone={settings.autoIncludeCallForServiceContext ? "success" : "warning"} />
        </View>
        <View style={styles.row}>
          <AppButton
            label="Concise"
            onPress={() => void updateSettings({ defaultNarrativeStyle: "concise" })}
            variant={settings.defaultNarrativeStyle === "concise" ? "primary" : "ghost"}
          />
          <AppButton
            label="Detailed"
            onPress={() => void updateSettings({ defaultNarrativeStyle: "detailed" })}
            variant={settings.defaultNarrativeStyle === "detailed" ? "primary" : "ghost"}
          />
          <AppButton
            label={settings.autoIncludeCallForServiceContext ? "Disable Call Context" : "Enable Call Context"}
            onPress={() => void updateSettings({ autoIncludeCallForServiceContext: !settings.autoIncludeCallForServiceContext })}
            variant="secondary"
          />
        </View>
      </SectionCard>

      <SectionCard title="Alerts" subtitle="Local preference for whether queue and workflow alerts should stay emphasized in the mobile experience.">
        <View style={styles.tagRow}>
          <Tag label={settings.queueAlertsEnabled ? "Queue alerts emphasized" : "Queue alerts reduced"} tone={settings.queueAlertsEnabled ? "success" : "warning"} active />
        </View>
        <View style={styles.row}>
          <AppButton
            label={settings.queueAlertsEnabled ? "Reduce Alert Emphasis" : "Emphasize Alerts"}
            onPress={() => void updateSettings({ queueAlertsEnabled: !settings.queueAlertsEnabled })}
            variant="secondary"
          />
        </View>
      </SectionCard>

      <SectionCard title="Officer Voice Profile" subtitle="Manage the reusable officer voice identity used to improve diarized attribution.">
        <View style={styles.tagRow}>
          <Tag label={hasVoiceProfile ? "Voice profile saved" : "No saved voice profile"} tone={hasVoiceProfile ? "success" : "warning"} active />
        </View>
        <View style={styles.row}>
          <AppButton
            label="Delete Voice Profile"
            onPress={() =>
              void removeMyVoiceProfile()
                .then(() => {
                  setHasVoiceProfile(false);
                  setStatus("Saved voice profile removed.");
                })
                .catch(() => {
                  setStatus("Unable to delete saved voice profile.");
                })
            }
            variant="danger"
            disabled={!hasVoiceProfile}
          />
        </View>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  preferenceValue: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  }
});
