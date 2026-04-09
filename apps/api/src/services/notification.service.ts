import { prisma } from "../db.js";
import { sendPushToUser } from "./push.service.js";

const prismaWithNotifications = prisma as typeof prisma & {
  notification: {
    create: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
};

export async function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  type: "JOB_COMPLETED" | "JOB_FAILED" | "REPORT_APPROVED" | "REPORT_EXPORTED";
  metadata?: Record<string, unknown>;
}) {
  return prismaWithNotifications.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined
    }
  });
}

export async function notifyUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  type: "JOB_COMPLETED" | "JOB_FAILED" | "REPORT_APPROVED" | "REPORT_EXPORTED";
  metadata?: Record<string, unknown>;
}) {
  const uniqueUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
  for (const userId of uniqueUserIds) {
    await createNotification({
      userId,
      title: input.title,
      body: input.body,
      type: input.type,
      metadata: input.metadata
    });

    await sendPushToUser({
      userId,
      title: input.title,
      body: input.body,
      data: input.metadata
    });
  }
}

export async function listNotifications(userId: string, take = 30) {
  return prismaWithNotifications.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take
  });
}

export async function markNotificationRead(notificationId: string) {
  return prismaWithNotifications.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() }
  });
}
