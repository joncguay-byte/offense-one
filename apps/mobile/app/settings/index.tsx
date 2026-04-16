import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { createAudioPlayer } from "expo-audio";
import * as Updates from "expo-updates";
import { AppButton, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { loadRecordingCueSettings, saveRecordingCueSettings, type RecordingCueSettings, type RecordingCueVolume } from "../../src/lib/audio-settings";
import { loadLocalAccountProfiles, type LocalAccountProfile } from "../../src/lib/auth-preferences";
import { loadApiBaseUrlPreference, saveApiBaseUrlPreference } from "../../src/lib/api-settings";
import { buildToneDataUri, getCueVolumeLevel } from "../../src/lib/recording-cues";
import { getApiBaseUrl, setApiBaseUrl, type AuthUser } from "../../src/lib/api";
import { loadMyVoiceProfile, removeMyVoiceProfile } from "../../src/features/reporting";
import { getStoredThemeMode, saveThemeModePreference, theme, type ThemeMode } from "../../src/ui/theme";

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
  const [apiBaseUrl, setApiBaseUrlInput] = useState(getApiBaseUrl());
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode());
  const [status, setStatus] = useState("Loading saved preferences...");
  const [updateStatus, setUpdateStatus] = useState(Updates.isEnabled ? "Updates are enabled for installed builds." : "Updates are unavailable in Expo Go/dev mode.");

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

    loadApiBaseUrlPreference()
      .then((value) => {
        if (value) {
          setApiBaseUrl(value);
          setApiBaseUrlInput(value);
        }
      })
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

    if (!currentUser.id.startsWith("local-")) {
      setAccountName(currentUser.fullName);
      setAccountEmail(currentUser.email);
      setAccountBadge(currentUser.badgeNumber || "");
      setAccountPassword("");
      return;
    }

    loadLocalAccountProfiles()
      .then((profiles) => {
        const profile = profiles[currentUser.role === "ADMIN" ? "ADMIN" : currentUser.role === "SUPERVISOR" ? "SUPERVISOR" : "OFFICER"];
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
      role: currentUser.role === "ADMIN" ? "ADMIN" : currentUser.role === "SUPERVISOR" ? "SUPERVISOR" : "OFFICER",
      fullName: accountName.trim(),
      email: accountEmail.trim(),
      password: accountPassword,
      badgeNumber: accountBadge.trim() || null
    });
    setStatus(currentUser.id.startsWith("local-") ? "Account name, username, and password saved on this device." : "Account changes saved to the live backend.");
  }

  async function saveApiUrl() {
    try {
      const savedValue = await saveApiBaseUrlPreference(apiBaseUrl);
      setApiBaseUrl(savedValue);
      setApiBaseUrlInput(savedValue || getApiBaseUrl());
      setStatus(savedValue ? "API base URL saved on this device." : "API base URL reset to the app default.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save API base URL.");
    }
  }

  async function testApiUrl() {
    const target = apiBaseUrl.trim() || getApiBaseUrl();
    setStatus(`Testing ${target} ...`);
    try {
      const response = await fetch(`${target}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed with ${response.status}.`);
      }
      setStatus(`API connection succeeded: ${target}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to reach the API.");
    }
  }

  async function checkForUpdates() {
    if (!Updates.isEnabled) {
      setUpdateStatus("In-app updates are not enabled in this development build. They work in EAS production/preview builds after EAS Update is configured.");
      return;
    }

    setUpdateStatus("Checking for app update...");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateStatus("No update is available right now.");
        return;
      }

      setUpdateStatus("Update found. Downloading...");
      await Updates.fetchUpdateAsync();
      setUpdateStatus("Update downloaded. Restarting Offense One...");
      await Updates.reloadAsync();
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : "Unable to check for updates.");
    }
  }

  async function changeThemeMode(nextMode: ThemeMode) {
    try {
      await saveThemeModePreference(nextMode);
      setThemeMode(nextMode);
      setStatus(`${nextMode === "dark" ? "Dark" : "Light"} mode saved. Offense One will restart to apply it.`);
      if (Updates.isEnabled) {
        await Updates.reloadAsync();
      } else {
        setStatus(`${nextMode === "dark" ? "Dark" : "Light"} mode saved. Fully close and reopen the app to apply it here.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save theme preference.");
    }
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

      <SectionCard title="Appearance" subtitle="Choose the app theme. The app will restart once you switch it.">
        <View style={styles.tagRow}>
          <Tag label={`Theme: ${themeMode}`} tone="success" active />
        </View>
        <View style={styles.row}>
          <AppButton label="Light Mode" onPress={() => void changeThemeMode("light")} variant={themeMode === "light" ? "primary" : "ghost"} />
          <AppButton label="Dark Mode" onPress={() => void changeThemeMode("dark")} variant={themeMode === "dark" ? "primary" : "ghost"} />
        </View>
      </SectionCard>

      <SectionCard title="Account and Sign Out" subtitle={currentUser?.id.startsWith("local-") ? "Change the local standalone username/password and sign out when you are done." : "Update your live backend account details and sign out when you are done."}>
        <Text style={styles.preferenceValue}>
          {currentUser?.id.startsWith("local-")
            ? "These changes stay on this device."
            : "These changes update your live backend account."}
        </Text>
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

      <SectionCard title="Backend Connection" subtitle="Point the mobile app at the current API or tunnel URL without reinstalling the app.">
        <View style={styles.tagRow}>
          <Tag label="Editable API URL" tone="success" active />
        </View>
        <TextInput
          value={apiBaseUrl}
          onChangeText={setApiBaseUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://your-tunnel-url.loca.lt/api"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />
        <Text style={styles.preferenceValue}>Include the full `/api` suffix. Example: `https://shaggy-feet-flash.loca.lt/api`</Text>
        <View style={styles.row}>
          <AppButton label="Save API URL" onPress={() => void saveApiUrl()} variant="secondary" />
          <AppButton label="Test Connection" onPress={() => void testApiUrl()} variant="ghost" />
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

      <SectionCard title="Bluetooth and Speech Recognition" subtitle="Bluetooth inputs and speech recognition preferences live here instead of cluttering the recording screen.">
        <View style={styles.tagRow}>
          <Tag label={settings.preferredInputUid ? "Bluetooth/input saved" : "Use recorder to pick input"} tone={settings.preferredInputUid ? "success" : "warning"} active />
          <Tag label="Officer speech recognition planned" tone="warning" />
        </View>
        <Text style={styles.preferenceValue}>
          Bluetooth recording depends on whether Android or iOS exposes your earbuds as a microphone input. Speech recognition will use the signed-in officer profile when the transcription backend is connected.
        </Text>
      </SectionCard>

      <SectionCard title="App Updates" subtitle={updateStatus}>
        <View style={styles.tagRow}>
          <Tag label={Updates.isEnabled ? "OTA ready" : "OTA unavailable here"} tone={Updates.isEnabled ? "success" : "warning"} active />
          <Tag label={`Runtime: ${Updates.runtimeVersion || "not set"}`} />
        </View>
        <Text style={styles.preferenceValue}>
          This checks for over-the-air JavaScript/UI updates. Native changes like new permissions, camera/audio modules, or app store build settings still require a new installed build.
        </Text>
        <View style={styles.row}>
          <AppButton label="Check for App Update" onPress={() => void checkForUpdates()} variant="secondary" />
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
