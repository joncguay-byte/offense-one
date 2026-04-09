import type { DraftNarrativeRequest } from "@scene-report/shared";
import {
  assignIncidentSupervisor,
  createIncident,
  deleteMyVoiceProfile,
  generateIncidentReport,
  getCurrentUser,
  getMyVoiceProfile,
  getJob,
  ingestIncidentAudio,
  listJobs,
  listNotifications,
  listIncidents,
  listSupervisors,
  login,
  markNotificationRead,
  renameParticipant,
  registerDevicePushToken,
  reviewReport,
  setSessionToken,
  type AuthUser,
  type CreateIncidentPayload,
  uploadMyVoiceProfile
} from "../lib/api";
import { signInWithOidc } from "../lib/oidc";
import { uploadEvidenceFile } from "../lib/api";

export async function signInOfficer() {
  const session = await login("officer@example.gov", "ChangeMe123!");
  setSessionToken(session.token);
  return session;
}

export async function signInSupervisor() {
  const session = await login("supervisor@example.gov", "ChangeMe123!");
  setSessionToken(session.token);
  return session;
}

export async function signInOidc() {
  return signInWithOidc();
}

export async function loadCurrentUser() {
  return getCurrentUser();
}

export async function createIncidentWorkflow(payload: CreateIncidentPayload) {
  return createIncident(payload);
}

export async function assignSupervisor(incidentId: string, assignedSupervisorId: string) {
  return assignIncidentSupervisor(incidentId, assignedSupervisorId);
}

export async function loadIncidents() {
  return listIncidents();
}

export async function loadSupervisors() {
  return listSupervisors();
}

export async function attachAudioEvidence(incidentId: string, path: string, currentUser?: AuthUser | null) {
  await uploadEvidenceFile({
    incidentId,
    type: "AUDIO",
    mimeType: "audio/m4a",
    uri: path,
    name: "scene-audio.m4a",
    capturedAt: new Date().toISOString(),
    metadata: currentUser
      ? {
          knownOfficer: {
            id: currentUser.id,
            displayName: currentUser.fullName,
            badgeNumber: currentUser.badgeNumber || null
          }
        }
      : undefined
  });

  return ingestIncidentAudio(incidentId, {
    knownSpeakers: currentUser
      ? [
          {
            displayName: currentUser.fullName,
            role: "OFFICER",
            speakerKey: "speaker_1"
          }
        ]
      : undefined
  });
}

export async function attachOfficerVoiceReference(incidentId: string, path: string, currentUser?: AuthUser | null) {
  return uploadEvidenceFile({
    incidentId,
    type: "AUDIO",
    mimeType: "audio/m4a",
    uri: path,
    name: "officer-reference.m4a",
    capturedAt: new Date().toISOString(),
    metadata: {
      sourceKind: "OFFICER_REFERENCE",
      knownOfficer: currentUser
        ? {
            id: currentUser.id,
            displayName: currentUser.fullName,
            badgeNumber: currentUser.badgeNumber || null
          }
        : undefined
    }
  });
}

export async function loadMyVoiceProfile() {
  return getMyVoiceProfile();
}

export async function saveMyVoiceProfile(path: string) {
  return uploadMyVoiceProfile({
    uri: path,
    name: "officer-voice-profile.m4a",
    mimeType: "audio/m4a"
  });
}

export async function removeMyVoiceProfile() {
  return deleteMyVoiceProfile();
}

export async function attachSceneImage(incidentId: string, path: string) {
  return uploadEvidenceFile({
    incidentId,
    type: "IMAGE",
    mimeType: "image/jpeg",
    uri: path,
    name: "scene-image.jpg",
    capturedAt: new Date().toISOString(),
    metadata: {
      sourceKind: "SCENE"
    }
  });
}

export async function attachCallForServiceImage(incidentId: string, path: string) {
  return uploadEvidenceFile({
    incidentId,
    type: "IMAGE",
    mimeType: "image/jpeg",
    uri: path,
    name: "call-for-service.jpg",
    capturedAt: new Date().toISOString(),
    metadata: {
      sourceKind: "CALL_FOR_SERVICE"
    }
  });
}

export async function relabelSpeaker(participantId: string, label: string) {
  return renameParticipant(participantId, {
    label,
    displayName: label
  });
}

export async function generateDraftNarrative(incidentId: string, payload: DraftNarrativeRequest) {
  return generateIncidentReport(incidentId, payload);
}

export async function getJobStatus(jobId: string) {
  return getJob(jobId);
}

export async function loadJobs(params?: { incidentId?: string; status?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"; take?: number }) {
  return listJobs(params);
}

export async function loadNotifications(take = 30) {
  return listNotifications(take);
}

export async function readNotification(notificationId: string) {
  return markNotificationRead(notificationId);
}

export async function registerPushToken(provider: "EXPO" | "APNS" | "FCM", token: string) {
  return registerDevicePushToken({ provider, token });
}

export async function approveNarrative(reportId: string, reviewNotes?: string) {
  return reviewReport(reportId, {
    action: "approve",
    reviewNotes
  });
}

export async function rejectNarrative(reportId: string, reviewNotes?: string) {
  return reviewReport(reportId, {
    action: "reject",
    reviewNotes
  });
}
