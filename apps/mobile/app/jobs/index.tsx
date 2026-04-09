import { StyleSheet, Text, View } from "react-native";
import type { JobRecord } from "@scene-report/shared";
import { EmptyState, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { formatDateTime, formatJobType, theme } from "../../src/ui/theme";

type Props = {
  jobs: JobRecord[];
  selectedIncidentId: string | null;
};

export default function JobsScreen({ jobs, selectedIncidentId }: Props) {
  return (
    <Screen>
      <HeroCard
        eyebrow="Job Queue"
        title="Follow background work"
        body="Monitor transcript ingest, narrative generation, export, and failure states without leaving the field workflow."
      />
      <SectionCard title="Selected Incident" subtitle={selectedIncidentId || "None selected"}>
        {jobs.length === 0 ? (
          <EmptyState title="No queued jobs" body="Queue audio ingest or draft generation and the work will appear here automatically." />
        ) : (
          jobs.map((job) => (
            <View key={job.id} style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.cardTitle}>{formatJobType(job.type)}</Text>
                <Tag
                  label={job.status}
                  tone={job.status === "FAILED" ? "danger" : job.status === "COMPLETED" ? "success" : "warning"}
                />
              </View>
              <Text style={styles.cardMeta}>Job ID: {job.id}</Text>
              <Text style={styles.cardMeta}>Created: {formatDateTime(job.createdAt)}</Text>
              {job.completedAt ? <Text style={styles.cardMeta}>Completed: {formatDateTime(job.completedAt)}</Text> : null}
              {job.errorMessage ? <Text style={styles.error}>Error: {job.errorMessage}</Text> : null}
              {job.resultJson ? <Text style={styles.result}>{job.resultJson}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink,
    flex: 1
  },
  cardMeta: {
    fontSize: 13,
    color: theme.colors.muted
  },
  error: {
    fontSize: 14,
    color: theme.colors.danger
  },
  result: {
    fontSize: 13,
    color: theme.colors.text
  }
});
