import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { AuthUser, IncidentRecord } from "../../src/lib/api";
import { assignSupervisor, createIncidentWorkflow } from "../../src/features/reporting";
import { AppButton, EmptyState, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { formatDateTime, theme } from "../../src/ui/theme";

type Props = {
  currentUser: AuthUser | null;
  incidents: IncidentRecord[];
  supervisors: AuthUser[];
  localMode?: boolean;
  onCreated: () => Promise<void>;
  onLocalCreated?: (payload: { caseNumber: string; title: string; location?: string }) => void;
  onLocalAssigned?: (incidentId: string, supervisor: AuthUser) => void;
  onSelectIncident: (incidentId: string) => void;
  selectedIncidentId: string | null;
};

export default function NewIncidentScreen({
  currentUser,
  incidents,
  supervisors,
  localMode,
  onCreated,
  onLocalCreated,
  onLocalAssigned,
  onSelectIncident,
  selectedIncidentId
}: Props) {
  const [caseNumber, setCaseNumber] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("Create an incident to start collecting evidence.");
  const [busy, setBusy] = useState(false);

  async function createIncident() {
    if (!currentUser) {
      setStatus("Sign in first.");
      return;
    }

    if (!caseNumber || !title) {
      setStatus("Case number and title are required.");
      return;
    }

    setBusy(true);
    try {
      if (localMode && onLocalCreated) {
        onLocalCreated({ caseNumber, title, location });
        setCaseNumber("");
        setTitle("");
        setLocation("");
        setStatus("Incident created.");
        return;
      }

      await createIncidentWorkflow({
        caseNumber,
        title,
        location,
        occurredAt: new Date().toISOString(),
        createdById: currentUser.id
      });
      setCaseNumber("");
      setTitle("");
      setLocation("");
      await onCreated();
      setStatus("Incident created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create incident.");
    } finally {
      setBusy(false);
    }
  }

  async function assignSelectedSupervisor(incidentId: string, supervisorId: string) {
    setBusy(true);
    try {
      if (localMode && onLocalAssigned) {
        const supervisor = supervisors.find((item) => item.id === supervisorId) || currentUser;
        if (supervisor) {
          onLocalAssigned(incidentId, supervisor);
          setStatus("Supervisor assigned locally.");
        }
        return;
      }

      await assignSupervisor(incidentId, supervisorId);
      await onCreated();
      setStatus("Supervisor assigned.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to assign supervisor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeroCard
        eyebrow="Incident Desk"
        title="Create and route the case shell"
        body="Start one canonical incident record, then keep audio, imagery, and reports attached to that same evidence trail."
      />

      <SectionCard title="New Incident" subtitle={status}>
        <TextInput value={caseNumber} onChangeText={setCaseNumber} placeholder="Case number" placeholderTextColor={theme.colors.muted} style={styles.input} />
        <TextInput value={title} onChangeText={setTitle} placeholder="Incident title" placeholderTextColor={theme.colors.muted} style={styles.input} />
        <TextInput value={location} onChangeText={setLocation} placeholder="Location" placeholderTextColor={theme.colors.muted} style={styles.input} />
        <View style={styles.buttonRow}>
          <AppButton label={busy ? "Working..." : "Create Incident"} onPress={createIncident} disabled={busy} />
        </View>
      </SectionCard>

      <SectionCard title="Open Incidents" subtitle="Select the active case before recording or uploading evidence.">
        {incidents.length === 0 ? (
          <EmptyState title="No incidents yet" body="Create the first incident above to activate the rest of the workflow." />
        ) : (
          incidents.map((incident) => (
            <View key={incident.id} style={[styles.incidentCard, selectedIncidentId === incident.id ? styles.incidentCardActive : null]}>
              <View style={styles.incidentHeader}>
                <View style={styles.incidentHeaderCopy}>
                  <Text style={styles.incidentTitle}>{incident.caseNumber}</Text>
                  <Text style={styles.incidentSubtitle}>{incident.title}</Text>
                </View>
                <AppButton
                  label={selectedIncidentId === incident.id ? "Selected" : "Select"}
                  onPress={() => onSelectIncident(incident.id)}
                  variant={selectedIncidentId === incident.id ? "secondary" : "primary"}
                />
              </View>
              <View style={styles.tagRow}>
                <Tag label={incident.status} active={selectedIncidentId === incident.id} />
                <Tag label={incident.location || "No location"} />
                <Tag label={formatDateTime(incident.occurredAt)} />
              </View>
              <Text style={styles.incidentMeta}>Supervisor: {incident.assignedSupervisor?.fullName || "Unassigned"}</Text>
              {currentUser?.role === "SUPERVISOR" && !incident.assignedSupervisorId ? (
                <View style={styles.buttonRow}>
                  <AppButton label="Assign Me" onPress={() => assignSelectedSupervisor(incident.id, currentUser.id)} variant="secondary" />
                </View>
              ) : null}
              {currentUser?.role === "OFFICER" && supervisors.length > 0 && !incident.assignedSupervisorId ? (
                <View style={styles.supervisorRow}>
                  {supervisors.slice(0, 3).map((supervisor) => (
                    <AppButton
                      key={supervisor.id}
                      label={supervisor.fullName}
                      onPress={() => assignSelectedSupervisor(incident.id, supervisor.id)}
                      variant="ghost"
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  incidentCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  incidentCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "#eef7f8"
  },
  incidentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  incidentHeaderCopy: {
    flex: 1,
    gap: 4
  },
  incidentTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  incidentSubtitle: {
    fontSize: 15,
    color: theme.colors.text
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  incidentMeta: {
    fontSize: 14,
    color: theme.colors.muted
  },
  supervisorRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap"
  }
});
