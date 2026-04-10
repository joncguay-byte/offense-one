import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "./api";

const savedLoginKey = "offense-one-saved-login";

export type LocalLoginRole = "OFFICER" | "SUPERVISOR";

export type SavedLogin = {
  email: string;
  password: string;
  role: LocalLoginRole;
};

export const localOfficer: AuthUser = {
  id: "local-officer",
  email: "officer@example.gov",
  role: "OFFICER",
  fullName: "Officer User",
  badgeNumber: "1001"
};

export const localSupervisor: AuthUser = {
  id: "local-supervisor",
  email: "supervisor@example.gov",
  role: "SUPERVISOR",
  fullName: "Supervisor User",
  badgeNumber: "2001"
};

export function getLocalUser(role: LocalLoginRole) {
  return role === "SUPERVISOR" ? localSupervisor : localOfficer;
}

export function isLocalCredential(email: string, password: string, role: LocalLoginRole) {
  const expectedEmail = role === "SUPERVISOR" ? "supervisor@example.gov" : "officer@example.gov";
  return email.trim().toLowerCase() === expectedEmail && password === "ChangeMe123!";
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
