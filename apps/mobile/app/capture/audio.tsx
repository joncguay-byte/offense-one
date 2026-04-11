import { useEffect, useMemo, useState } from "react";
import { AudioModule, RecordingInput, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { StyleSheet, Text, View } from "react-native";
import { attachAudioEvidence, attachOfficerVoiceReference, loadMyVoiceProfile, saveMyVoiceProfile } from "../../src/features/reporting";
import { loadRecordingCueSettings, saveRecordingCueSettings, type RecordingCueVolume } from "../../src/lib/audio-settings";
import { deleteLocalEvidence, loadLocalEvidence, saveLocalAudioEvidence, type LocalEvidenceRecord } from "../../src/lib/local-evidence";
import { buildToneDataUri, getCueVolumeLevel } from "../../src/lib/recording-cues";
import type { AuthUser } from "../../src/lib/api";
import { AppButton, Screen, SectionCard, Tag } from "../../src/ui/components";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser: AuthUser | null;
  selectedIncidentId: string | null;
  onUploaded: () => Promise<void>;
  onEvidenceSaved?: () => Promise<void> | void;
};


function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isBluetoothLike(input: RecordingInput) {
  const value = `${input.name} ${input.type}`.toLowerCase();
  return ["bluetooth", "airpods", "buds", "headset", "external"].some((token) => value.includes(token));
}

function describeInput(input: RecordingInput) {
  return `${input.name} (${input.type})`;
}

