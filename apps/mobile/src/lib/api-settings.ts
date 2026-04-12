import * as SecureStore from "expo-secure-store";

const apiBaseUrlKey = "offense-one-api-base-url";

export async function loadApiBaseUrlPreference() {
  const value = await SecureStore.getItemAsync(apiBaseUrlKey);
  return value?.trim() || null;
}

export async function saveApiBaseUrlPreference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(apiBaseUrlKey);
    return null;
  }

  await SecureStore.setItemAsync(apiBaseUrlKey, trimmed);
  return trimmed;
}
