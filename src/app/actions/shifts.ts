"use server";

import { revalidatePath } from "next/cache";
import { Role, ShiftStatus } from "@prisma/client";
import { addDays, format, parseISO, setHours, setMinutes } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  evaluateAssignment,
  hasBlockingIssues,
  persistAlerts,
} from "@/lib/scheduling/compliance";
import { createNotifications } from "@/lib/notifications";
import { generateRoster } from "@/lib/scheduling/generator";

const combineDateAndTime = (date: Date, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(date, h), m);
};

const assignSchema = z.object({
  nurseId: z.string().min(1),
  unitId: z.string().min(1),
  templateId: z.string().min(1),
  date: z.string().min(1),
  replaceAssignmentId: z.string().optional(),
});

export type AssignResult = {
  error?: string;
  success?: boolean;
  warnings?: string[];
};

export const assignShift = async (formData: FormData): Promise<AssignResult> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const parsed = assignSchema.safeParse({
    nurseId: formData.get("nurseId"),
    unitId: formData.get("unitId"),
    templateId: formData.get("templateId"),
    date: formData.get("date"),
    replaceAssignmentId: formData.get("replaceAssignmentId") || undefined,
  });
  if (!parsed.success) return { error: "Invalid assignment data." };

  const nurse = await prisma.nurseProfile.findUnique({
    where: { id: parsed.data.nurseId },
  });
  const template = await prisma.shiftTemplate.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!nurse || !template) return { error: "Nurse or template not found." };
  if (nurse.archivedAt) return { error: "Cannot assign shifts to archived staff." };

  const day = parseISO(parsed.data.date);
  let startAt = combineDateAndTime(day, template.startTime);
  let endAt = combineDateAndTime(day, template.endTime);
  if (template.isNight) {
    endAt = combineDateAndTime(addDays(day, 1), template.endTime);
  }

  if (parsed.data.replaceAssignmentId) {
    await prisma.shiftAssignment.update({
      where: { id: parsed.data.replaceAssignmentId },
      data: { status: ShiftStatus.CANCELLED },
    });
  }

  // Cancel any other same-day active assignment for this nurse
  const dayStart = combineDateAndTime(day, "00:00");
  const dayEnd = addDays(dayStart, 1);
  await prisma.shiftAssignment.updateMany({
    where: {
      nurseId: nurse.id,
      status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
      startAt: { gte: dayStart, lt: dayEnd },
    },
    data: { status: ShiftStatus.CANCELLED },
  });

  const issues = await evaluateAssignment({ nurse, startAt, endAt });
  await persistAlerts(issues);

  if (hasBlockingIssues(issues)) {
    return {
      error: issues
        .filter((i) => i.severity === "BLOCK")
        .map((i) => i.message)
        .join(" "),
      warnings: issues
        .filter((i) => i.severity === "WARNING")
        .map((i) => i.message),
    };
  }

  await prisma.shiftAssignment.create({
    data: {
      nurseId: nurse.id,
      unitId: parsed.data.unitId,
      templateId: template.id,
      startAt,
      endAt,
      status: ShiftStatus.DRAFT,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/roster");
  revalidatePath("/admin/compliance");
  revalidatePath("/admin/analytics");
  return {
    success: true,
    warnings: issues
      .filter((i) => i.severity === "WARNING")
      .map((i) => i.message),
  };
};

export const bulkAssignShifts = async (input: {
  nurseIds: string[];
  unitId: string;
  templateId: string;
  dates: string[];
}): Promise<AssignResult> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  if (
    input.nurseIds.length === 0 ||
    input.dates.length === 0 ||
    !input.templateId
  ) {
    return { error: "Select nurses, dates, and a shift." };
  }

  const warnings: string[] = [];
  let successCount = 0;

  for (const nurseId of input.nurseIds) {
    for (const date of input.dates) {
      const fd = new FormData();
      fd.set("nurseId", nurseId);
      fd.set("unitId", input.unitId);
      fd.set("templateId", input.templateId);
      fd.set("date", date);
      const result = await assignShift(fd);
      if (result.error) warnings.push(`${date}: ${result.error}`);
      else {
        successCount += 1;
        if (result.warnings) warnings.push(...result.warnings);
      }
    }
  }

  revalidatePath("/admin/roster");
  return {
    success: successCount > 0,
    error:
      successCount === 0
        ? warnings[0] || "No shifts assigned."
        : undefined,
    warnings: warnings.slice(0, 8),
  };
};

export const bulkClearAssignments = async (input: {
  assignmentIds: string[];
}): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  if (input.assignmentIds.length === 0) return;

  await prisma.shiftAssignment.updateMany({
    where: { id: { in: input.assignmentIds } },
    data: { status: ShiftStatus.CANCELLED },
  });

  revalidatePath("/admin/roster");
  revalidatePath("/nurse");
};

