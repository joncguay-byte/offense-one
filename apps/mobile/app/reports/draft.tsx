import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { approveNarrative, generateDraftNarrative, rejectNarrative } from "../../src/features/reporting";
import { loadRecordingCueSettings } from "../../src/lib/audio-settings";
import type { AuthUser, IncidentRecord } from "../../src/lib/api";
import { AppButton, EmptyState, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { theme } from "../../src/ui/theme";

type Props = {
  currentUser: AuthUser | null;
  selectedIncident: IncidentRecord | null;
  onRefresh: () => Promise<void>;
  onLocalReportGenerated?: (incidentId: string, body: string, reviewNotes?: string) => void;
};

export default function DraftReportScreen({ currentUser, selectedIncident, onRefresh, onLocalReportGenerated }: Props) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [draftDefaults, setDraftDefaults] = useState({
    defaultNarrativeStyle: "concise" as "concise" | "detailed",
    autoIncludeCallForServiceContext: true
  });
  const [status, setStatus] = useState("Select an incident to review transcript evidence and draft a report.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRecordingCueSettings()
      .then((settings) => {
        setDraftDefaults({
          defaultNarrativeStyle: settings.defaultNarrativeStyle === "detailed" ? "detailed" : "concise",
          autoIncludeCallForServiceContext: settings.autoIncludeCallForServiceContext ?? true
        });
      })
      .catch(() => undefined);
  }, []);

  const transcriptSegments = useMemo(() => {
    if (!selectedIncident?.transcriptDrafts[0]?.diarizedJson) {
      return [];
    }

    try {
      const parsed = JSON.parse(selectedIncident.transcriptDrafts[0].diarizedJson) as {
        segments?: Array<{ speakerKey: string; startMs: number; endMs: number; text: string }>;
      };
      return parsed.segments || [];
    } catch {
      return [];
    }
  }, [selectedIncident]);

  const latestReport = selectedIncident?.generatedReports[0] || null;
  const citations = useMemo(() => {
    if (!latestReport?.citationsJson) {
      return [];
    }

    try {
      return JSON.parse(latestReport.citationsJson) as Array<{
        sourceType: string;
        sourceId: string;
        note: string;
        sourceLabel: string;
        excerpt: string;
      }>;
    } catch {
      return [];
    }
  }, [latestReport?.citationsJson]);

  const confidence = useMemo(() => {
    if (!latestReport?.confidenceJson) {
      return null;
    }

    try {
      return JSON.parse(latestReport.confidenceJson) as {
        overall: "low" | "medium" | "high";
        notes: string[];
      };
    } catch {
      return null;
    }
  }, [latestReport?.confidenceJson]);

  const callForServiceImageCount = (selectedIncident?.evidenceItems || []).filter((item) => {
    if (item.type !== "IMAGE" || !item.metadataJson) {
      return false;
    }

    try {
      const metadata = JSON.parse(item.metadataJson) as Record<string, unknown>;
      return metadata.sourceKind === "CALL_FOR_SERVICE";
    } catch {
      return false;
    }
  }).length;

  async function generateDraft() {
    if (!selectedIncident) {
      setStatus("Select an incident first.");
      return;
    }

    setBusy(true);
    try {
      if (selectedIncident.id.startsWith("local-") && onLocalReportGenerated) {
        const body = [
          `I responded to ${selectedIncident.title || "the call for service"}${selectedIncident.location ? ` at ${selectedIncident.location}` : ""}.`,
          "Audio and scene context were captured in the mobile app for later review.",
          "This local trial draft is a placeholder until the hosted backend transcription and AI narrative service are connected.",
          reviewNotes ? `Review notes: ${reviewNotes}` : ""
        ]
          .filter(Boolean)
          .join(" ");
        onLocalReportGenerated(selectedIncident.id, body, reviewNotes);
        setStatus("Local draft generated. Hosted AI drafting requires the backend API.");
        return;
      }

      const job = await generateDraftNarrative(selectedIncident.id, {
        incidentTitle: selectedIncident.title,
        officerPerspective: "Create a neutral first-person officer narrative grounded in evidence.",
        objective:
          draftDefaults.defaultNarrativeStyle === "detailed"
            ? "Generate a detailed, factual offense narrative draft with clear chronology and officer observations."
            : "Generate a concise, factual offense narrative draft.",
        includeSceneSummary: true,
        includeWitnessSummary: true,
        includeCallForServiceContext: draftDefaults.autoIncludeCallForServiceContext
      });
      await onRefresh();
      setStatus(`Draft generation queued: ${job.jobId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to generate a draft.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!latestReport) {
      setStatus("Generate a report first.");
      return;
    }

    setBusy(true);
    try {
      if (selectedIncident?.id.startsWith("local-")) {
        setStatus("Local draft marked approved for trial review.");
        return;
      }

      const result = await approveNarrative(latestReport.id, reviewNotes);
      await onRefresh();
      const exportJobId = typeof result === "object" && result && "exportJobId" in result ? String(result.exportJobId) : null;
      setStatus(exportJobId ? `Report approved. Export queued: ${exportJobId}` : "Report approved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to approve the report.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!latestReport) {
      setStatus("Generate a report first.");
      return;
    }

    setBusy(true);
    try {
      if (selectedIncident?.id.startsWith("local-")) {
        setStatus("Local draft marked rejected for trial review.");
        return;
      }

      await rejectNarrative(latestReport.id, reviewNotes);
      await onRefresh();
      setStatus("Report rejected for revision.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to reject the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeroCard
        eyebrow="Narrative Review"
        title="Draft from evidence, then verify"
        body="Keep transcript context and final narrative on the same screen so the review feels deliberate and defensible."
      />

      <SectionCard title="Current Review Context" subtitle={status}>
        <View style={styles.tagRow}>
          <Tag label={currentUser ? `${currentUser.fullName} / ${currentUser.role}` : "Not signed in"} active={!!currentUser} />
          <Tag label={selectedIncident ? selectedIncident.caseNumber : "No incident selected"} active={!!selectedIncident} />
          <Tag label={latestReport?.status || "No draft yet"} tone={latestReport ? "warning" : "default"} />
          {callForServiceImageCount > 0 ? <Tag label={`Call photo x${callForServiceImageCount}`} tone="success" /> : null}
          <Tag label={`Style: ${draftDefaults.defaultNarrativeStyle}`} />
          <Tag label={draftDefaults.autoIncludeCallForServiceContext ? "Call context on" : "Call context off"} tone={draftDefaults.autoIncludeCallForServiceContext ? "success" : "warning"} />
        </View>
      </SectionCard>

      <SectionCard title="Speaker Review" subtitle="Use diarized segments to confirm who said what before approving the draft.">
        {transcriptSegments.length === 0 ? (
          <EmptyState title="No transcript available" body="Upload and process scene audio before generating a narrative." />
        ) : (
          transcriptSegments.map((segment) => (
            <View key={`${segment.speakerKey}-${segment.startMs}`} style={styles.segment}>
              <Tag label={`${segment.speakerKey} / ${Math.round(segment.startMs / 1000)}s - ${Math.round(segment.endMs / 1000)}s`} />
              <Text style={styles.segmentText}>{segment.text}</Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Review Notes" subtitle="Add corrections, context, or approval comments before routing the report onward.">
        <TextInput
          value={reviewNotes}
          onChangeText={setReviewNotes}
          placeholder="Supervisor or officer review notes"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, styles.multiline]}
          multiline
        />
        <View style={styles.row}>
          <AppButton label="Generate Draft" onPress={generateDraft} disabled={busy || !selectedIncident} />
          <AppButton label="Approve" onPress={approve} disabled={busy || !latestReport} variant="secondary" />
          <AppButton label="Reject" onPress={reject} disabled={busy || !latestReport} variant="danger" />
        </View>
      </SectionCard>

      <SectionCard title="Generated Draft Preview" subtitle="This should remain concise, factual, and grounded in the captured evidence.">
        <Text style={styles.preview}>{latestReport?.body || "No draft generated yet."}</Text>
        {latestReport?.reviewNotes ? <Text style={styles.notes}>Notes: {latestReport.reviewNotes}</Text> : null}
      </SectionCard>

      <SectionCard title="Evidence Citations" subtitle="Review exactly what evidence the draft relied on before approval.">
        {citations.length === 0 ? (
          <EmptyState title="No citations yet" body="Generate a draft to inspect transcript, scene, and call-for-service support details." />
        ) : (
          citations.map((citation) => (
            <View key={`${citation.sourceType}-${citation.sourceId}`} style={styles.citationCard}>
              <View style={styles.tagRow}>
                <Tag label={citation.sourceLabel} active />
                <Tag label={citation.sourceType} />
              </View>
              <Text style={styles.citationNote}>{citation.note}</Text>
              <Text style={styles.citationExcerpt}>{citation.excerpt}</Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Confidence Review" subtitle="Low confidence does not block drafting, but it should slow down approval.">
        {confidence ? (
          <>
            <View style={styles.tagRow}>
              <Tag label={`Overall confidence: ${confidence.overall}`} tone={confidence.overall === "high" ? "success" : confidence.overall === "medium" ? "warning" : "danger"} active />
            </View>
            {confidence.notes.map((note, index) => (
              <Text key={`${note}-${index}`} style={styles.confidenceNote}>
                {note}
              </Text>
            ))}
          </>
        ) : (
          <EmptyState title="No confidence summary yet" body="Generate a draft to review uncertainty notes before approval." />
        )}
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
  segment: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs
  },
  segmentText: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  preview: {
    fontSize: 15,
    lineHeight: 24,
    color: theme.colors.text
  },
  citationCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs
  },
  citationNote: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted
  },
  citationExcerpt: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  },
  confidenceNote: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  },
  notes: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted
  }
});
