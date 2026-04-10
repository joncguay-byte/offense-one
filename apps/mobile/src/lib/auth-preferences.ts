import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "./api";

const savedLoginKey = "offense-one-saved-login";
const localAccountsKey = "offense-one-local-accounts";

export type LocalLoginRole = "OFFICER" | "SUPERVISOR";

export type SavedLogin = {
  email: string;
  password: string;
  role: LocalLoginRole;
};

export type LocalAccountProfile = SavedLogin & {
  fullName: string;
  badgeNumber?: string | null;
};

const defaultOfficerProfile: LocalAccountProfile = {
  email: "officer@example.gov",
  password: "ChangeMe123!",
  role: "OFFICER",
  fullName: "Officer User",
  badgeNumber: "1001"
};

const defaultSupervisorProfile: LocalAccountProfile = {
  email: "supervisor@example.gov",
  password: "ChangeMe123!",
  role: "SUPERVISOR",
  fullName: "Supervisor User",
  badgeNumber: "2001"
};

export const localOfficer: AuthUser = {
  id: "local-officer",
  email: defaultOfficerProfile.email,
  role: "OFFICER",
  fullName: defaultOfficerProfile.fullName,
  badgeNumber: defaultOfficerProfile.badgeNumber || null
};

export const localSupervisor: AuthUser = {
  id: "local-supervisor",
  email: defaultSupervisorProfile.email,
  role: "SUPERVISOR",
  fullName: defaultSupervisorProfile.fullName,
  badgeNumber: defaultSupervisorProfile.badgeNumber || null
};

export function getLocalUser(role: LocalLoginRole) {
  return role === "SUPERVISOR" ? localSupervisor : localOfficer;
}

function getDefaultProfile(role: LocalLoginRole) {
  return role === "SUPERVISOR" ? defaultSupervisorProfile : defaultOfficerProfile;
}

function profileToUser(profile: LocalAccountProfile): AuthUser {
  return {
    id: profile.role === "SUPERVISOR" ? "local-supervisor" : "local-officer",
    email: profile.email,
    role: profile.role,
    fullName: profile.fullName,
    badgeNumber: profile.badgeNumber || null
  };
}

export async function loadLocalAccountProfiles(): Promise<Record<LocalLoginRole, LocalAccountProfile>> {
  const defaults = {
    OFFICER: defaultOfficerProfile,
    SUPERVISOR: defaultSupervisorProfile
  };
  const raw = await SecureStore.getItemAsync(localAccountsKey);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<LocalLoginRole, Partial<LocalAccountProfile>>>;
    return {
      OFFICER: { ...defaultOfficerProfile, ...parsed.OFFICER, role: "OFFICER" },
      SUPERVISOR: { ...defaultSupervisorProfile, ...parsed.SUPERVISOR, role: "SUPERVISOR" }
    };
  } catch {
    return defaults;
  }
}

export async function saveLocalAccountProfile(profile: LocalAccountProfile) {
  const profiles = await loadLocalAccountProfiles();
  const nextProfiles = {
    ...profiles,
    [profile.role]: profile
  };
  await SecureStore.setItemAsync(localAccountsKey, JSON.stringify(nextProfiles));
  return profileToUser(profile);
}

export async function loadLocalUser(role: LocalLoginRole) {
  const profiles = await loadLocalAccountProfiles();
  return profileToUser(profiles[role] || getDefaultProfile(role));
}

export async function isLocalCredential(email: string, password: string, role: LocalLoginRole) {
  const profiles = await loadLocalAccountProfiles();
  const profile = profiles[role] || getDefaultProfile(role);
  return email.trim().toLowerCase() === profile.email.trim().toLowerCase() && password === profile.password;
}

export async function saveLoginPreference(login: SavedLogin) {
  await SecureStore.setItemAsync(savedLoginKey, JSON.stringify(login));
}

export async function loadLoginPreference() {
  const raw = await SecureStore.getItemAsync(savedLoginKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedLogin>;
    if (!parsed.email || !parsed.password || (parsed.role !== "OFFICER" && parsed.role !== "SUPERVISOR")) {
      return null;
    }
    return {
      email: parsed.email,
      password: parsed.password,
      role: parsed.role
    };
  } catch {
    return null;
  }
}

export async function clearLoginPreference() {
  await SecureStore.deleteItemAsync(savedLoginKey);
}

export async function canUseBiometrics() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}

export async function unlockWithBiometrics() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Offense One",
    cancelLabel: "Use password",
    disableDeviceFallback: false
  });
}
