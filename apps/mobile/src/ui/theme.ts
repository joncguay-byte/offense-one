import { File, Paths } from "expo-file-system";

export type ThemeMode = "light" | "dark";

const themePreferenceFile = new File(Paths.document, "offense-one-theme.json");

function loadThemeModeSync(): ThemeMode {
  try {
    if (!themePreferenceFile.exists) {
      return "light";
    }

    const raw = themePreferenceFile.textSync();
    const parsed = JSON.parse(raw) as { mode?: string };
    return parsed.mode === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export async function saveThemeModePreference(mode: ThemeMode) {
  if (!themePreferenceFile.exists) {
    themePreferenceFile.create({ overwrite: true, intermediates: true });
  }

  themePreferenceFile.write(JSON.stringify({ mode }));
  return mode;
}

export function getStoredThemeMode() {
  return loadThemeModeSync();
}

const lightColors = {
  ink: "#0f1720",
  text: "#223242",
  muted: "#667788",
  surface: "#f6f3ee",
  surfaceAlt: "#ede6db",
  card: "#fffdf9",
  border: "#d8d0c4",
  accent: "#0f4c5c",
  accentSoft: "#d7e7eb",
  success: "#1f6b4f",
  successSoft: "#dff2e9",
  warning: "#9f5f16",
  warningSoft: "#f8ead6",
  danger: "#8a3324",
  dangerSoft: "#f6dfdb",
  highlight: "#c48a3a",
  navIdle: "#ece6dc",
  appBackground: "#f6f3ee",
  brandTitle: "#0f4c5c",
  brandSubtitle: "#4a5f6d",
  heroEyebrow: "#9cc5cf",
  heroTitle: "#f7fafc",
  heroBody: "#c9d6dc",
  onDark: "#f7fafc"
} as const;

const darkColors = {
  ink: "#edf4f7",
  text: "#d8e5eb",
  muted: "#9fb1bc",
  surface: "#0d141b",
  surfaceAlt: "#14202a",
  card: "#111b24",
  border: "#223442",
  accent: "#3e92a3",
  accentSoft: "#16343d",
  success: "#4fb985",
  successSoft: "#153629",
  warning: "#d49b46",
  warningSoft: "#3a2a14",
  danger: "#d46a58",
  dangerSoft: "#3c1e19",
  highlight: "#f0b35d",
  navIdle: "#19242d",
  appBackground: "#091017",
  brandTitle: "#f4c171",
  brandSubtitle: "#c5d3da",
  heroEyebrow: "#87c8d5",
  heroTitle: "#f7fbfd",
  heroBody: "#d0dde4",
  onDark: "#f7fafc"
} as const;

const themeMode = loadThemeModeSync();
const colors = themeMode === "dark" ? darkColors : lightColors;

export const theme = {
  mode: themeMode,
  colors,
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 30
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32
  },
  shadow: {
    card: {
      shadowColor: themeMode === "dark" ? "#000000" : "#13212b",
      shadowOpacity: themeMode === "dark" ? 0.22 : 0.08,
      shadowRadius: themeMode === "dark" ? 22 : 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: themeMode === "dark" ? 5 : 3
    }
  }
} as const;

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatJobType(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}
