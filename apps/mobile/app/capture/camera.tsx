import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { StyleSheet, Text, View } from "react-native";
import { attachCallForServiceImage, attachSceneImage } from "../../src/features/reporting";
import { saveLocalImageEvidence, saveLocalVideoEvidence } from "../../src/lib/local-evidence";
import type { AuthUser } from "../../src/lib/api";
import { AppButton, HeroCard, MetricCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser?: AuthUser | null;
  selectedIncidentId: string | null;
  onUploaded: () => Promise<void>;
  compact?: boolean;
};

export default function CameraCaptureScreen({ currentUser, selectedIncidentId, onUploaded, compact }: Props) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState("");
  const [videoUri, setVideoUri] = useState("");
  const [captureKind, setCaptureKind] = useState<"SCENE" | "CALL_FOR_SERVICE">("SCENE");
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [status, setStatus] = useState("Ready to capture scene imagery.");
  const [busy, setBusy] = useState(false);

  async function capturePhoto() {
    if (!cameraRef.current) {
      return;
    }

    setBusy(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setPhotoUri(result.uri);
      setStatus("Photo captured locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to capture photo.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto() {
    if (!selectedIncidentId || !photoUri) {
      setStatus("Select an incident and capture a photo first.");
      return;
    }

    setBusy(true);
    try {
      if (selectedIncidentId.startsWith("local-")) {
        const label = captureKind === "CALL_FOR_SERVICE" ? "Call For Service" : "Scene Photo";
        const saved = await saveLocalImageEvidence(selectedIncidentId, photoUri, label, currentUser?.fullName);
        await onUploaded();
        setStatus(`${label} saved to this incident as ${saved.fileName}.`);
        return;
      }

      if (captureKind === "CALL_FOR_SERVICE") {
        await attachCallForServiceImage(selectedIncidentId, photoUri);
      } else {
        await attachSceneImage(selectedIncidentId, photoUri);
      }
      await onUploaded();
      setStatus(captureKind === "CALL_FOR_SERVICE" ? "Call-for-service image uploaded successfully." : "Scene image uploaded successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to upload photo.");
    } finally {
      setBusy(false);
    }
  }

  async function startVideoRecording() {
    if (!cameraRef.current) {
      return;
    }

    if (!selectedIncidentId) {
      setStatus("Select an incident before recording video.");
      return;
    }

    setBusy(true);
    setRecordingVideo(true);
    setStatus("Recording video...");
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 120 });
      if (!result?.uri) {
        setStatus("Video recording stopped, but no file was returned.");
        return;
      }

      setVideoUri(result.uri);
      if (selectedIncidentId.startsWith("local-")) {
        const saved = await saveLocalVideoEvidence(selectedIncidentId, result.uri, "Scene Video", currentUser?.fullName);
        await onUploaded();
        setStatus(`Scene video saved to this incident as ${saved.fileName}.`);
      } else {
        setStatus("Video captured locally. Backend video upload is not connected yet.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to record video.");
    } finally {
      setRecordingVideo(false);
      setBusy(false);
    }
  }

  function stopVideoRecording() {
    cameraRef.current?.stopRecording();
    setStatus("Stopping video...");
  }

  async function pickFromGallery() {
    if (!selectedIncidentId) {
      setStatus("Select an incident before choosing gallery media.");
      return;
    }

    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.8
      });

      if (result.canceled) {
        setStatus("Gallery selection canceled.");
        return;
      }

      let savedCount = 0;
      for (const asset of result.assets) {
        if (asset.type === "video") {
          await saveLocalVideoEvidence(selectedIncidentId, asset.uri, "Gallery Video", currentUser?.fullName);
          savedCount += 1;
        } else {
          await saveLocalImageEvidence(selectedIncidentId, asset.uri, "Gallery Photo", currentUser?.fullName);
          savedCount += 1;
        }
      }
      await onUploaded();
      setStatus(`${savedCount} gallery item(s) saved to this incident.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to choose gallery media.");
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return <View style={styles.emptyShell} />;
  }

  if (!permission.granted) {
    if (compact) {
      return (
        <View style={styles.compactShell}>
          <AppButton label="Allow Camera" onPress={requestPermission} />
        </View>
      );
    }

    return (
      <Screen>
        <HeroCard
          eyebrow="Scene Camera"
          title="Camera access needed"
          body="Grant camera permission to capture scene imagery and add visual context to the incident."
        />
        <SectionCard title="Permission Required">
          <AppButton label="Allow Camera" onPress={requestPermission} />
        </SectionCard>
      </Screen>
    );
  }

  const cameraContent = (
    <>
      <View style={styles.tagRow}>
        <Tag label={selectedIncidentId || "No incident selected"} active={!!selectedIncidentId} />
        <Tag label={photoUri ? "Photo captured" : "Awaiting capture"} tone={photoUri ? "success" : "warning"} />
        <Tag label={videoUri ? "Video captured" : "No video"} tone={videoUri ? "success" : "default"} />
        <Tag label={captureKind === "CALL_FOR_SERVICE" ? "Call for service" : "Scene photo"} active />
      </View>
      <View style={styles.row}>
        <AppButton label="Scene Photo" onPress={() => setCaptureKind("SCENE")} variant={captureKind === "SCENE" ? "primary" : "ghost"} />
        <AppButton label="Call Photo" onPress={() => setCaptureKind("CALL_FOR_SERVICE")} variant={captureKind === "CALL_FOR_SERVICE" ? "primary" : "ghost"} />
      </View>
      <View style={styles.cameraShell}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      </View>
      <View style={styles.row}>
        <AppButton label="Capture Photo" onPress={capturePhoto} disabled={busy} />
        <AppButton label={recordingVideo ? "Stop Video" : "Record Video"} onPress={recordingVideo ? stopVideoRecording : () => void startVideoRecording()} disabled={busy && !recordingVideo} variant={recordingVideo ? "danger" : "secondary"} />
        <AppButton label="Choose From Gallery" onPress={() => void pickFromGallery()} disabled={busy} variant="secondary" />
        <AppButton
          label={selectedIncidentId?.startsWith("local-") ? "Save Photo to Event" : captureKind === "CALL_FOR_SERVICE" ? "Upload Call Photo" : "Upload Scene Photo"}
          onPress={uploadPhoto}
          disabled={busy || !photoUri}
          variant="secondary"
        />
      </View>
      <Text style={styles.panelCopy}>{status}</Text>
    </>
  );

  if (compact) {
    return <View style={styles.compactShell}>{cameraContent}</View>;
  }

  return (
    <Screen>
      <HeroCard
        eyebrow="Scene Camera"
        title="Collect visual context"
        body="Capture a scene image, attach it to the active incident, and make it available to the review workflow."
        right={<MetricCard label="Incident" value={selectedIncidentId ? "Ready" : "Missing"} tone={selectedIncidentId ? "success" : "warning"} />}
      />
      <SectionCard title="Live View">{cameraContent}</SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyShell: {
    flex: 1,
    backgroundColor: theme.colors.surface
  },
  tagRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    flexWrap: "wrap"
  },
  cameraShell: {
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 320
  },
  camera: {
    flex: 1,
    minHeight: 320
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
  compactShell: {
    gap: theme.spacing.sm
  }
});
