import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JobRecord, NotificationRecord } from "./src/lib/shared-types";
import AudioCaptureScreen from "./app/capture/audio";
import CameraCaptureScreen from "./app/capture/camera";
import NewIncidentScreen from "./app/incident/new";
import JobsScreen from "./app/jobs/index";
import NotificationsScreen from "./app/notifications/index";
import DraftReportScreen from "./app/reports/draft";
import SettingsScreen from "./app/settings/index";
import {
  loadIncidents,
  loadJobs,
  loadNotifications,
  loadSupervisors,
  readNotification,
  registerPushToken,
  signInOidc,
  signInOfficer,
  signInSupervisor
} from "./src/features/reporting";
import type { AuthUser, IncidentRecord } from "./src/lib/api";
import { registerForExpoPushToken } from "./src/lib/push";
import { BrandLockup, BrandMark } from "./src/ui/brand";
import { AppButton, HeroCard, MetricCard, SectionCard, Tag } from "./src/ui/components";
import { theme } from "./src/ui/theme";

type ScreenKey = "home" | "incident" | "audio" | "camera" | "report" | "jobs" | "notifications" | "settings";

const screenOptions: Array<{ key: ScreenKey; title: string }> = [
  { key: "home", title: "Overview" },
  { key: "incident", title: "Incidents" },
  { key: "audio", title: "Audio" },
  { key: "camera", title: "Camera" },
  { key: "report", title: "Narrative" },
  { key: "jobs", title: "Queue" },
  { key: "notifications", title: "Alerts" },
  { key: "settings", title: "Settings" }
];

