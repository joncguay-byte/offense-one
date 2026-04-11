import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { createAudioPlayer } from "expo-audio";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { SafeAreaView } from "react-native-safe-area-context";
import type { JobRecord, NotificationRecord } from "./src/lib/shared-types";
import AudioCaptureScreen from "./app/capture/audio";
import CameraCaptureScreen from "./app/capture/camera";
import JobsScreen from "./app/jobs/index";
import NotificationsScreen from "./app/notifications/index";
import SettingsScreen from "./app/settings/index";
import {
  createIncidentWorkflow,
  loadIncidents,
  loadJobs,
  loadNotifications,
  loadSupervisors,
  readNotification,
  registerPushToken,
  signInWithPassword,
  signInOidc,
  signInOfficer,
  signInSupervisor,
  signUpWithPassword,
  generateDraftNarrative,
  getJobStatus,
  ingestDraftAudioEvidence,
  uploadDraftEvidence
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
import { deleteLocalEvidenceForIncident, loadLocalEvidence, setLocalEvidenceSelected, type LocalEvidenceRecord } from "./src/lib/local-evidence";
import { BrandLockup } from "./src/ui/brand";
import { AppButton, EmptyState, MetricCard, SectionCard, Tag } from "./src/ui/components";
import { formatDateTime, theme } from "./src/ui/theme";

type ScreenKey = "recording" | "event" | "history" | "supervisor" | "settings";

const screenOptions: Array<{ key: ScreenKey; title: string }> = [
  { key: "recording", title: "Recording" },
  { key: "event", title: "Event" },
  { key: "history", title: "History" },
  { key: "supervisor", title: "Supervisor" },
  { key: "settings", title: "Settings" }
];

const RECORDING_INBOX_ID = "recording-inbox";

export default function App() {
  const appSessionVersion = Updates.updateId || Updates.runtimeVersion || Constants.expoConfig?.version || "development";
  const [screen, setScreen] = useState<ScreenKey>("recording");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [supervisors, setSupervisors] = useState<AuthUser[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [archivedIncidentIds, setArchivedIncidentIds] = useState<string[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [status, setStatus] = useState("Sign in to begin field capture.");
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState("officer@example.gov");
  const [loginPassword, setLoginPassword] = useState("ChangeMe123!");
  const [loginRole, setLoginRole] = useState<LocalLoginRole>("OFFICER");
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [signupName, setSignupName] = useState("");
  const [signupBadge, setSignupBadge] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [savedLogin, setSavedLogin] = useState<SavedLogin | null>(null);
  const [localEvidence, setLocalEvidence] = useState<LocalEvidenceRecord[]>([]);
  const [caseNumber, setCaseNumber] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [biometricsReady, setBiometricsReady] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const eventPlaybackPlayer = useMemo(() => createAudioPlayer(null), []);

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
    setScreen("event");
    setStatus("Event created. Add photos and choose recordings for the draft.");
  }

  async function createEventFromForm() {
    if (!caseNumber.trim() || !eventTitle.trim()) {
      setStatus("Case number and event title are required.");
      return;
    }

    try {
      if (!standaloneMode && currentUser) {
        const incident = await createIncidentWorkflow({
          caseNumber: caseNumber.trim(),
          title: eventTitle.trim(),
          location: eventLocation.trim() || undefined,
          occurredAt: new Date().toISOString(),
          createdById: currentUser.id
        });
        setIncidents((current) => [incident, ...current]);
        setSelectedIncidentId(incident.id);
        setScreen("event");
        setStatus("Event created. Add photos and choose recordings for the draft.");
      } else {
        createLocalIncident({
          caseNumber: caseNumber.trim(),
          title: eventTitle.trim(),
          location: eventLocation.trim() || undefined
        });
      }
      setCaseNumber("");
      setEventTitle("");
      setEventLocation("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create event.");
    }
  }

  async function saveSelectedEventDetails() {
    if (!selectedIncident) {
      await createEventFromForm();
      return;
    }

    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id
          ? {
              ...incident,
              caseNumber: caseNumber.trim() || incident.caseNumber,
              title: eventTitle.trim() || incident.title,
              location: eventLocation.trim() || null
            }
          : incident
      )
    );
    setStatus("Event details saved.");
  }

  function selectEvent(incident: IncidentRecord) {
    setSelectedIncidentId(incident.id);
    setCaseNumber(incident.caseNumber);
    setEventTitle(incident.title);
    setEventLocation(incident.location || "");
  }

  async function deleteSelectedIncident() {
    if (!selectedIncident) {
      setStatus("Select an incident first.");
      return;
    }

    await deleteLocalEvidenceForIncident(selectedIncident.id);
    setIncidents((current) => current.filter((incident) => incident.id !== selectedIncident.id));
    setArchivedIncidentIds((current) => current.filter((incidentId) => incidentId !== selectedIncident.id));
    setSelectedIncidentId(null);
    setLocalEvidence([]);
    setCaseNumber("");
    setEventTitle("");
    setEventLocation("");
    setStatus("Incident deleted.");
  }

  function archiveSelectedIncident() {
    if (!selectedIncident) {
      setStatus("Select an incident first.");
      return;
    }

    setArchivedIncidentIds((current) => (current.includes(selectedIncident.id) ? current : [...current, selectedIncident.id]));
    setStatus("Incident archived.");
  }

  function restoreSelectedIncident() {
    if (!selectedIncident) {
      setStatus("Select an incident first.");
      return;
    }

    setArchivedIncidentIds((current) => current.filter((incidentId) => incidentId !== selectedIncident.id));
    setStatus("Incident restored.");
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

  async function waitForDraftJob(jobId: string, label: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const job = await getJobStatus(jobId);
      if (job.status === "COMPLETED") {
        return job;
      }
      if (job.status === "FAILED") {
        throw new Error(job.errorMessage || `${label} failed.`);
      }
      setStatus(`${label} ${job.status.toLowerCase()}...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error(`${label} is still running. Check Jobs for the final result.`);
  }

  async function generateEventDraft() {
    if (!selectedIncident) {
      setStatus("Create or select an event first.");
      return;
    }

    const selectedEvidence = localEvidence.filter((record) => record.selectedForDraft);
    const selectedAudio = selectedEvidence.filter((record) => record.type === "AUDIO");
    if (selectedEvidence.length === 0 || selectedAudio.length === 0) {
      setStatus("Select at least one audio recording for AI narrative drafting. Photos and videos can be added as supporting context.");
      return;
    }

    if (standaloneMode || selectedIncident.id.startsWith("local-")) {
      generateLocalReport(
        selectedIncident.id,
        [
          "AI narrative drafting is not available in local-only mode.",
          "To interpret the selected conversation and scene imagery, Offense One needs the hosted API running with an OpenAI API key so audio can be transcribed/diarized and photos can be analyzed.",
          "",
          `Selected evidence ready for drafting: ${selectedEvidence.map((record) => record.fileName).join(", ")}`,
          draftNotes ? `Officer notes: ${draftNotes}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        draftNotes
      );
      setStatus("Selected evidence is ready, but AI interpretation requires the hosted API/OpenAI setup.");
      return;
    }

    try {
      setStatus("Uploading selected evidence for AI interpretation...");
      const uploadedEvidence = [];
      for (const record of selectedEvidence) {
        if (record.type === "VIDEO") {
          continue;
        }
        uploadedEvidence.push(
          await uploadDraftEvidence({
            incidentId: selectedIncident.id,
            type: record.type,
            uri: record.savedUri,
            fileName: record.fileName,
            currentUser,
            label: record.label
          })
        );
      }

      const uploadedAudio = uploadedEvidence.filter((record) => record.type === "AUDIO");
      for (const audio of uploadedAudio) {
        const ingestJob = await ingestDraftAudioEvidence(selectedIncident.id, audio.id, currentUser);
        await waitForDraftJob(ingestJob.jobId, `Transcribing ${audio.path.split(/[\\/]/).pop() || "audio"}`);
      }

      setStatus("Generating AI narrative from selected transcript and scene context...");
      const reportJob = await generateDraftNarrative(selectedIncident.id, {
        incidentTitle: selectedIncident.title,
        officerPerspective: currentUser?.fullName || "Reporting officer",
        objective: draftNotes || "Generate a neutral police narrative report draft from selected evidence.",
        includeSceneSummary: uploadedEvidence.some((record) => record.type === "IMAGE"),
        includeWitnessSummary: true,
        includeCallForServiceContext: true,
        selectedEvidenceIds: uploadedEvidence.map((record) => record.id)
      });
      await waitForDraftJob(reportJob.jobId, "Generating narrative");
      await refreshIncidents();
      setStatus("AI draft narrative generated from the selected audio and imagery. Review before use.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to generate draft narrative.");
    }
  }

  async function completeSignIn(user: AuthUser, modeLabel: string) {
    setStandaloneMode(false);
    setCurrentUser(user);
    setIncidents([]);
    setSelectedIncidentId(null);
    setJobs([]);
    setNotifications([]);
    setScreen("recording");
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
    const admin = await loadLocalUser("ADMIN");
    const signedInUser = userRole === "ADMIN" ? admin : userRole === "SUPERVISOR" ? supervisor : officer;

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
    setScreen("recording");
    setStatus("Signed in. Recording, camera, settings, and review screens are available. Cloud sync requires the agency API.");
  }

  async function persistLoginIfNeeded(role: LocalLoginRole) {
    if (rememberLogin) {
      const nextLogin = { email: loginEmail.trim(), password: loginPassword, role, sessionVersion: appSessionVersion };
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
      const session =
        loginEmail.trim() && loginPassword
          ? await signInWithPassword(loginEmail.trim(), loginPassword)
          : role === "OFFICER"
            ? await signInOfficer()
            : role === "SUPERVISOR"
              ? await signInSupervisor()
              : await signInWithPassword(loginEmail.trim(), loginPassword);
      await persistLoginIfNeeded(role);
      await completeSignIn(session.user, "Signed in");
    } catch (error) {
      if (role === "ADMIN" && (await isLocalCredential(loginEmail, loginPassword, role))) {
        await persistLoginIfNeeded(role);
        await ensureLocalIncident(role);
        return;
      }

      setStatus(error instanceof Error ? error.message : "Login failed. Check the username/password or backend connection.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function signUpLocalAccount() {
    const email = loginEmail.trim();
    const password = loginPassword;
    const fullName = signupName.trim() || (loginRole === "ADMIN" ? "Admin User" : loginRole === "SUPERVISOR" ? "Supervisor User" : "Officer User");

    if (!email || !password) {
      setStatus("Email and password are required to create an account.");
      return;
    }

    setLoginBusy(true);
    try {
      const session = await signUpWithPassword({
        email,
        password,
        fullName,
        badgeNumber: signupBadge.trim() || null,
        role: loginRole
      });
      await persistLoginIfNeeded(loginRole);
      setRememberLogin(true);
      setAuthMode("signIn");
      await completeSignIn(session.user, "Account created and signed in");
      setStatus(`Account created for ${fullName}. You will stay signed in until you log out or the app updates.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backend signup failed. Check API access and try again.");
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

  async function signInAsAdmin() {
    await signInWithRole("ADMIN");
  }

  async function signInWithSavedLogin() {
    if (!savedLogin) {
      setStatus("No saved login is available yet.");
      return;
    }

    setLoginEmail(savedLogin.email);
    setLoginPassword(savedLogin.password);
    setLoginRole(savedLogin.role);
    if (savedLogin.sessionVersion !== appSessionVersion) {
      setStatus("The app was updated. Please sign in again to continue.");
      return;
    }
    setLoginBusy(true);
    try {
      if (biometricsReady) {
        const result = await unlockWithBiometrics();
        if (!result.success) {
          setStatus("Biometric unlock was canceled.");
          return;
        }
      }
      if (savedLogin.role === "ADMIN") {
        if (!(await isLocalCredential(savedLogin.email, savedLogin.password, savedLogin.role))) {
          setStatus("Saved login no longer matches this device account. Enter the updated password.");
          return;
        }
        await ensureLocalIncident(savedLogin.role);
        return;
      }
      const session = await signInWithPassword(savedLogin.email, savedLogin.password);
      await completeSignIn(session.user, "Signed in");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Saved login failed. Sign in again.");
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
        const nextLogin = { email: profile.email, password: profile.password, role: profile.role, sessionVersion: appSessionVersion };
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
    await clearLoginPreference();
    setSavedLogin(null);
    setCurrentUser(null);
    setStandaloneMode(false);
    setSelectedIncidentId(null);
    setIncidents([]);
    setJobs([]);
    setNotifications([]);
    setLocalEvidence([]);
    setScreen("recording");
    setStatus("Signed out. Enter your email and password to continue.");
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
      .then(async (login) => {
        if (!login) {
          return;
        }
        setSavedLogin(login);
        setLoginEmail(login.email);
        setLoginPassword(login.password);
        setLoginRole(login.role);
        if (login.sessionVersion !== appSessionVersion) {
          setStatus("The app was updated. Please sign in again to continue.");
          return;
        }
        if (login.role === "ADMIN" && (await isLocalCredential(login.email, login.password, login.role))) {
          setLoginBusy(true);
          try {
            await ensureLocalIncident(login.role);
          } finally {
            setLoginBusy(false);
          }
          return;
        }
        setLoginBusy(true);
        try {
          const session = await signInWithPassword(login.email, login.password);
          await completeSignIn(session.user, "Signed in");
        } catch {
          setStatus("Saved login could not reach the backend. Sign in again.");
        } finally {
          setLoginBusy(false);
        }
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

  useEffect(() => {
    if (!selectedIncident) {
      return;
    }

    setCaseNumber(selectedIncident.caseNumber);
    setEventTitle(selectedIncident.title);
    setEventLocation(selectedIncident.location || "");
  }, [selectedIncidentId]);

  useEffect(() => {
    loadLocalEvidence()
      .then(setLocalEvidence)
      .catch(() => setLocalEvidence([]));
  }, [selectedIncidentId, status]);

  async function refreshLocalEvidence() {
    setLocalEvidence(await loadLocalEvidence());
  }

  async function toggleEvidenceForDraft(record: LocalEvidenceRecord) {
    await setLocalEvidenceSelected(record.id, !record.selectedForDraft);
    await refreshLocalEvidence();
  }

  async function playEventRecording(record: LocalEvidenceRecord) {
    try {
      eventPlaybackPlayer.pause();
      eventPlaybackPlayer.replace({ uri: record.savedUri });
      eventPlaybackPlayer.volume = 1;
      eventPlaybackPlayer.play();
      setStatus(`Playing: ${record.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to play recording.");
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const audioRecordings = localEvidence.filter((record) => record.type === "AUDIO");
  const selectedRecordings = localEvidence.filter((record) => record.type === "AUDIO" && record.selectedForDraft);
  const sceneEvidence = localEvidence.filter(
    (record) => (record.type === "IMAGE" || record.type === "VIDEO") && (!selectedIncidentId || record.incidentId === selectedIncidentId)
  );

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.loginScreen}>
          <View style={styles.loginBrand}>
            <BrandLockup />
          </View>
          <SectionCard title={authMode === "signUp" ? "Create Account" : "Sign In"} subtitle={status}>
            <View style={styles.loginPanel}>
              <View style={styles.roleRow}>
                <AppButton label="Officer" onPress={() => setLoginRole("OFFICER")} variant={loginRole === "OFFICER" ? "primary" : "ghost"} />
                <AppButton label="Supervisor" onPress={() => setLoginRole("SUPERVISOR")} variant={loginRole === "SUPERVISOR" ? "primary" : "ghost"} />
                <AppButton label="Admin" onPress={() => setLoginRole("ADMIN")} variant={loginRole === "ADMIN" ? "primary" : "ghost"} />
              </View>
              {authMode === "signUp" ? (
                <>
                  <TextInput
                    value={signupName}
                    onChangeText={setSignupName}
                    autoCapitalize="words"
                    placeholder="Full name"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.input}
                  />
                  <TextInput
                    value={signupBadge}
                    onChangeText={setSignupBadge}
                    autoCapitalize="characters"
                    placeholder="Badge or ID number (optional)"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.input}
                  />
                </>
              ) : null}
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
                {authMode === "signUp" ? (
                  <AppButton label="Create Account" onPress={signUpLocalAccount} disabled={loginBusy} />
                ) : (
                  <>
                    <AppButton
                      label={loginRole === "ADMIN" ? "Login as Admin" : loginRole === "SUPERVISOR" ? "Login as Supervisor" : "Login as Officer"}
                      onPress={loginRole === "ADMIN" ? signInAsAdmin : loginRole === "SUPERVISOR" ? signInAsSupervisor : signInAsOfficer}
                      disabled={loginBusy}
                    />
                    <AppButton label={biometricsReady ? "Use Biometrics" : "Use Saved Login"} onPress={signInWithSavedLogin} disabled={loginBusy || !savedLogin} variant="secondary" />
                    <AppButton label="Agency Login" onPress={signInWithKeycloak} disabled={loginBusy} variant="ghost" />
                  </>
                )}
                <AppButton
                  label={authMode === "signUp" ? "Back to Sign In" : "Sign Up"}
                  onPress={() => setAuthMode(authMode === "signUp" ? "signIn" : "signUp")}
                  disabled={loginBusy}
                  variant="secondary"
                />
              </View>
            </View>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <BrandLockup />
          <View style={styles.identityRow}>
            <Tag label={`${currentUser.role} / ${currentUser.fullName}`} />
            <AppButton label="Sign Out" onPress={() => void signOut()} variant="ghost" />
          </View>
        </View>

        <View style={styles.quickStats}>
          <MetricCard label="Events" value={String(incidents.length)} />
          <MetricCard label="Recordings" value={String(localEvidence.filter((record) => record.type === "AUDIO").length)} tone="accent" />
          <MetricCard label="Draft picks" value={String(selectedRecordings.length)} tone="success" />
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

        {screen === "recording" ? (
          <View style={styles.sectionStack}>
            <AudioCaptureScreen currentUser={currentUser} selectedIncidentId={selectedIncidentId} onUploaded={refreshIncidents} onEvidenceSaved={refreshLocalEvidence} />
          </View>
        ) : null}

        {screen === "event" ? (
          <SectionCard title="Event" subtitle={status}>
            <TextInput value={caseNumber} onChangeText={setCaseNumber} placeholder="Case number" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <TextInput value={eventTitle} onChangeText={setEventTitle} placeholder="Event label" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <TextInput value={eventLocation} onChangeText={setEventLocation} placeholder="Location" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <View style={styles.actionGrid}>
              <AppButton label={selectedIncident ? "Save Event Details" : "Create Incident"} onPress={() => void saveSelectedEventDetails()} />
              <AppButton label="Create New Event" onPress={() => void createEventFromForm()} variant="secondary" />
              <AppButton label={selectedIncident && archivedIncidentIds.includes(selectedIncident.id) ? "Restore Incident" : "Archive Incident"} onPress={selectedIncident && archivedIncidentIds.includes(selectedIncident.id) ? restoreSelectedIncident : archiveSelectedIncident} disabled={!selectedIncident} variant="ghost" />
              <AppButton label="Delete Incident" onPress={() => void deleteSelectedIncident()} disabled={!selectedIncident} variant="danger" />
              {incidents.map((incident) => (
                <AppButton
                  key={incident.id}
                  label={selectedIncidentId === incident.id ? `${incident.caseNumber} Selected` : `Open ${incident.caseNumber}`}
                  onPress={() => selectEvent(incident)}
                  variant={selectedIncidentId === incident.id ? "secondary" : "ghost"}
                />
              ))}
            </View>

            <View style={styles.eventDivider} />
            <Text style={styles.eventSectionTitle}>Audio Recordings for Draft</Text>
              {audioRecordings.length === 0 ? (
                <EmptyState title="No saved recordings yet" body="Save recordings from the Recording module, then choose them here." />
              ) : (
                audioRecordings.map((record) => (
                  <View key={record.id} style={[styles.evidenceCard, record.selectedForDraft ? styles.evidenceCardSelected : null]}>
                    <View style={styles.checkboxRow}>
                      <Switch value={!!record.selectedForDraft} onValueChange={() => void toggleEvidenceForDraft(record)} />
                      <View style={styles.evidenceCopy}>
                        <Text style={styles.evidenceTitle}>Use this recording</Text>
                        <Text style={styles.evidenceMeta}>{formatDateTime(record.createdAt)}</Text>
                        <Text style={styles.evidenceMeta}>{record.fileName}</Text>
                      </View>
                      <AppButton label="Play" onPress={() => void playEventRecording(record)} variant="secondary" />
                    </View>
                  </View>
                ))
              )}

            <View style={styles.eventDivider} />
            <Text style={styles.eventSectionTitle}>Photo and Video Evidence</Text>
            {sceneEvidence.length === 0 ? (
              <EmptyState title="No photos or videos yet" body="Capture live media or choose items from your gallery below." />
            ) : (
              sceneEvidence
                .map((record) => (
                  <View key={record.id} style={[styles.evidenceCard, record.selectedForDraft ? styles.evidenceCardSelected : null]}>
                    <View style={styles.checkboxRow}>
                      <Switch value={!!record.selectedForDraft} onValueChange={() => void toggleEvidenceForDraft(record)} />
                      <View style={styles.evidenceCopy}>
                        <Text style={styles.evidenceTitle}>{record.type === "VIDEO" ? "Use this video" : "Use this photo"}</Text>
                        <Text style={styles.evidenceMeta}>{formatDateTime(record.createdAt)}</Text>
                        <Text style={styles.evidenceMeta}>{record.fileName}</Text>
                      </View>
                    </View>
                  </View>
                ))
            )}

            <View style={styles.eventDivider} />
            <Text style={styles.eventSectionTitle}>Generate Draft</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Draft narrative notes"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, styles.multiline]}
              multiline
            />
            <View style={styles.actionGrid}>
              <AppButton label="Generate Draft Narrative" onPress={generateEventDraft} disabled={!selectedIncident} />
            </View>
            {selectedIncident?.generatedReports[0] ? <Text style={styles.draftPreview}>{selectedIncident.generatedReports[0].body}</Text> : null}

            <View style={styles.eventDivider} />
            <Text style={styles.eventSectionTitle}>Live Capture and Gallery</Text>
            <CameraCaptureScreen currentUser={currentUser} selectedIncidentId={selectedIncidentId} onUploaded={refreshLocalEvidence} compact />
          </SectionCard>
        ) : null}

        {screen === "history" ? (
          <SectionCard title="History" subtitle="Previous events sorted by date and time. Select any event to keep working it.">
            {incidents.length === 0 ? (
              <EmptyState title="No event history yet" body="Create your first event from the Event module." />
            ) : (
              incidents.map((incident) => (
                <View key={incident.id} style={[styles.evidenceCard, selectedIncidentId === incident.id ? styles.evidenceCardSelected : null]}>
                  <View style={styles.evidenceHeader}>
                    <View style={styles.evidenceCopy}>
                      <Text style={styles.evidenceTitle}>{incident.caseNumber}</Text>
                      <Text style={styles.evidenceMeta}>{incident.title}</Text>
                      <Text style={styles.evidenceMeta}>
                        {formatDateTime(incident.occurredAt)} / {archivedIncidentIds.includes(incident.id) ? "ARCHIVED" : incident.status}
                      </Text>
                    </View>
                    <AppButton
                      label={selectedIncidentId === incident.id ? "Selected" : "Open"}
                      onPress={() => {
                        setSelectedIncidentId(incident.id);
                        setScreen("event");
                      }}
                      variant={selectedIncidentId === incident.id ? "secondary" : "primary"}
                    />
                  </View>
                </View>
              ))
            )}
          </SectionCard>
        ) : null}

        {screen === "supervisor" ? (
          <View style={styles.sectionStack}>
            <SectionCard title="Supervisor Controls" subtitle="Admin, supervisor review, queue status, and alerts live here.">
              <View style={styles.tagRow}>
                <Tag label={currentUser?.role || "Not signed in"} active={!!currentUser} tone={currentUser?.role === "ADMIN" || currentUser?.role === "SUPERVISOR" ? "success" : "warning"} />
                <Tag label={`${jobs.length} queue items`} />
                <Tag label={`${unreadCount} unread alerts`} />
              </View>
              {currentUser?.role === "OFFICER" ? (
                <Text style={styles.panelCopy}>Officer accounts can view queue status here. Supervisor and admin accounts will use this module for approvals, assignments, and administrative controls.</Text>
              ) : (
                <Text style={styles.panelCopy}>Supervisor/admin mode is active. Use this area to monitor queued work, review alerts, and route event drafts.</Text>
              )}
            </SectionCard>
            <JobsScreen jobs={jobs} selectedIncidentId={selectedIncidentId} />
            <NotificationsScreen notifications={notifications} onRead={handleReadNotification} />
          </View>
        ) : null}

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
  loginScreen: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.lg
  },
  loginBrand: {
    alignItems: "center"
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    flexWrap: "wrap"
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
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs
  },
  panelCopy: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text
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
  },
  evidenceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  evidenceCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  evidenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  evidenceCopy: {
    flex: 1,
    gap: 4
  },
  evidenceTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.colors.ink
  },
  evidenceMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted
  },
  eventDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs
  },
  eventSectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: theme.colors.ink
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  draftPreview: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22
  }
});
