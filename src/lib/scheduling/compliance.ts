import {
  AlertSeverity,
  AlertType,
  LeaveStatus,
  ShiftStatus,
  type NurseProfile,
  type ShiftAssignment,
} from "@prisma/client";
import { differenceInMinutes, endOfISOWeek, startOfISOWeek } from "date-fns";
import { prisma } from "@/lib/prisma";

export const MIN_REST_HOURS = 8;

export type ComplianceIssue = {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  relatedAssignmentIds: string[];
  nurseId?: string;
};

type IntervalLike = Pick<ShiftAssignment, "id" | "startAt" | "endAt">;

type AssignmentLike = IntervalLike &
  Pick<ShiftAssignment, "nurseId" | "status">;

const hoursBetween = (start: Date, end: Date) =>
  differenceInMinutes(end, start) / 60;

const intervalsOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
) => aStart < bEnd && bStart < aEnd;

export const evaluateAssignment = async (params: {
  nurse: NurseProfile;
  startAt: Date;
  endAt: Date;
  excludeAssignmentId?: string;
}): Promise<ComplianceIssue[]> => {
  const { nurse, startAt, endAt, excludeAssignmentId } = params;
  const issues: ComplianceIssue[] = [];

  if (nurse.licenseExpiresAt < startAt) {
    issues.push({
      type: AlertType.LICENSE_EXPIRED,
      severity: AlertSeverity.BLOCK,
      message: `License ${nurse.licenseNumber} expired before shift starts.`,
      relatedAssignmentIds: [],
      nurseId: nurse.id,
    });
  }

  const leaveConflict = await prisma.leaveRequest.findFirst({
    where: {
      nurseId: nurse.id,
      status: LeaveStatus.APPROVED,
      startDate: { lte: endAt },
      endDate: { gte: startAt },
    },
  });
  if (leaveConflict) {
    issues.push({
      type: AlertType.ON_LEAVE,
      severity: AlertSeverity.BLOCK,
      message: "Nurse has approved leave overlapping this shift.",
      relatedAssignmentIds: [],
      nurseId: nurse.id,
    });
  }

  const existing = await prisma.shiftAssignment.findMany({
    where: {
      nurseId: nurse.id,
      status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
    },
    orderBy: { startAt: "asc" },
  });

  for (const other of existing) {
    if (intervalsOverlap(startAt, endAt, other.startAt, other.endAt)) {
      issues.push({
        type: AlertType.OVERLAP,
        severity: AlertSeverity.BLOCK,
        message: "Shift overlaps an existing assignment for this nurse.",
        relatedAssignmentIds: [other.id],
        nurseId: nurse.id,
      });
    }
  }

  const weekStart = startOfISOWeek(startAt);
  const weekEnd = endOfISOWeek(startAt);
  const weekAssignments = existing.filter(
    (a) => a.startAt >= weekStart && a.startAt <= weekEnd,
  );
  const proposedHours = hoursBetween(startAt, endAt);
  const existingHours = weekAssignments.reduce(
    (sum, a) => sum + hoursBetween(a.startAt, a.endAt),
    0,
  );
  if (existingHours + proposedHours > nurse.maxHoursPerWeek) {
    issues.push({
      type: AlertType.MAX_HOURS,
      severity: AlertSeverity.WARNING,
      message: `Would exceed max ${nurse.maxHoursPerWeek}h/week (${(existingHours + proposedHours).toFixed(1)}h).`,
      relatedAssignmentIds: weekAssignments.map((a) => a.id),
      nurseId: nurse.id,
    });
  }

  const restIssues = checkRestGaps(
    [...existing, { id: "new", startAt, endAt }],
    "new",
  );
  issues.push(...restIssues.map((i) => ({ ...i, nurseId: nurse.id })));

  return issues;
};

const checkRestGaps = (
  assignments: IntervalLike[],
  focusId?: string,
): ComplianceIssue[] => {
  const sorted = [...assignments].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  const issues: ComplianceIssue[] = [];
  const minRestMs = MIN_REST_HOURS * 60 * 60 * 1000;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const gap = next.startAt.getTime() - current.endAt.getTime();
    if (gap >= 0 && gap < minRestMs) {
      if (focusId && current.id !== focusId && next.id !== focusId) continue;
      const gapHours = gap / (60 * 60 * 1000);
      issues.push({
        type: AlertType.REST_PERIOD,
        severity: AlertSeverity.BLOCK,
        message:
          gap === 0
            ? "Connecting schedules are not allowed (one shift ends exactly when the next starts)."
            : `Less than ${MIN_REST_HOURS}h rest between shifts (${gapHours.toFixed(1)}h gap).`,
        relatedAssignmentIds: [current.id, next.id].filter((id) => id !== "new"),
      });
    }
  }
  return issues;
};

/** True when a proposed shift leaves less than MIN_REST_HOURS after/before an existing one. */
export const hasInsufficientRest = (
  startAt: Date,
  endAt: Date,
  existing: IntervalLike[],
) =>
  checkRestGaps(
    [
      ...existing,
      { id: "new", startAt, endAt },
    ],
    "new",
  ).length > 0;

export const persistAlerts = async (issues: ComplianceIssue[]) => {
  if (issues.length === 0) return;
  await prisma.complianceAlert.createMany({
    data: issues.map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      relatedAssignmentIds: JSON.stringify(issue.relatedAssignmentIds),
      nurseId: issue.nurseId,
    })),
  });
};

export const hasBlockingIssues = (issues: ComplianceIssue[]) =>
  issues.some((i) => i.severity === AlertSeverity.BLOCK);
