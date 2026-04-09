export const theme = {
  colors: {
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
    navIdle: "#ece6dc"
  },
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
      shadowColor: "#13212b",
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3
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
