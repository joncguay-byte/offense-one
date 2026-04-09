import { prisma } from "../db.js";
import { env } from "../config.js";

const prismaWithPushTokens = prisma as typeof prisma & {
  pushToken: {
    upsert: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any>;
  };
};

export async function registerPushToken(input: {
  userId: string;
  provider: "EXPO" | "APNS" | "FCM";
  token: string;
}) {
  return prismaWithPushTokens.pushToken.upsert({
    where: { token: input.token },
    update: {
      userId: input.userId,
      provider: input.provider,
      lastUsedAt: new Date()
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      token: input.token
    }
  });
}

export async function listUserPushTokens(userId: string) {
  return prismaWithPushTokens.pushToken.findMany({
    where: { userId }
  });
}

async function sendExpoPushNotifications(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }) {
  if (tokens.length === 0) {
    return [];
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(env.EXPO_PUSH_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}` } : {})
    },
    body: JSON.stringify(
      tokens.map((token) => ({
        to: token,
        title: message.title,
        body: message.body,
        data: message.data || {}
      }))
    )
  });

  if (!response.ok) {
    throw new Error(`Expo push send failed with status ${response.status}.`);
  }

  return response.json();
}

export async function sendPushToUser(input: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const tokens = await listUserPushTokens(input.userId);
  const expoTokens = tokens.filter((item) => item.provider === "EXPO").map((item) => item.token);

  const receipts = [];
  if (expoTokens.length > 0) {
    receipts.push(await sendExpoPushNotifications(expoTokens, {
      title: input.title,
      body: input.body,
      data: input.data
    }));
  }

  return {
    attempted: tokens.length,
    expoAttempted: expoTokens.length,
    receipts
  };
}
