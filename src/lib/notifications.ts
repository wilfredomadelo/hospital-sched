import { prisma } from "@/lib/prisma";

export const createNotification = async (params: {
  userId: string;
  title: string;
  body: string;
}) => {
  return prisma.notification.create({ data: params });
};
