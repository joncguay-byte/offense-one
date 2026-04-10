import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
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
import { setSessionToken, type AuthUser, type IncidentRecord } from "./src/lib/api";
import {
  canUseBiometrics,
  clearLoginPreference,
  getLocalUser,
  isLocalCredential,
  loadLocalUser,
  loadLoginPreference,
  saveLocalAccountProfile,
  saveLoginPreference,
  unlockWithBiometrics,
  type LocalAccountProfile,
  type LocalLoginRole,
  type SavedLogin
} from "./src/lib/auth-preferences";
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
  const [status, setStatus] = useState("Sign in to begin field capture.");
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState("officer@example.gov");
  const [loginPassword, setLoginPassword] = useState("ChangeMe123!");
  const [loginRole, setLoginRole] = useState<LocalLoginRole>("OFFICER");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [savedLogin, setSavedLogin] = useState<SavedLogin | null>(null);
  const [biometricsReady, setBiometricsReady] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) || null,
    [incidents, selectedIncidentId]
  );

  async function refreshIncidents() {
    if (!currentUser || standaloneMode) {
      return;
    }

    const nextIncidents = await loadIncidents();
    setIncidents(nextIncidents);
    if (!selectedIncidentId && nextIncidents[0]) {
      setSelectedIncidentId(nextIncidents[0].id);
    }
  }

  async function refreshJobs() {
    if (!currentUser || standaloneMode) {
      return;
    }

    const nextJobs = await loadJobs({
      incidentId: selectedIncidentId || undefined,
      take: 20
    });
    setJobs(nextJobs);
  }

  async function refreshNotifications() {
    if (!currentUser || standaloneMode) {
      return;
    }

    const nextNotifications = await loadNotifications(20);
    setNotifications(nextNotifications);
  }

  async function refreshSupervisors() {
    if (!currentUser || standaloneMode) {
      return;
    }

    const nextSupervisors = await loadSupervisors();
    setSupervisors(nextSupervisors);
  }

  async function handleReadNotification(notificationId: string) {
    await readNotification(notificationId);
    await refreshNotifications();
  }

  function createLocalIncident(payload: { caseNumber: string; title: string; location?: string }) {
    if (!currentUser) {
      return;
    }

    const supervisor = supervisors[0] || getLocalUser("SUPERVISOR");
    const incident: IncidentRecord = {
      id: `local-${Date.now()}`,
      caseNumber: payload.caseNumber,
      title: payload.title,
      status: "DRAFT",
      location: payload.location || null,
      occurredAt: new Date().toISOString(),
      createdById: currentUser.id,
      assignedSupervisorId: supervisor.id,
      createdBy: currentUser,
      assignedSupervisor: supervisor,
      participants: [],
      transcriptDrafts: [],
      evidenceItems: [],
      generatedReports: []
    };

    setIncidents((current) => [incident, ...current]);
    setSelectedIncidentId(incident.id);
    setScreen("audio");
    setStatus("Local incident created. Recorder is ready.");
  }

  function assignLocalSupervisor(incidentId: string, supervisor: AuthUser) {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === incidentId
          ? {
              ...incident,
              assignedSupervisorId: supervisor.id,
              assignedSupervisor: supervisor
            }
          : incident
      )
    );
  }

  function generateLocalReport(incidentId: string, body: string, reviewNotes?: string) {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === incidentId
          ? {
              ...incident,
              status: "REVIEW",
              generatedReports: [
                {
                  id: `local-report-${Date.now()}`,
                  body,
                  status: "PENDING_REVIEW",
                  reviewNotes: reviewNotes || null,
                  citationsJson: JSON.stringify([
                    {
                      sourceType: "DEVICE_CAPTURE",
                      sourceId: incident.id,
                      sourceLabel: "Device evidence",
                      note: "Generated from device-captured context.",
                      excerpt: "Backend transcription and AI citations require hosted API setup."
                    }
                  ]),
                  confidenceJson: JSON.stringify({
                    overall: "low",
                    notes: ["Device-generated draft. Connect the agency API for transcript-backed AI drafting."]
                  })
                },
                ...incident.generatedReports
              ]
            }
          : incident
      )
    );
  }

  async function completeSignIn(user: AuthUser, modeLabel: string) {
    setStandaloneMode(false);
    setCurrentUser(user);
    setScreen("audio");
    const expoToken = await registerForExpoPushToken();
    if (expoToken) {
      await registerPushToken("EXPO", expoToken);
      setStatus(`${modeLabel} as ${user.fullName}. Push ready.`);
    } else {
      setStatus(`${modeLabel} as ${user.fullName}. Push token unavailable on this device or project.`);
    }
  }

  async function ensureLocalIncident(userRole: LocalLoginRole) {
    const officer = await loadLocalUser("OFFICER");
    const supervisor = await loadLocalUser("SUPERVISOR");
    const signedInUser = userRole === "SUPERVISOR" ? supervisor : officer;

    setStandaloneMode(true);
    setCurrentUser(signedInUser);
    setSupervisors([supervisor]);
    setIncidents([
      {
        id: "local-incident-1",
        caseNumber: "LOCAL-0001",
        title: "New Field Recording",
        status: "DRAFT",
        location: "Current call for service",
        occurredAt: new Date().toISOString(),
        createdById: officer.id,
        assignedSupervisorId: supervisor.id,
        createdBy: officer,
        assignedSupervisor: supervisor,
        participants: [],
        transcriptDrafts: [],
        generatedReports: []
      }
    ]);
    setJobs([]);
    setNotifications([]);
    setSelectedIncidentId("local-incident-1");
    setScreen("audio");
    setStatus("Signed in. Recording, camera, settings, and review screens are available. Cloud sync requires the agency API.");
  }

  async function persistLoginIfNeeded(role: LocalLoginRole) {
    if (rememberLogin) {
      const nextLogin = { email: loginEmail, password: loginPassword, role };
      await saveLoginPreference(nextLogin);
      setSavedLogin(nextLogin);
      return;
    }

    await clearLoginPreference();
    setSavedLogin(null);
  }

  async function signInWithRole(role: LocalLoginRole) {
    setLoginBusy(true);
    setLoginRole(role);
    try {
      if (role === "OFFICER") {
        const session = await signInOfficer();
        await persistLoginIfNeeded(role);
        await completeSignIn(session.user, "Signed in");
      } else {
        const session = await signInSupervisor();
        await persistLoginIfNeeded(role);
        await completeSignIn(session.user, "Signed in");
      }
    } catch {
      if (!(await isLocalCredential(loginEmail, loginPassword, role))) {
        setStatus("Login failed. Check the saved username/password for this role, or connect agency login.");
        return;
      }

      await persistLoginIfNeeded(role);
      await ensureLocalIncident(role);
    } finally {
      setLoginBusy(false);
    }
  }

  async function signInAsOfficer() {
    await signInWithRole("OFFICER");
  }

  async function signInAsSupervisor() {
    await signInWithRole("SUPERVISOR");
  }

  async function signInWithSavedLogin() {
    if (!savedLogin) {
      setStatus("No saved login is available yet.");
      return;
    }

    setLoginEmail(savedLogin.email);
    setLoginPassword(savedLogin.password);
    setLoginRole(savedLogin.role);
    setLoginBusy(true);
    try {
      if (biometricsReady) {
        const result = await unlockWithBiometrics();
        if (!result.success) {
          setStatus("Biometric unlock was canceled.");
          return;
        }
      }
      if (!(await isLocalCredential(savedLogin.email, savedLogin.password, savedLogin.role))) {
        setStatus("Saved login no longer matches this device account. Enter the updated password.");
        return;
      }
      await ensureLocalIncident(savedLogin.role);
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLocalAccountUpdated(profile: LocalAccountProfile) {
    const user = await saveLocalAccountProfile(profile);
    if (currentUser?.role === profile.role) {
      setCurrentUser(user);
      setLoginEmail(profile.email);
      setLoginPassword(profile.password);
      setLoginRole(profile.role);
      if (rememberLogin) {
        const nextLogin = { email: profile.email, password: profile.password, role: profile.role };
        await saveLoginPreference(nextLogin);
        setSavedLogin(nextLogin);
      }
      setIncidents((current) =>
        current.map((incident) =>
          profile.role === "SUPERVISOR"
            ? { ...incident, assignedSupervisorId: user.id, assignedSupervisor: user }
            : { ...incident, createdById: user.id, createdBy: user }
        )
      );
    }
    setStatus(`${profile.role === "SUPERVISOR" ? "Supervisor" : "Officer"} account updated.`);
  }

  async function signOut() {
    setSessionToken(null);
    setCurrentUser(null);
    setStandaloneMode(false);
    setSelectedIncidentId(null);
    setIncidents([]);
    setJobs([]);
    setNotifications([]);
    setScreen("home");
    setStatus("Signed out. Use your saved login, biometrics, or username and password to continue.");
  }

  async function signInWithKeycloak() {
    try {
      const session = await signInOidc();
      await completeSignIn(session.user, "Signed in with Keycloak");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in with Keycloak.");
    }
  }

  useEffect(() => {
    refreshIncidents().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Unable to load incidents.");
    });
    refreshSupervisors().catch(() => undefined);
  }, [currentUser]);

  useEffect(() => {
    loadLoginPreference()
      .then((login) => {
        if (!login) {
          return;
        }
        setSavedLogin(login);
        setLoginEmail(login.email);
        setLoginPassword(login.password);
        setLoginRole(login.role);
      })
      .catch(() => undefined);

    canUseBiometrics()
      .then(setBiometricsReady)
      .catch(() => setBiometricsReady(false));
  }, []);

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
            <AppButton label="Multi-speaker Audio" onPress={() => setScreen("audio")} variant="secondary" />
            <AppButton label="Scene Imagery" onPress={() => setScreen("camera")} variant="secondary" />
            <AppButton label="Officer-reviewed Drafts" onPress={() => setScreen("report")} variant="secondary" />
          </View>
        </View>

        {!currentUser ? (
          <SectionCard title="Offense One Login" subtitle={status}>
            <View style={styles.loginPanel}>
              <View style={styles.roleRow}>
                <AppButton label="Officer" onPress={() => setLoginRole("OFFICER")} variant={loginRole === "OFFICER" ? "primary" : "ghost"} />
                <AppButton label="Supervisor" onPress={() => setLoginRole("SUPERVISOR")} variant={loginRole === "SUPERVISOR" ? "primary" : "ghost"} />
              </View>
              <TextInput
                value={loginEmail}
                onChangeText={setLoginEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
              />
              <TextInput
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                placeholder="Password"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Save login on this device</Text>
                <Switch value={rememberLogin} onValueChange={setRememberLogin} />
              </View>
              <View style={styles.actionGrid}>
                <AppButton
                  label={loginRole === "SUPERVISOR" ? "Login as Supervisor" : "Login as Officer"}
                  onPress={loginRole === "SUPERVISOR" ? signInAsSupervisor : signInAsOfficer}
                  disabled={loginBusy}
                />
                <AppButton label={biometricsReady ? "Use Biometrics" : "Use Saved Login"} onPress={signInWithSavedLogin} disabled={loginBusy || !savedLogin} variant="secondary" />
                <AppButton label="Keycloak / Agency Login" onPress={signInWithKeycloak} disabled={loginBusy} variant="ghost" />
              </View>
              <Text style={styles.loginHint}>
                Credentials: officer@example.gov or supervisor@example.gov with password ChangeMe123!. Agency login requires the backend API to be deployed.
              </Text>
            </View>
          </SectionCard>
        ) : (
          <SectionCard title="Session" subtitle={status}>
            <View style={styles.identityRow}>
              <Tag label={standaloneMode ? "Standalone mode" : "Live mode"} active />
              <Tag label={`${currentUser.role} / ${currentUser.fullName}`} />
              {currentUser.badgeNumber ? <Tag label={`Badge ${currentUser.badgeNumber}`} /> : null}
            </View>
            <View style={styles.actionGrid}>
              <AppButton label="Refresh Data" onPress={() => refreshIncidents().catch(() => undefined)} variant="secondary" />
              <AppButton label="Sign Out" onPress={() => void signOut()} variant="ghost" />
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
              title="Start Recording"
              subtitle="Audio capture is the primary field action. Use this first, then add scene imagery or review the draft."
            >
              <View style={styles.primaryCaptureCard}>
                <Text style={styles.primaryCaptureTitle}>Ready for field audio</Text>
                <Text style={styles.primaryCaptureBody}>
                  Selected incident: {selectedIncident ? `${selectedIncident.caseNumber} / ${selectedIncident.title}` : "none yet"}
                </Text>
                <View style={styles.homeActionGrid}>
                  <AppButton label="Open Recorder" onPress={() => setScreen("audio")} />
                  <AppButton label="Take Call Photo" onPress={() => setScreen("camera")} variant="secondary" />
                  <AppButton label="Review Draft" onPress={() => setScreen("report")} variant="ghost" />
                </View>
              </View>
            </SectionCard>
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
            localMode={standaloneMode}
            onCreated={refreshIncidents}
            onLocalCreated={createLocalIncident}
            onLocalAssigned={assignLocalSupervisor}
            onSelectIncident={setSelectedIncidentId}
            selectedIncidentId={selectedIncidentId}
          />
        ) : null}

        {screen === "audio" ? <AudioCaptureScreen currentUser={currentUser} selectedIncidentId={selectedIncidentId} onUploaded={refreshIncidents} /> : null}
        {screen === "camera" ? <CameraCaptureScreen selectedIncidentId={selectedIncidentId} onUploaded={refreshIncidents} /> : null}
        {screen === "report" ? <DraftReportScreen currentUser={currentUser} selectedIncident={selectedIncident} onRefresh={refreshIncidents} onLocalReportGenerated={generateLocalReport} /> : null}
        {screen === "jobs" ? <JobsScreen jobs={jobs} selectedIncidentId={selectedIncidentId} /> : null}
        {screen === "notifications" ? <NotificationsScreen notifications={notifications} onRead={handleReadNotification} /> : null}
        {screen === "settings" ? <SettingsScreen currentUser={currentUser} onLocalAccountUpdated={handleLocalAccountUpdated} onSignOut={signOut} /> : null}
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
  loginPanel: {
    gap: theme.spacing.md
  },
  roleRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap"
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.md
  },
  switchLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  loginHint: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 20
  },
  primaryCaptureCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  primaryCaptureTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  primaryCaptureBody: {
    color: "#c9d6dc",
    fontSize: 15,
    lineHeight: 22
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
