import type { PropsWithChildren, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export function Screen({
  children,
  contentContainerStyle
}: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  return <ScrollView contentContainerStyle={[styles.screen, contentContainerStyle]}>{children}</ScrollView>;
}

export function HeroCard({
  eyebrow,
  title,
  body,
  right
}: {
  eyebrow: string;
  title: string;
  body: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroContent}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroBody}>{body}</Text>
      </View>
      {right ? <View style={styles.heroAside}>{right}</View> : null}
    </View>
  );
}

export function SectionCard({
  title,
  subtitle,
  children
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "success" | "warning" }) {
  const toneStyle =
    tone === "accent"
      ? styles.metricAccent
      : tone === "success"
        ? styles.metricSuccess
        : tone === "warning"
          ? styles.metricWarning
          : null;

  return (
    <View style={[styles.metric, toneStyle]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  disabled,
  variant = "primary"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variantStyle =
    variant === "secondary"
      ? styles.buttonSecondary
      : variant === "ghost"
        ? styles.buttonGhost
        : variant === "danger"
          ? styles.buttonDanger
          : styles.buttonPrimary;

  const textStyle =
    variant === "primary" || variant === "danger" ? styles.buttonTextOnDark : styles.buttonTextOnLight;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, variantStyle, disabled ? styles.buttonDisabled : null]}>
      <Text style={[styles.buttonText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, active = false, tone = "default" }: { label: string; active?: boolean; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneStyle =
    tone === "success"
      ? styles.tagSuccess
      : tone === "warning"
        ? styles.tagWarning
        : tone === "danger"
          ? styles.tagDanger
          : styles.tagDefault;

  return (
    <View style={[styles.tag, toneStyle, active ? styles.tagActive : null]}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg
  },
  hero: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.lg,
    ...theme.shadow.card
  },
  heroContent: {
    flex: 1,
    gap: theme.spacing.xs
  },
  heroAside: {
    justifyContent: "center"
  },
  eyebrow: {
    color: theme.colors.heroEyebrow,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: theme.colors.heroTitle,
    fontSize: 28,
    fontWeight: "800"
  },
  heroBody: {
    color: theme.colors.heroBody,
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    ...theme.shadow.card
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  cardSubtitle: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20
  },
  cardBody: {
    gap: theme.spacing.sm
  },
  metric: {
    minWidth: 104,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm
  },
  metricAccent: {
    backgroundColor: theme.colors.accentSoft
  },
  metricSuccess: {
    backgroundColor: theme.colors.successSoft
  },
  metricWarning: {
    backgroundColor: theme.colors.warningSoft
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  metricValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.ink
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  buttonPrimary: {
    backgroundColor: theme.colors.accent
  },
  buttonSecondary: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  buttonDanger: {
    backgroundColor: theme.colors.danger
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800"
  },
  buttonTextOnDark: {
    color: theme.colors.onDark
  },
  buttonTextOnLight: {
    color: theme.colors.ink
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  tagDefault: {
    backgroundColor: theme.colors.surfaceAlt
  },
  tagSuccess: {
    backgroundColor: theme.colors.successSoft
  },
  tagWarning: {
    backgroundColor: theme.colors.warningSoft
  },
  tagDanger: {
    backgroundColor: theme.colors.dangerSoft
  },
  tagActive: {
    borderWidth: 1,
    borderColor: theme.colors.accent
  },
  tagText: {
    color: theme.colors.ink,
    fontWeight: "700",
    fontSize: 12
  },
  empty: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  emptyBody: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 21
  }
});