export const cancelAssignment = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.shiftAssignment.update({
    where: { id },
    data: { status: ShiftStatus.CANCELLED },
  });

  revalidatePath("/admin/roster");
  revalidatePath("/nurse");
};

export const publishPeriod = async (formData: FormData): Promise<AssignResult> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const unitId = String(formData.get("unitId") ?? "");
  const startStr = String(formData.get("periodStart") ?? "");
  const endStr = String(formData.get("periodEnd") ?? "");
  if (!unitId || !startStr || !endStr) {
    return { error: "Missing unit or period." };
  }

  const periodStart = parseISO(startStr);
  const periodEnd = parseISO(endStr);

  const drafts = await prisma.shiftAssignment.findMany({
    where: {
      unitId,
      status: ShiftStatus.DRAFT,
      startAt: { gte: periodStart, lt: periodEnd },
    },
    select: { nurse: { select: { userId: true } } },
  });

  if (drafts.length === 0) {
    return { success: true, warnings: ["No drafts to publish."] };
  }

  const userIds = [...new Set(drafts.map((d) => d.nurse.userId))];
  const rangeLabel = `${format(periodStart, "MMM d")}–${format(addDays(periodEnd, -1), "MMM d, yyyy")}`;

  await prisma.shiftAssignment.updateMany({
    where: {
      unitId,
      status: ShiftStatus.DRAFT,
      startAt: { gte: periodStart, lt: periodEnd },
    },
    data: { status: ShiftStatus.PUBLISHED },
  });

  await createNotifications(
    userIds.map((userId) => ({
      userId,
      title: "Schedule published",
      body: `Your roster for ${rangeLabel} is now published.`,
    })),
  );

  revalidatePath("/admin/roster");
  revalidatePath("/nurse");
  revalidatePath("/nurse/notifications");
  return {
    success: true,
    warnings: [`Published ${drafts.length} shifts to ${userIds.length} nurses.`],
  };
};

/** @deprecated use publishPeriod */
export const publishWeek = publishPeriod;

export const runAutoRoster = async (formData: FormData): Promise<AssignResult> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const unitId = String(formData.get("unitId") ?? "");
  const startStr = String(formData.get("periodStart") ?? "");
  const endStr = String(formData.get("periodEnd") ?? "");
  if (!unitId || !startStr || !endStr) {
    return { error: "Missing unit or period." };
  }

  const result = await generateRoster({
    unitId,
    periodStart: parseISO(startStr),
    periodEnd: parseISO(endStr),
    replaceDrafts: true,
  });

  revalidatePath("/admin/roster");
  revalidatePath("/admin/compliance");
  return { success: true, warnings: [result.message] };
};

export const copyPreviousPeriod = async (
  formData: FormData,
): Promise<AssignResult> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const unitId = String(formData.get("unitId") ?? "");
  const startStr = String(formData.get("periodStart") ?? "");
  const endStr = String(formData.get("periodEnd") ?? "");
  if (!unitId || !startStr || !endStr) {
    return { error: "Missing unit or period." };
  }

  const periodStart = parseISO(startStr);
  const periodEnd = parseISO(endStr);
  const dayCount = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  const prevStart = addDays(periodStart, -dayCount);
  const prevEnd = periodStart;

  const previous = await prisma.shiftAssignment.findMany({
    where: {
      unitId,
      status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
      startAt: { gte: prevStart, lt: prevEnd },
    },
  });

  let created = 0;
  for (const prev of previous) {
    const offsetDays = Math.round(
      (prev.startAt.getTime() - prevStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    const newStart = addDays(periodStart, offsetDays);
    const duration = prev.endAt.getTime() - prev.startAt.getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    const nurse = await prisma.nurseProfile.findUnique({
      where: { id: prev.nurseId },
    });
    if (!nurse || nurse.archivedAt) continue;

    const issues = await evaluateAssignment({
      nurse,
      startAt: newStart,
      endAt: newEnd,
    });
    if (hasBlockingIssues(issues)) {
      await persistAlerts(issues);
      continue;
    }

    await prisma.shiftAssignment.create({
      data: {
        nurseId: prev.nurseId,
        unitId,
        templateId: prev.templateId,
        startAt: newStart,
        endAt: newEnd,
        status: ShiftStatus.DRAFT,
      },
    });
    created += 1;
  }

  revalidatePath("/admin/roster");
  return {
    success: true,
    warnings: [`Copied ${created} shifts from the previous period.`],
  };
};