export default function AudioCaptureScreen({ currentUser, selectedIncidentId, onUploaded, onEvidenceSaved }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const startTonePlayer = useMemo(() => createAudioPlayer({ uri: buildToneDataUri(1760, 220) }), []);
  const stopTonePlayer = useMemo(() => createAudioPlayer({ uri: buildToneDataUri(988, 240) }), []);
  const playbackPlayer = useMemo(() => createAudioPlayer(null), []);
  const [recordingUri, setRecordingUri] = useState("");
  const [referenceReady, setReferenceReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [availableInputs, setAvailableInputs] = useState<RecordingInput[]>([]);
  const [selectedInputUid, setSelectedInputUid] = useState<string | null>(null);
  const [preferredInputUid, setPreferredInputUid] = useState<string | null>(null);
  const [cueEnabled, setCueEnabled] = useState(true);
  const [cueVolume, setCueVolume] = useState<RecordingCueVolume>("standard");
  const [status, setStatus] = useState("Ready to record.");
  const [localRecordings, setLocalRecordings] = useState<LocalEvidenceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const activeRecordingIncidentId = selectedIncidentId || RECORDING_INBOX_ID;

  const selectedInput = useMemo(
    () => availableInputs.find((input) => input.uid === selectedInputUid) || null,
    [availableInputs, selectedInputUid]
  );

  async function playCue(type: "start" | "stop") {
    if (!cueEnabled) {
      return;
    }

    const player = type === "start" ? startTonePlayer : stopTonePlayer;
    try {
      player.volume = getCueVolumeLevel(cueVolume);
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

  async function previewCueVolume(volume: RecordingCueVolume) {
    await updateCueSettings({ enabled: true, volume });
    const player = startTonePlayer;
    try {
      player.volume = getCueVolumeLevel(volume);
      player.pause();
      await player.seekTo(0);
      player.play();
      setStatus(`${volume[0].toUpperCase()}${volume.slice(1)} cue preview played.`);
    } catch {
      setStatus("Unable to play cue preview on this device.");
    }
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

  useEffect(() => {
    loadLocalEvidence()
      .then((records) => setLocalRecordings(records.filter((record) => record.type === "AUDIO")))
      .catch(() => undefined);
  }, [selectedIncidentId, status]);

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
      if (uri) {
        const saved = await saveLocalAudioEvidence(activeRecordingIncidentId, uri, currentUser?.fullName);
        await onEvidenceSaved?.();
        const records = await loadLocalEvidence();
        setLocalRecordings(records.filter((record) => record.type === "AUDIO"));
        setRecordingUri(saved.savedUri);
        setStatus(`Recording saved: ${saved.fileName}`);
      } else {
        setStatus(uri ? "Recording saved locally." : "Recording finished, but no file was returned.");
      }
      await playCue("stop");
      await prepareRecorderAndInputs(selectedInputUid);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to stop recording.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecording(recordId: string) {
    setBusy(true);
    try {
      await deleteLocalEvidence(recordId);
      await onEvidenceSaved?.();
      const records = await loadLocalEvidence();
      setLocalRecordings(records.filter((record) => record.type === "AUDIO"));
      setStatus("Recording deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete recording.");
    } finally {
      setBusy(false);
    }
  }

  async function playRecording(record: LocalEvidenceRecord) {
    try {
      playbackPlayer.pause();
      playbackPlayer.replace({ uri: record.savedUri });
      playbackPlayer.volume = 1;
      playbackPlayer.play();
      setStatus(`Playing: ${record.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to play recording.");
    }
  }

  async function uploadRecording() {
    if (!selectedIncidentId || !recordingUri) {
      setStatus("Select an incident and capture audio first.");
      return;
    }

    setBusy(true);
    try {
      if (selectedIncidentId?.startsWith("local-")) {
        const saved = await saveLocalAudioEvidence(selectedIncidentId, recordingUri, currentUser?.fullName);
        await onUploaded();
        await onEvidenceSaved?.();
        const records = await loadLocalEvidence();
        setLocalRecordings(records.filter((record) => record.type === "AUDIO"));
        setStatus(`Audio saved to this device incident as ${saved.fileName}. It is stored inside the app's Offense One evidence folder.`);
        return;
      }

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
      if (selectedIncidentId.startsWith("local-")) {
        await onUploaded();
        setReferenceReady(true);
        setStatus("Officer voice reference saved for this incident.");
        return;
      }

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
      if (currentUser.id.startsWith("local-")) {
        setProfileReady(true);
        setStatus("Reusable officer voice profile saved on this device.");
        return;
      }

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
      <SectionCard title="Recording Controls">
        <View style={styles.primaryRecordPanel}>
          <Text style={styles.primaryRecordTitle}>{recorderState.isRecording ? "Recording in progress" : "Ready to record"}</Text>
          <Text style={styles.primaryRecordBody}>
            {selectedInput ? `Input: ${describeInput(selectedInput)}` : "Use the phone microphone or select Bluetooth when available."}
          </Text>
          <View style={styles.row}>
            <AppButton label="START RECORDING" onPress={startRecording} disabled={busy || recorderState.isRecording} />
            <AppButton label="STOP" onPress={stopRecording} disabled={busy || !recorderState.isRecording} variant="danger" />
          </View>
        </View>
        <View style={styles.tagRow}>
          <Tag label={selectedIncidentId || "No event selected"} active={!!selectedIncidentId} />
          {currentUser ? <Tag label={`Known officer: ${currentUser.fullName}`} tone="success" /> : null}
          {referenceReady ? <Tag label="Voice reference ready" tone="success" /> : null}
          {profileReady ? <Tag label="Reusable profile saved" tone="success" /> : null}
          {selectedInput && isBluetoothLike(selectedInput) ? <Tag label="Bluetooth mic active" tone="success" active /> : null}
          <Tag label={cueEnabled ? `Cue sounds: ${cueVolume}` : "Cue sounds off"} tone={cueEnabled ? "success" : "warning"} />
          {preferredInputUid ? <Tag label="Preferred input saved" tone="success" /> : null}
        </View>
        <View style={styles.row}>
          <AppButton label={cueEnabled ? "Turn Cues Off" : "Turn Cues On"} onPress={() => void updateCueSettings({ enabled: !cueEnabled })} variant="secondary" />
          <AppButton label="Soft" onPress={() => void previewCueVolume("soft")} variant={cueVolume === "soft" ? "primary" : "ghost"} />
          <AppButton label="Standard" onPress={() => void previewCueVolume("standard")} variant={cueVolume === "standard" ? "primary" : "ghost"} />
          <AppButton label="Loud" onPress={() => void previewCueVolume("loud")} variant={cueVolume === "loud" ? "primary" : "ghost"} />
        </View>
        <View style={styles.row}>
          <AppButton label="Save Reusable Profile" onPress={saveReusableProfile} disabled={busy || !recordingUri || !currentUser} variant="secondary" />
          <AppButton label="Use as Officer Reference" onPress={uploadOfficerReference} disabled={busy || !recordingUri || !currentUser} variant="secondary" />
          {!selectedIncidentId?.startsWith("local-") ? <AppButton label="Upload Audio" onPress={uploadRecording} disabled={busy || !recordingUri} variant="ghost" /> : null}
        </View>
      </SectionCard>

      <SectionCard title="Recordings by Date and Time" subtitle={status}>
        {localRecordings.length === 0 ? (
          <Text style={styles.panelCopy}>No saved recordings for this event yet.</Text>
        ) : (
          localRecordings.map((record) => (
            <View key={record.id} style={styles.recordingCard}>
              <Text style={styles.recordingTitle}>{new Date(record.createdAt).toLocaleString()}</Text>
              <Text style={styles.panelCopy}>{record.fileName}</Text>
              <Text style={styles.path}>{record.savedUri}</Text>
              <View style={styles.row}>
                <AppButton label="Play" onPress={() => void playRecording(record)} disabled={busy} variant="secondary" />
                <AppButton label="Delete" onPress={() => void deleteRecording(record.id)} disabled={busy} variant="danger" />
              </View>
            </View>
          ))
        )}
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
  },
  primaryRecordPanel: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  primaryRecordTitle: {
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "900"
  },
  primaryRecordBody: {
    color: "#c9d6dc",
    fontSize: 15,
    lineHeight: 22
  },
  recordingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 4
  },
  recordingTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  }
});
const RECORDING_INBOX_ID = "recording-inbox";
