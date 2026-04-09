import { StyleSheet, Text, View } from "react-native";
import type { NotificationRecord } from "../../src/lib/shared-types";
import { AppButton, EmptyState, HeroCard, Screen, SectionCard, Tag } from "../../src/ui/components";
import { formatDateTime, theme } from "../../src/ui/theme";

type Props = {
  notifications: NotificationRecord[];
  onRead: (notificationId: string) => Promise<void>;
};

export default function NotificationsScreen({ notifications, onRead }: Props) {
  return (
    <Screen>
      <HeroCard
        eyebrow="Alerts"
        title="Stay ahead of reviews and failures"
        body="Show queue completions, report approvals, and export updates in one readable feed."
      />
      <SectionCard title="Notification Feed" subtitle="Unread items stay visually elevated until they are cleared.">
        {notifications.length === 0 ? (
          <EmptyState title="No notifications yet" body="Queue work or approve a report to create activity in the alert feed." />
        ) : (
          notifications.map((notification) => (
            <View key={notification.id} style={[styles.card, !notification.readAt ? styles.cardUnread : null]}>
              <View style={styles.header}>
                <Text style={styles.cardTitle}>{notification.title}</Text>
                <Tag label={notification.readAt ? "Read" : "Unread"} tone={notification.readAt ? "success" : "warning"} />
              </View>
              <Text style={styles.cardCopy}>{notification.body}</Text>
              <Text style={styles.cardMeta}>{notification.type}</Text>
              {notification.createdAt ? <Text style={styles.cardMeta}>{formatDateTime(notification.createdAt)}</Text> : null}
              {!notification.readAt ? <AppButton label="Mark Read" onPress={() => void onRead(notification.id)} variant="secondary" /> : null}
            </View>
          ))
        )}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs
  },
  cardUnread: {
    borderColor: theme.colors.accent,
    backgroundColor: "#eef7f8"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink,
    flex: 1
  },
  cardCopy: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.muted
  }
});
