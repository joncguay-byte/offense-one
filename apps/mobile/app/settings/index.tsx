import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { createAudioPlayer } from "expo-audio";
import { AppButton, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { loadRecordingCueSettings, saveRecordingCueSettings, type RecordingCueSettings, type RecordingCueVolume } from "../../src/lib/audio-settings";
import { loadLocalAccountProfiles, type LocalAccountProfile } from "../../src/lib/auth-preferences";
import { buildToneDataUri, getCueVolumeLevel } from "../../src/lib/recording-cues";
import type { AuthUser } from "../../src/lib/api";
import { loadMyVoiceProfile, removeMyVoiceProfile } from "../../src/features/reporting";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser: AuthUser | null;
  onLocalAccountUpdated: (profile: LocalAccountProfile) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function SettingsScreen({ currentUser, onLocalAccountUpdated, onSignOut }: Props) {
  const cuePreviewPlayer = useMemo(() => createAudioPlayer({ uri: buildToneDataUri(1046, 140) }), []);
  const [settings, setSettings] = useState<RecordingCueSettings>({
    enabled: true,
    volume: "standard",
    preferredInputUid: null,
    defaultNarrativeStyle: "concise",
    autoIncludeCallForServiceContext: true,
    queueAlertsEnabled: true
  });
  const [hasVoiceProfile, setHasVoiceProfile] = useState(false);
  const [accountName, setAccountName] = useState(currentUser?.fullName || "");
  const [accountEmail, setAccountEmail] = useState(currentUser?.email || "");
  const [accountBadge, setAccountBadge] = useState(currentUser?.badgeNumber || "");
  const [accountPassword, setAccountPassword] = useState("");
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

  useEffect(() => {
    if (!currentUser) {
      setAccountName("");
      setAccountEmail("");
      setAccountBadge("");
      setAccountPassword("");
      return;
    }

    loadLocalAccountProfiles()
      .then((profiles) => {
        const profile = profiles[currentUser.role === "SUPERVISOR" ? "SUPERVISOR" : "OFFICER"];
        setAccountName(profile.fullName);
        setAccountEmail(profile.email);
        setAccountBadge(profile.badgeNumber || "");
        setAccountPassword(profile.password);
      })
      .catch(() => {
        setAccountName(currentUser.fullName);
        setAccountEmail(currentUser.email);
        setAccountBadge(currentUser.badgeNumber || "");
      });
  }, [currentUser]);

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
    try {
      cuePreviewPlayer.volume = getCueVolumeLevel(volume);
      cuePreviewPlayer.pause();
      await cuePreviewPlayer.seekTo(0);
      cuePreviewPlayer.play();
      setStatus(`${volume[0].toUpperCase()}${volume.slice(1)} cue preview played.`);
    } catch {
      setStatus("Cue volume saved, but this device did not play the preview sound.");
    }
  }

  async function saveAccount() {
    if (!currentUser) {
      setStatus("Sign in before changing account settings.");
      return;
    }

    if (!accountName.trim() || !accountEmail.trim() || !accountPassword) {
      setStatus("Name, username/email, and password are required.");
      return;
    }

    await onLocalAccountUpdated({
      role: currentUser.role === "SUPERVISOR" ? "SUPERVISOR" : "OFFICER",
      fullName: accountName.trim(),
      email: accountEmail.trim(),
      password: accountPassword,
      badgeNumber: accountBadge.trim() || null
    });
    setStatus("Account name, username, and password saved on this device.");
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

      <SectionCard title="Account and Sign Out" subtitle="Change the local standalone username/password and sign out when you are done.">
        <View style={styles.tagRow}>
          <Tag label={currentUser ? `${currentUser.role}` : "Not signed in"} tone={currentUser ? "success" : "warning"} active />
        </View>
        <TextInput
          value={accountName}
          onChangeText={setAccountName}
          placeholder="Display name"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={accountEmail}
          onChangeText={setAccountEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Username / email"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={accountBadge}
          onChangeText={setAccountBadge}
          placeholder="Badge number"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <TextInput
          value={accountPassword}
          onChangeText={setAccountPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <View style={styles.row}>
          <AppButton label="Save Account Changes" onPress={() => void saveAccount()} disabled={!currentUser} />
          <AppButton label="Sign Out" onPress={() => void onSignOut()} disabled={!currentUser} variant="ghost" />
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
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    color: theme.colors.ink,
    fontSize: 16
  },
  preferenceValue: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  }
});
