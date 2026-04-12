import * as SecureStore from "expo-secure-store";

const apiBaseUrlKey = "offense-one-api-base-url";
const deprecatedHostPatterns = [".loca.lt", "127.0.0.1", "localhost"];

function isDeprecatedApiUrl(value: string) {
  return deprecatedHostPatterns.some((pattern) => value.includes(pattern));
}

export async function loadApiBaseUrlPreference() {
  const value = await SecureStore.getItemAsync(apiBaseUrlKey);
  const trimmed = value?.trim() || null;
  if (!trimmed) {
    return null;
  }

  if (isDeprecatedApiUrl(trimmed)) {
    await SecureStore.deleteItemAsync(apiBaseUrlKey);
    return null;
  }

  return trimmed;
}

export async function saveApiBaseUrlPreference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(apiBaseUrlKey);
    return null;
  }

  if (isDeprecatedApiUrl(trimmed)) {
    throw new Error("That backend URL is from an old local/tunnel setup. Use the Railway API URL instead.");
  }

  await SecureStore.setItemAsync(apiBaseUrlKey, trimmed);
  return trimmed;
}