export default function App() {
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [supervisors, setSupervisors] = useState<AuthUser[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [status, setStatus] = useState("Sign in as an officer or supervisor to begin.");
  const [demoMode, setDemoMode] = useState(false);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) || null,
    [incidents, selectedIncidentId]
  );

  async function refreshIncidents() {
    if (!currentUser || demoMode) {
      return;
    }

    const nextIncidents = await loadIncidents();
    setIncidents(nextIncidents);
    if (!selectedIncidentId && nextIncidents[0]) {
      setSelectedIncidentId(nextIncidents[0].id);
    }
  }

  async function refreshJobs() {
    if (!currentUser || demoMode) {
      return;
    }

    const nextJobs = await loadJobs({
      incidentId: selectedIncidentId || undefined,
      take: 20
    });
    setJobs(nextJobs);
  }

  async function refreshNotifications() {
    if (!currentUser || demoMode) {
      return;
    }

    const nextNotifications = await loadNotifications(20);
    setNotifications(nextNotifications);
  }

  async function refreshSupervisors() {
    if (!currentUser || demoMode) {
      return;
    }

    const nextSupervisors = await loadSupervisors();
    setSupervisors(nextSupervisors);
  }

  async function handleReadNotification(notificationId: string) {
    await readNotification(notificationId);
    await refreshNotifications();
  }

  async function completeSignIn(user: AuthUser, modeLabel: string) {
    setDemoMode(false);
    setCurrentUser(user);
    const expoToken = await registerForExpoPushToken();
    if (expoToken) {
      await registerPushToken("EXPO", expoToken);
      setStatus(`${modeLabel} as ${user.fullName}. Push ready.`);
    } else {
      setStatus(`${modeLabel} as ${user.fullName}. Push token unavailable on this device or project.`);
    }
  }

  async function signInAsOfficer() {
    try {
      const session = await signInOfficer();
      await completeSignIn(session.user, "Signed in");
    } catch {
      launchDemoWalkthrough("OFFICER");
    }
  }

  async function signInAsSupervisor() {
    try {
      const session = await signInSupervisor();
      await completeSignIn(session.user, "Signed in");
    } catch {
      launchDemoWalkthrough("SUPERVISOR");
    }
  }

  async function signInWithKeycloak() {
    try {
      const session = await signInOidc();
      await completeSignIn(session.user, "Signed in with Keycloak");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in with Keycloak.");
    }
  }

  function launchDemoWalkthrough(role: "OFFICER" | "SUPERVISOR" = "OFFICER") {
    const officer: AuthUser = {
      id: "demo-officer-local",
      email: "officer@example.gov",
      role: "OFFICER",
      fullName: "Demo Officer",
      badgeNumber: "1001"
    };
    const supervisor: AuthUser = {
      id: "demo-supervisor-local",
      email: "supervisor@example.gov",
      role: "SUPERVISOR",
      fullName: "Demo Supervisor",
      badgeNumber: "2001"
    };

    setDemoMode(true);
    setCurrentUser(role === "SUPERVISOR" ? supervisor : officer);
    setSupervisors([supervisor]);
    setIncidents([
      {
        id: "incident-demo-1",
        caseNumber: "2026-000123",
        title: "Burglary Report",
        status: "REVIEW",
        location: "12 Main St",
        occurredAt: new Date().toISOString(),
        createdById: officer.id,
        assignedSupervisorId: supervisor.id,
        createdBy: officer,
        assignedSupervisor: supervisor,
        participants: [
          { id: "p1", label: "Caller", displayName: "Caller", speakerKey: "speaker_1" },
          { id: "p2", label: "Witness", displayName: "Witness", speakerKey: "speaker_2" }
        ],
        transcriptDrafts: [
          {
            id: "t1",
            rawText: "Caller reported forced entry. Witness saw a person leave on foot.",
            diarizedJson: JSON.stringify({
              segments: [
                { speakerKey: "speaker_1", startMs: 0, endMs: 4200, text: "I came home and found the back door open." },
                { speakerKey: "speaker_2", startMs: 5000, endMs: 9100, text: "I saw someone run toward the alley." }
              ]
            })
          }
        ],
        generatedReports: [
          {
            id: "r1",
            body: "Officers responded to a reported burglary. The reporting party stated they returned home and found the back door open. A witness reported seeing an individual run toward the alley.",
            status: "PENDING_REVIEW",
            reviewNotes: null
          }
        ]
      }
    ]);
    setJobs([
      {
        id: "job-demo-1",
        type: "INGEST_AUDIO",
        status: "COMPLETED",
        incidentId: "incident-demo-1",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        resultJson: "{\"transcriptDraftId\":\"t1\"}"
      },
      {
        id: "job-demo-2",
        type: "GENERATE_REPORT",
        status: "COMPLETED",
        incidentId: "incident-demo-1",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        resultJson: "{\"reportId\":\"r1\"}"
      }
    ]);
    setNotifications([
      {
        id: "n1",
        title: "Generate Report completed",
        body: "2026-000123 - Burglary Report: draft narrative completed successfully.",
        type: "JOB_COMPLETED",
        createdAt: new Date().toISOString(),
        readAt: null
      }
    ]);
    setSelectedIncidentId("incident-demo-1");
    setScreen("home");
    setStatus(
      role === "SUPERVISOR"
        ? "Supervisor demo session loaded locally. Backend services are bypassed."
        : "Officer demo session loaded locally. Backend services are bypassed."
    );
  }

  useEffect(() => {
    refreshIncidents().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Unable to load incidents.");
    });
    refreshSupervisors().catch(() => undefined);
  }, [currentUser]);

  useEffect(() => {
    refreshJobs().catch(() => undefined);
    refreshNotifications().catch(() => undefined);
    if (!currentUser) {
      return;
    }

    const handle = setInterval(() => {
      refreshJobs().catch(() => undefined);
      refreshNotifications().catch(() => undefined);
    }, 3000);

    return () => clearInterval(handle);
  }, [currentUser, selectedIncidentId]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroShell}>
          <View style={styles.heroBrandRow}>
            <BrandLockup />
            <View style={styles.heroMetrics}>
              <MetricCard label="Active incident" value={selectedIncident ? selectedIncident.caseNumber : "None"} tone="accent" />
              <MetricCard label="Unread alerts" value={String(unreadCount)} tone={unreadCount > 0 ? "warning" : "success"} />
            </View>
          </View>
          <Text style={styles.heroHeadline}>Built for faster field capture and calmer review.</Text>
          <Text style={styles.heroBody}>
            Offense One keeps evidence collection, queue status, and narrative review in one mobile workspace so officers and supervisors spend less time hunting through steps.
          </Text>
          <View style={styles.heroRibbonRow}>
            <Tag label="Multi-speaker audio" />
            <Tag label="Scene imagery" />
            <Tag label="Officer-reviewed drafts" />
          </View>
        </View>

        {!currentUser ? (
          <SectionCard title="Start Your Shift" subtitle={status}>
            <View style={styles.onboardingGrid}>
              <View style={styles.onboardingCard}>
                <Text style={styles.onboardingTitle}>Officer access</Text>
                <Text style={styles.onboardingBody}>Open an incident, record the scene, and build a first narrative draft without leaving the device workflow.</Text>
                <AppButton label="Officer Login" onPress={signInAsOfficer} />
              </View>
              <View style={styles.onboardingCard}>
                <Text style={styles.onboardingTitle}>Supervisor access</Text>
                <Text style={styles.onboardingBody}>Review transcript-backed drafts, respond to queue alerts, and approve reports with less back-and-forth.</Text>
                <AppButton label="Supervisor Login" onPress={signInAsSupervisor} variant="secondary" />
              </View>
              <View style={styles.onboardingCard}>
                <Text style={styles.onboardingTitle}>Identity provider</Text>
                <Text style={styles.onboardingBody}>Use the Keycloak path when you are ready to validate the app against agency-managed accounts.</Text>
                <AppButton label="Keycloak Login" onPress={signInWithKeycloak} variant="ghost" />
              </View>
            </View>
            <View style={styles.secondaryActionRow}>
              <AppButton label="Open Demo Walkthrough" onPress={launchDemoWalkthrough} variant="ghost" />
            </View>
          </SectionCard>
        ) : (
          <SectionCard title="Session" subtitle={status}>
            <View style={styles.identityRow}>
              <Tag label={demoMode ? "Demo mode" : "Live mode"} active />
              <Tag label={`${currentUser.role} / ${currentUser.fullName}`} />
              {currentUser.badgeNumber ? <Tag label={`Badge ${currentUser.badgeNumber}`} /> : null}
            </View>
            <View style={styles.actionGrid}>
              <AppButton label="Refresh Data" onPress={() => refreshIncidents().catch(() => undefined)} variant="secondary" />
              <AppButton label="Open Demo Walkthrough" onPress={launchDemoWalkthrough} variant="ghost" />
            </View>
          </SectionCard>
        )}

        <View style={styles.quickStats}>
          <MetricCard label="Incidents" value={String(incidents.length)} />
          <MetricCard label="Queue items" value={String(jobs.length)} tone="accent" />
          <MetricCard label="Supervisors" value={String(supervisors.length)} tone="success" />
        </View>

        <ScrollView horizontal contentContainerStyle={styles.nav} showsHorizontalScrollIndicator={false}>
          {screenOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setScreen(option.key)}
              style={[styles.navButton, screen === option.key ? styles.navButtonActive : null]}
            >
              <Text style={[styles.navText, screen === option.key ? styles.navTextActive : null]}>{option.title}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {screen === "home" ? (
          <View style={styles.sectionStack}>
            <SectionCard
              title="Command Overview"
              subtitle="Keep the key field tasks visible and reduce how much hunting the officer has to do."
            >
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Selected incident</Text>
                <Text style={styles.summaryValue}>
                  {selectedIncident ? `${selectedIncident.caseNumber} / ${selectedIncident.title}` : "Choose or create an incident"}
                </Text>
                <Text style={styles.summaryMeta}>{selectedIncident?.location || "No location captured yet"}</Text>
              </View>
              <View style={styles.homeActionGrid}>
                <AppButton label="Open Incident Desk" onPress={() => setScreen("incident")} />
                <AppButton label="Capture Audio" onPress={() => setScreen("audio")} variant="secondary" />
                <AppButton label="Capture Camera" onPress={() => setScreen("camera")} variant="secondary" />
                <AppButton label="Review Narrative" onPress={() => setScreen("report")} variant="ghost" />
                <AppButton label="Open Settings" onPress={() => setScreen("settings")} variant="ghost" />
              </View>
            </SectionCard>

            <SectionCard title="Workflow Principles" subtitle="Designed for field clarity and defensible review.">
              <View style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>Evidence-first narrative</Text>
                <Text style={styles.ruleBody}>Audio, imagery, and timestamps stay visible throughout drafting so officers review grounded source material instead of black-box output.</Text>
              </View>
              <View style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>Queue transparency</Text>
                <Text style={styles.ruleBody}>Ingest, transcription, draft generation, and export each show their own status so nothing feels stuck or hidden.</Text>
              </View>
              <View style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>Supervisor-friendly handoff</Text>
                <Text style={styles.ruleBody}>Assignments, notifications, and approval states are built into the same flow rather than spread across separate tools.</Text>
              </View>
            </SectionCard>

            <SectionCard title="App Identity" subtitle="Brand assets are ready to export into production icon and splash artwork.">
              <View style={styles.brandPreviewCard}>
                <BrandMark size={88} />
                <View style={styles.brandPreviewCopy}>
                  <Text style={styles.brandPreviewTitle}>Offense One mark</Text>
                  <Text style={styles.brandPreviewBody}>A compact O1 monogram with a command-grade palette for app icon, splash, and badge use.</Text>
                </View>
              </View>
            </SectionCard>
          </View>
        ) : null}

        {screen === "incident" ? (
          <NewIncidentScreen
            currentUser={currentUser}
            incidents={incidents}
            supervisors={supervisors}
            onCreated={refreshIncidents}
            onSelectIncident={setSelectedIncidentId}
            selectedIncidentId={selectedIncidentId}
          />
        ) : null}

        {screen === "audio" ? <AudioCaptureScreen currentUser={currentUser} selectedIncidentId={selectedIncidentId} onUploaded={refreshIncidents} /> : null}
        {screen === "camera" ? <CameraCaptureScreen selectedIncidentId={selectedIncidentId} onUploaded={refreshIncidents} /> : null}
        {screen === "report" ? <DraftReportScreen currentUser={currentUser} selectedIncident={selectedIncident} onRefresh={refreshIncidents} /> : null}
        {screen === "jobs" ? <JobsScreen jobs={jobs} selectedIncidentId={selectedIncidentId} /> : null}
        {screen === "notifications" ? <NotificationsScreen notifications={notifications} onRead={handleReadNotification} /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.surface
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg
  },
  heroMetrics: {
    gap: theme.spacing.sm
  },
  heroShell: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadow.card
  },
  heroBrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md
  },
  heroHeadline: {
    fontSize: 26,
    fontWeight: "900",
    color: "#f8fafc",
    maxWidth: 520
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 23,
    color: "#c9d6dc",
    maxWidth: 640
  },
  heroRibbonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  identityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  quickStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  nav: {
    gap: theme.spacing.sm,
    paddingBottom: 4
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.navIdle,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  navButtonActive: {
    backgroundColor: theme.colors.accent
  },
  navText: {
    color: theme.colors.text,
    fontWeight: "700"
  },
  navTextActive: {
    color: "#f7fafc"
  },
  sectionStack: {
    gap: theme.spacing.lg
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: theme.colors.muted
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  summaryMeta: {
    fontSize: 14,
    color: theme.colors.muted
  },
  homeActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  onboardingGrid: {
    gap: theme.spacing.sm
  },
  onboardingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  onboardingBody: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  },
  secondaryActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  ruleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs
  },
  ruleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  },
  ruleBody: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  },
  brandPreviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md
  },
  brandPreviewCopy: {
    flex: 1,
    gap: theme.spacing.xs
  },
  brandPreviewTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  brandPreviewBody: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text
  }
});
