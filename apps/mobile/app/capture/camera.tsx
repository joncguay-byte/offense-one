import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StyleSheet, Text, View } from "react-native";
import { attachCallForServiceImage, attachSceneImage } from "../../src/features/reporting";
import { saveLocalImageEvidence } from "../../src/lib/local-evidence";
import type { AuthUser } from "../../src/lib/api";
import { AppButton, HeroCard, MetricCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser?: AuthUser | null;
  selectedIncidentId: string | null;
  onUploaded: () => Promise<void>;
};

export default function CameraCaptureScreen({ currentUser, selectedIncidentId, onUploaded }: Props) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState("");
  const [captureKind, setCaptureKind] = useState<"SCENE" | "CALL_FOR_SERVICE">("SCENE");
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

  if (!permission) {
    return <View style={styles.emptyShell} />;
  }

  if (!permission.granted) {
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

  return (
    <Screen>
      <HeroCard
        eyebrow="Scene Camera"
        title="Collect visual context"
        body="Capture a scene image, attach it to the active incident, and make it available to the review workflow."
        right={<MetricCard label="Incident" value={selectedIncidentId ? "Ready" : "Missing"} tone={selectedIncidentId ? "success" : "warning"} />}
      />

      <SectionCard title="Live View" subtitle="Use the rear camera to capture the broad scene before zooming into details.">
        <View style={styles.tagRow}>
          <Tag label={selectedIncidentId || "No incident selected"} active={!!selectedIncidentId} />
          <Tag label={photoUri ? "Photo captured" : "Awaiting capture"} tone={photoUri ? "success" : "warning"} />
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
          <AppButton
            label={selectedIncidentId?.startsWith("local-") ? "Save Photo to Event" : captureKind === "CALL_FOR_SERVICE" ? "Upload Call Photo" : "Upload Scene Photo"}
            onPress={uploadPhoto}
            disabled={busy || !photoUri}
            variant="secondary"
          />
        </View>
      </SectionCard>

      <SectionCard title="Capture Status" subtitle={status}>
        {photoUri ? <Text style={styles.path}>{photoUri}</Text> : <Text style={styles.panelCopy}>No local image is attached yet.</Text>}
      </SectionCard>
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
  }
});
