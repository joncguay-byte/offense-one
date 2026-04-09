import { StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export function BrandMark({ size = 72 }: { size?: number }) {
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28)
        }
      ]}
    >
      <View style={styles.markInset}>
        <Text style={[styles.markText, { fontSize: size * 0.34 }]}>O1</Text>
      </View>
      <View style={[styles.markAccent, { width: size * 0.28, height: size * 0.08 }]} />
    </View>
  );
}

export function BrandLockup({
  title = "Offense One",
  subtitle = "Evidence-grounded field reporting"
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.lockup}>
      <BrandMark />
      <View style={styles.lockupCopy}>
        <Text style={styles.lockupTitle}>{title}</Text>
        <Text style={styles.lockupSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: theme.colors.ink,
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "#27404d"
  },
  markInset: {
    flex: 1,
    width: "100%",
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center"
  },
  markText: {
    color: "#f8fafc",
    fontWeight: "900",
    letterSpacing: 1
  },
  markAccent: {
    position: "absolute",
    bottom: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.highlight
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md
  },
  lockupCopy: {
    gap: 4
  },
  lockupTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#f8fafc"
  },
  lockupSubtitle: {
    fontSize: 14,
    color: "#c3d2d9",
    letterSpacing: 0.3
  }
});
