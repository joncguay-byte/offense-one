import type { DraftNarrativeRequest, JobRecord, KnownSpeakerHint, NotificationRecord } from "./shared-types";
import Constants from "expo-constants";

const configuredApiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  (Constants.manifest2 as { extra?: { expoClient?: { extra?: { apiBaseUrl?: string } } } } | null)?.extra?.expoClient?.extra?.apiBaseUrl;
const FALLBACK_RAILWAY_API_BASE_URL = "https://scene-reportapi-production.up.railway.app/api";
const DEFAULT_API_BASE_URL = typeof configuredApiBaseUrl === "string" && configuredApiBaseUrl.length > 0
  ? configuredApiBaseUrl
  : FALLBACK_RAILWAY_API_BASE_URL;
let apiBaseUrl = DEFAULT_API_BASE_URL;
let sessionToken: string | null = null;

export type AuthUser = {
  id: string;
  email: string;
  role: "OFFICER" | "SUPERVISOR" | "ADMIN";
  fullName: string;
  badgeNumber?: string | null;
};

export type VoiceProfileRecord = {
  userId: string;
  displayName: string;
  evidencePath: string;
  updatedAt: string;
};

export type IncidentRecord = {
  id: string;
  caseNumber: string;
  title: string;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "EXPORTED";
  location?: string | null;
  occurredAt: string;
  createdById: string;
  assignedSupervisorId?: string | null;
  createdBy: AuthUser;
  assignedSupervisor?: AuthUser | null;
  participants: Array<{ id: string; label: string; displayName?: string | null; speakerKey: string }>;
  transcriptDrafts: Array<{ id: string; rawText: string; diarizedJson: string }>;
  evidenceItems?: Array<{
    id: string;
    type: "AUDIO" | "IMAGE" | "VIDEO";
    mimeType: string;
    path: string;
    metadataJson?: string | null;
  }>;
  generatedReports: Array<{
    id: string;
    body: string;
    status: "PENDING_REVIEW" | "OFFICER_EDITED" | "APPROVED" | "REJECTED";
    reviewNotes?: string | null;
    citationsJson?: string | null;
    confidenceJson?: string | null;
  }>;
};

export type EvidenceItemRecord = NonNullable<IncidentRecord["evidenceItems"]>[number];

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken() {
  return sessionToken;
}

export function setApiBaseUrl(nextApiBaseUrl: string | null) {
  apiBaseUrl = nextApiBaseUrl?.trim() || DEFAULT_API_BASE_URL;
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function signup(payload: {
  email: string;
  password: string;
  fullName: string;
  badgeNumber?: string | null;
  role: AuthUser["role"];
}) {
  return request<{ token: string; user: AuthUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getCurrentUser() {
  return request<{ user: AuthUser }>("/auth/me");
}

export function updateMyAccount(payload: {
  email: string;
  password: string;
  fullName: string;
  badgeNumber?: string | null;
}) {
  return request<{ user: AuthUser }>("/users/me/account", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function createAdminAccount(payload: {
  email: string;
  password: string;
  fullName: string;
  badgeNumber?: string | null;
}) {
  return request<{ token: string; user: AuthUser }>("/users/admin/accounts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type CreateIncidentPayload = {
  caseNumber: string;
  title: string;
  location?: string;
  occurredAt: string;
  createdById?: string;
};

export function createIncident(payload: CreateIncidentPayload) {
  return request<IncidentRecord>("/incidents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function assignIncidentSupervisor(incidentId: string, assignedSupervisorId: string) {
  return request<IncidentRecord>(`/incidents/${incidentId}/assign-supervisor`, {
    method: "PATCH",
    body: JSON.stringify({ assignedSupervisorId })
  });
}

export function listIncidents() {
  return request<IncidentRecord[]>("/incidents");
}

export function ingestIncidentAudio(
  incidentId: string,
  payload?: { evidenceId?: string; knownSpeakers?: KnownSpeakerHint[]; referenceEvidenceId?: string }
) {
  return request<{ jobId: string; status: string }>(`/incidents/${incidentId}/ingest-audio`, {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function generateIncidentReport(incidentId: string, payload: DraftNarrativeRequest) {
  return request<{ jobId: string; status: string }>(`/incidents/${incidentId}/generate-report`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function renameParticipant(participantId: string, payload: { label: string; displayName?: string }) {
  return request(`/participants/${participantId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function uploadEvidenceFile(payload: {
  incidentId: string;
  type: "AUDIO" | "IMAGE" | "VIDEO";
  uri: string;
  name: string;
  mimeType: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}) {
  const formData = new FormData();
  formData.append("type", payload.type);
  formData.append("capturedAt", payload.capturedAt || new Date().toISOString());
  if (payload.metadata) {
    formData.append("metadata", JSON.stringify(payload.metadata));
  }
  formData.append("file", {
    uri: payload.uri,
    name: payload.name,
    type: payload.mimeType
  } as never);

  return request<EvidenceItemRecord>(`/incidents/${payload.incidentId}/upload-evidence`, {
    method: "POST",
    body: formData
  });
}

export function reviewReport(
  reportId: string,
  payload: { action: "approve" | "reject" | "edit"; body?: string; reviewNotes?: string }
) {
  return request<{ report: IncidentRecord["generatedReports"][number]; exportJobId?: string }>(`/reports/${reportId}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function getJob(jobId: string) {
  return request<JobRecord>(`/jobs/${jobId}`);
}

export function listJobs(params?: { incidentId?: string; status?: JobRecord["status"]; take?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.incidentId) {
    searchParams.set("incidentId", params.incidentId);
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.take) {
    searchParams.set("take", String(params.take));
  }

  const query = searchParams.toString();
  return request<JobRecord[]>(`/jobs${query ? `?${query}` : ""}`);
}

export function listSupervisors() {
  return request<AuthUser[]>("/users/supervisors");
}

export function registerDevicePushToken(payload: { provider: "EXPO" | "APNS" | "FCM"; token: string }) {
  return request("/users/me/push-tokens", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMyVoiceProfile() {
  return request<{ hasProfile: boolean; profile?: VoiceProfileRecord | null }>("/users/me/voice-profile");
}

export async function uploadMyVoiceProfile(payload: {
  uri: string;
  name: string;
  mimeType: string;
}) {
  const formData = new FormData();
  formData.append("file", {
    uri: payload.uri,
    name: payload.name,
    type: payload.mimeType
  } as never);

  return request<{ hasProfile: boolean; profile?: VoiceProfileRecord | null }>("/users/me/voice-profile", {
    method: "POST",
    body: formData
  });
}

export function deleteMyVoiceProfile() {
  return request<{ hasProfile: boolean; deleted?: boolean }>("/users/me/voice-profile", {
    method: "DELETE"
  });
}

export function listNotifications(take = 30) {
  return request<NotificationRecord[]>(`/notifications?take=${take}`);
}

export function markNotificationRead(notificationId: string) {
  return request<NotificationRecord>(`/notifications/${notificationId}/read`, {
    method: "PATCH"
  });
}
