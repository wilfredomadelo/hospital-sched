"use server";

import { revalidatePath } from "next/cache";
import { LeaveStatus, LeaveType, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

const leaveSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  type: z.enum(["VL", "SL", "PL", "LV", "QL", "RL", "PaL", "ML", "FL"]),
  reason: z.string().max(500).optional(),
});

export const submitLeaveRequest = async (formData: FormData): Promise<void> => {
  const session = await requireRole([Role.NURSE]);
  const profile = await prisma.nurseProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return;

  const parsed = leaveSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    type: formData.get("type"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return;

  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);
  if (endDate < startDate) return;

  await prisma.leaveRequest.create({
    data: {
      nurseId: profile.id,
      startDate,
      endDate,
      type: parsed.data.type as LeaveType,
      reason: parsed.data.reason,
      status: LeaveStatus.PENDING,
    },
  });

  revalidatePath("/nurse/leave");
  revalidatePath("/admin/leave");
};

export const decideLeaveRequest = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["APPROVED", "DENIED"].includes(decision)) return;

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: { status: decision as LeaveStatus },
    include: { nurse: { include: { user: true } } },
  });

  await createNotification({
    userId: leave.nurse.userId,
    title: `Leave ${decision.toLowerCase()}`,
    body: `Your ${leave.type.toLowerCase()} leave request (${leave.startDate.toISOString().slice(0, 10)} – ${leave.endDate.toISOString().slice(0, 10)}) was ${decision.toLowerCase()}.`,
  });

  revalidatePath("/admin/leave");
  revalidatePath("/nurse/leave");
  revalidatePath("/nurse/notifications");
};

export const markNotificationRead = async (
  formData: FormData,
): Promise<void> => {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { readAt: new Date() },
  });

  revalidatePath("/nurse/notifications");
};

export const resolveAlert = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.complianceAlert.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  revalidatePath("/admin/compliance");
};
