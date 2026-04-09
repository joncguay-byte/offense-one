import { useEffect, useMemo, useState } from "react";
import { AudioModule, RecordingInput, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { StyleSheet, Text, View } from "react-native";
import { attachAudioEvidence, attachOfficerVoiceReference, loadMyVoiceProfile, saveMyVoiceProfile } from "../../src/features/reporting";
import { loadRecordingCueSettings, saveRecordingCueSettings, type RecordingCueVolume } from "../../src/lib/audio-settings";
import type { AuthUser } from "../../src/lib/api";
import { AppButton, HeroCard, MetricCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser: AuthUser | null;
  selectedIncidentId: string | null;
  onUploaded: () => Promise<void>;
};

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

function buildToneDataUri(frequency: number, durationMs: number) {
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
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.25 * envelope;
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }

  return `data:audio/wav;base64,${encodeBase64(new Uint8Array(buffer))}`;
}

function isBluetoothLike(input: RecordingInput) {
  const value = `${input.name} ${input.type}`.toLowerCase();
  return ["bluetooth", "airpods", "buds", "headset", "external"].some((token) => value.includes(token));
}

function describeInput(input: RecordingInput) {
  return `${input.name} (${input.type})`;
}

export default function AudioCaptureScreen({ currentUser, selectedIncidentId, onUploaded }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const startTonePlayer = useMemo(() => createAudioPlayer({ uri: buildToneDataUri(1046, 140) }), []);
  const stopTonePlayer = useMemo(() => createAudioPlayer({ uri: buildToneDataUri(784, 180) }), []);
  const [recordingUri, setRecordingUri] = useState("");
  const [referenceReady, setReferenceReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [availableInputs, setAvailableInputs] = useState<RecordingInput[]>([]);
  const [selectedInputUid, setSelectedInputUid] = useState<string | null>(null);
  const [preferredInputUid, setPreferredInputUid] = useState<string | null>(null);
  const [cueEnabled, setCueEnabled] = useState(true);
  const [cueVolume, setCueVolume] = useState<RecordingCueVolume>("standard");
  const [status, setStatus] = useState("Ready to record.");
  const [busy, setBusy] = useState(false);

  const selectedInput = useMemo(
    () => availableInputs.find((input) => input.uid === selectedInputUid) || null,
    [availableInputs, selectedInputUid]
  );

  async function playCue(type: "start" | "stop") {
    if (!cueEnabled) {
      return;
    }

    const player = type === "start" ? startTonePlayer : stopTonePlayer;
    const volume = cueVolume === "soft" ? 0.25 : cueVolume === "loud" ? 0.8 : 0.5;
    try {
      player.volume = volume;
      player.pause();
      await player.seekTo(0);
      player.play();
    } catch {
      return;
    }
  }

  async function updateCueSettings(nextSettings: { enabled?: boolean; volume?: RecordingCueVolume }) {
    const merged = {
      enabled: nextSettings.enabled ?? cueEnabled,
      volume: nextSettings.volume ?? cueVolume,
      preferredInputUid
    };
    setCueEnabled(merged.enabled);
    setCueVolume(merged.volume);
    await saveRecordingCueSettings(merged);
  }

  async function persistPreferredInput(nextPreferredInputUid: string | null) {
    setPreferredInputUid(nextPreferredInputUid);
    await saveRecordingCueSettings({
      enabled: cueEnabled,
      volume: cueVolume,
      preferredInputUid: nextPreferredInputUid
    });
  }

  async function prepareRecorderAndInputs(preferredInputUid?: string | null) {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false
    });

    await recorder.prepareToRecordAsync();
    const inputs = await recorder.getAvailableInputs();
    setAvailableInputs(inputs);

    const preferredBluetooth = inputs.find(isBluetoothLike);
    const fallback = inputs[0];
    const nextInput = inputs.find((input) => input.uid === preferredInputUid) || preferredBluetooth || fallback || null;

    if (nextInput) {
      await recorder.setInput(nextInput.uid);
      setSelectedInputUid(nextInput.uid);
      if (preferredInputUid !== nextInput.uid) {
        await persistPreferredInput(nextInput.uid);
      }
      setStatus(`Ready to record using ${describeInput(nextInput)}.`);
    } else {
      setStatus("Ready to record. No alternate microphone inputs were reported by the device.");
    }
  }

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setStatus("Microphone permission is required.");
          return;
        }

        return prepareRecorderAndInputs();
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Unable to prepare recorder.");
      });

    loadRecordingCueSettings()
      .then((settings) => {
        setCueEnabled(settings.enabled);
        setCueVolume(settings.volume);
        setPreferredInputUid(settings.preferredInputUid || null);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (preferredInputUid === null) {
      return;
    }

    prepareRecorderAndInputs(preferredInputUid).catch(() => undefined);
  }, [preferredInputUid]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    loadMyVoiceProfile()
      .then((result) => setProfileReady(Boolean(result.hasProfile)))
      .catch(() => undefined);
  }, [currentUser]);

  async function selectInput(inputUid: string) {
    setBusy(true);
    try {
      await recorder.setInput(inputUid);
      setSelectedInputUid(inputUid);
      await persistPreferredInput(inputUid);
      const input = availableInputs.find((item) => item.uid === inputUid);
      setStatus(input ? `Microphone source set to ${describeInput(input)}.` : "Microphone source updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to change microphone source.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setBusy(true);
    try {
      if (!recorderState.canRecord) {
        await prepareRecorderAndInputs(selectedInputUid);
      }
      if (selectedInputUid) {
        await recorder.setInput(selectedInputUid);
      }
      await playCue("start");
      await sleep(170);
      recorder.record();
      setRecordingUri("");
      setStatus(selectedInput ? `Recording in progress using ${describeInput(selectedInput)}.` : "Recording in progress.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to start recording.");
    } finally {
      setBusy(false);
    }
  }

  async function stopRecording() {
    if (!recorderState.isRecording) {
      return;
    }

    setBusy(true);
    try {
      await recorder.stop();
      const uri = recorder.uri || recorderState.url || "";
      setRecordingUri(uri);
      setStatus(uri ? "Recording saved locally." : "Recording finished, but no file was returned.");
      await playCue("stop");
      await prepareRecorderAndInputs(selectedInputUid);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to stop recording.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadRecording() {
    if (!selectedIncidentId || !recordingUri) {
      setStatus("Select an incident and capture audio first.");
      return;
    }

    setBusy(true);
    try {
      const job = await attachAudioEvidence(selectedIncidentId, recordingUri, currentUser);
      await onUploaded();
      setStatus(`Audio uploaded. Ingest job queued: ${job.jobId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audio upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadOfficerReference() {
    if (!selectedIncidentId || !recordingUri) {
      setStatus("Select an incident and record the officer reference first.");
      return;
    }

    setBusy(true);
    try {
      await attachOfficerVoiceReference(selectedIncidentId, recordingUri, currentUser);
      await onUploaded();
      setReferenceReady(true);
      setStatus("Officer voice reference uploaded. Future scene audio for this incident will use it for matching.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Officer reference upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReusableProfile() {
    if (!recordingUri || !currentUser) {
      setStatus("Record a short officer sample first.");
      return;
    }

    setBusy(true);
    try {
      await saveMyVoiceProfile(recordingUri);
      setProfileReady(true);
      setStatus("Reusable officer voice profile saved. New incidents can use it automatically.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save reusable voice profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeroCard
        eyebrow="Audio Intake"
        title="Capture the scene conversation"
        body="Record one field session, pick the best microphone source, and preserve the source file before drafting anything from it."
        right={<MetricCard label="Incident" value={selectedIncidentId ? "Ready" : "Missing"} tone={selectedIncidentId ? "success" : "warning"} />}
      />

      <SectionCard title="Microphone Source" subtitle="Bluetooth earbuds and other external microphones will show here when the device exposes them as recording inputs.">
        <View style={styles.tagRow}>
          <Tag label={selectedIncidentId || "No incident selected"} active={!!selectedIncidentId} />
          <Tag label={recorderState.isRecording ? "Live recording" : "Idle"} tone={recorderState.isRecording ? "warning" : "success"} />
          {selectedInput ? <Tag label={describeInput(selectedInput)} tone={isBluetoothLike(selectedInput) ? "success" : "default"} active /> : null}
        </View>
        <View style={styles.row}>
          <AppButton label="Refresh Inputs" onPress={() => void prepareRecorderAndInputs(selectedInputUid)} disabled={busy} variant="secondary" />
          {availableInputs.length === 0 ? (
            <Text style={styles.panelCopy}>No alternate recording inputs reported yet. Open your earbuds first, then refresh or reopen this screen.</Text>
          ) : (
            availableInputs.map((input) => (
              <AppButton
                key={input.uid}
                label={isBluetoothLike(input) ? `Bluetooth: ${input.name}` : input.name}
                onPress={() => selectInput(input.uid)}
                disabled={busy}
                variant={selectedInputUid === input.uid ? "primary" : "ghost"}
              />
            ))
          )}
        </View>
      </SectionCard>

      <SectionCard title="Recording Controls" subtitle="Record, stop, then use the clip as a reusable profile, an incident reference clip, or the main scene recording.">
        <View style={styles.tagRow}>
          {currentUser ? <Tag label={`Known officer: ${currentUser.fullName}`} tone="success" /> : null}
          {referenceReady ? <Tag label="Voice reference ready" tone="success" /> : null}
          {profileReady ? <Tag label="Reusable profile saved" tone="success" /> : null}
          {selectedInput && isBluetoothLike(selectedInput) ? <Tag label="Bluetooth mic active" tone="success" active /> : null}
          <Tag label={cueEnabled ? `Cue sounds: ${cueVolume}` : "Cue sounds off"} tone={cueEnabled ? "success" : "warning"} />
          {preferredInputUid ? <Tag label="Preferred input saved" tone="success" /> : null}
        </View>
        <View style={styles.row}>
          <AppButton label={cueEnabled ? "Turn Cues Off" : "Turn Cues On"} onPress={() => void updateCueSettings({ enabled: !cueEnabled })} variant="secondary" />
          <AppButton label="Soft" onPress={() => void updateCueSettings({ volume: "soft" })} variant={cueVolume === "soft" ? "primary" : "ghost"} />
          <AppButton label="Standard" onPress={() => void updateCueSettings({ volume: "standard" })} variant={cueVolume === "standard" ? "primary" : "ghost"} />
          <AppButton label="Loud" onPress={() => void updateCueSettings({ volume: "loud" })} variant={cueVolume === "loud" ? "primary" : "ghost"} />
        </View>
        <View style={styles.row}>
          <AppButton label="Start Recording" onPress={startRecording} disabled={busy || recorderState.isRecording} />
          <AppButton label="Stop Recording" onPress={stopRecording} disabled={busy || !recorderState.isRecording} variant="secondary" />
        </View>
        <View style={styles.row}>
          <AppButton label="Save Reusable Profile" onPress={saveReusableProfile} disabled={busy || !recordingUri || !currentUser} variant="secondary" />
          <AppButton label="Use as Officer Reference" onPress={uploadOfficerReference} disabled={busy || !recordingUri || !currentUser} variant="secondary" />
          <AppButton label="Upload Audio" onPress={uploadRecording} disabled={busy || !recordingUri} variant="ghost" />
        </View>
      </SectionCard>

      <SectionCard title="Session Status" subtitle={status}>
        <Text style={styles.panelCopy}>
          {recordingUri
            ? "Audio captured locally. Save it as a reusable officer profile, attach it to this incident as a reference clip, or upload it as scene audio."
            : "No captured file is attached yet."}
        </Text>
        {recordingUri ? <Text style={styles.path}>{recordingUri}</Text> : null}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    flexWrap: "wrap"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  panelCopy: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22
  },
  path: {
    fontSize: 12,
    color: theme.colors.muted
  }
});
