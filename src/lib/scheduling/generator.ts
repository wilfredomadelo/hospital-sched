import {
  addDays,
  differenceInMinutes,
  endOfISOWeek,
  setHours,
  setMinutes,
  startOfISOWeek,
} from "date-fns";
import {
  LeaveStatus,
  ShiftStatus,
  type NurseProfile,
  type ShiftTemplate,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  evaluateAssignment,
  hasBlockingIssues,
  persistAlerts,
} from "@/lib/scheduling/compliance";

const combineDateAndTime = (date: Date, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(date, h), m);
};

const hoursBetween = (start: Date, end: Date) =>
  differenceInMinutes(end, start) / 60;

type NurseWithUser = NurseProfile & {
  user: { id: string; name: string };
};

const parsePrefs = (raw: string) => {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [] as string[];
  }
};

/**
 * Rule-based roster generator for a unit over [periodStart, periodEnd).
 * Considers leave, preferences, max hours, rest, night rotation fairness.
 */
export const generateRoster = async (params: {
  unitId: string;
  periodStart: Date;
  periodEnd: Date;
  replaceDrafts?: boolean;
}): Promise<{ created: number; skipped: number; message: string }> => {
  const { unitId, periodStart, periodEnd, replaceDrafts = true } = params;

  const [nurses, templates, leaves, holidays] = await Promise.all([
    prisma.nurseProfile.findMany({
      where: { unitId },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.shiftTemplate.findMany({ orderBy: { startTime: "asc" } }),
    prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.APPROVED,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
        nurse: { unitId },
      },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: periodStart, lt: periodEnd } },
    }),
  ]);

  if (nurses.length === 0) {
    return {
      created: 0,
      skipped: 0,
      message: "No nurses assigned to this unit.",
    };
  }
  if (templates.length === 0) {
    return { created: 0, skipped: 0, message: "No shift templates configured." };
  }

  if (replaceDrafts) {
    await prisma.shiftAssignment.updateMany({
      where: {
        unitId,
        status: ShiftStatus.DRAFT,
        startAt: { gte: periodStart, lt: periodEnd },
      },
      data: { status: ShiftStatus.CANCELLED },
    });
  }

  const holidayKeys = new Set(
    holidays.map((h) => h.date.toISOString().slice(0, 10)),
  );
  const leaveByNurse = new Map<string, typeof leaves>();
  for (const leave of leaves) {
    const list = leaveByNurse.get(leave.nurseId) ?? [];
    list.push(leave);
    leaveByNurse.set(leave.nurseId, list);
  }

  const nightTemplate =
    templates.find((t) => t.isNight) ??
    templates.find((t) => t.name.toLowerCase().includes("night"));
  const dayTemplates = templates.filter((t) => t !== nightTemplate);
  const workload = new Map(nurses.map((n) => [n.id, 0]));
  const nightCounts = new Map(nurses.map((n) => [n.id, 0]));

  let created = 0;
  let skipped = 0;
  const dayCount = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  for (let i = 0; i < dayCount; i++) {
    const day = addDays(periodStart, i);
    const key = day.toISOString().slice(0, 10);
    if (holidayKeys.has(key)) continue;

    // Target coverage: at least 2 day/evening + 1 night when possible
    const slots: ShiftTemplate[] = [];
    if (dayTemplates[0]) slots.push(dayTemplates[0]);
    if (dayTemplates[1]) slots.push(dayTemplates[1]);
    else if (dayTemplates[0]) slots.push(dayTemplates[0]);
    if (nightTemplate) slots.push(nightTemplate);

    const usedNurses = new Set<string>();

    for (const template of slots) {
      const candidates = rankCandidates({
        nurses,
        template,
        day,
        leaveByNurse,
        usedNurses,
        workload,
        nightCounts,
      });

      let placed = false;
      for (const nurse of candidates) {
        let startAt = combineDateAndTime(day, template.startTime);
        let endAt = combineDateAndTime(day, template.endTime);
        if (template.isNight) {
          endAt = combineDateAndTime(addDays(day, 1), template.endTime);
        }

        const issues = await evaluateAssignment({ nurse, startAt, endAt });
        if (hasBlockingIssues(issues)) {
          await persistAlerts(issues);
          continue;
        }

        if (issues.length > 0) await persistAlerts(issues);

        await prisma.shiftAssignment.create({
          data: {
            nurseId: nurse.id,
            unitId,
            templateId: template.id,
            startAt,
            endAt,
            status: ShiftStatus.DRAFT,
          },
        });

        usedNurses.add(nurse.id);
        workload.set(
          nurse.id,
          (workload.get(nurse.id) ?? 0) + hoursBetween(startAt, endAt),
        );
        if (template.isNight) {
          nightCounts.set(nurse.id, (nightCounts.get(nurse.id) ?? 0) + 1);
        }
        created += 1;
        placed = true;
        break;
      }

      if (!placed) skipped += 1;
    }
  }

  return {
    created,
    skipped,
    message: `Generated ${created} draft shifts (${skipped} slots unfilled).`,
  };
};

const rankCandidates = (params: {
  nurses: NurseWithUser[];
  template: ShiftTemplate;
  day: Date;
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>;
  usedNurses: Set<string>;
  workload: Map<string, number>;
  nightCounts: Map<string, number>;
}) => {
  const {
    nurses,
    template,
    day,
    leaveByNurse,
    usedNurses,
    workload,
    nightCounts,
  } = params;

  const weekStart = startOfISOWeek(day);
  const weekEnd = endOfISOWeek(day);

  return [...nurses]
    .filter((nurse) => {
      if (usedNurses.has(nurse.id)) return false;
      if (nurse.licenseExpiresAt < day) return false;
      const leaves = leaveByNurse.get(nurse.id) ?? [];
      const onLeave = leaves.some(
        (l) => l.startDate <= day && l.endDate >= day,
      );
      if (onLeave) return false;
      return true;
    })
    .sort((a, b) => {
      const prefsA = parsePrefs(a.preferredShifts);
      const prefsB = parsePrefs(b.preferredShifts);
      const prefScore = (prefs: string[]) =>
        prefs.some((p) =>
          template.name.toLowerCase().includes(p.toLowerCase()),
        )
          ? 0
          : 1;
      const nightBias = template.isNight
        ? (nightCounts.get(a.id) ?? 0) - (nightCounts.get(b.id) ?? 0)
        : 0;
      const load =
        (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0);
      // Prefer preferred shift, then lower night count, then lower total hours
      return (
        prefScore(prefsA) - prefScore(prefsB) || nightBias || load
      );
    })
    .filter((nurse) => {
      // Soft cap: skip if already near max for the ISO week in workload map
      // (approximate using running workload added this generation only)
      void weekStart;
      void weekEnd;
      return (workload.get(nurse.id) ?? 0) < nurse.maxHoursPerWeek + 8;
    });
};
