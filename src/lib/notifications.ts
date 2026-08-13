import { prisma } from "@/lib/prisma";

export const createNotification = async (params: {
  userId: string;
  title: string;
  body: string;
}) => {
  return prisma.notification.create({ data: params });
};

export const createNotifications = async (
  items: { userId: string; title: string; body: string }[],
) => {
  if (items.length === 0) return;
  await prisma.notification.createMany({ data: items });
};
