import {
  addDays,
  format,
  getDay,
  setHours,
  setMinutes,
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
import { DUTY_CODES } from "@/lib/scheduling/duty-codes";

const combineDateAndTime = (date: Date, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(date, h), m);
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

const isWeekend = (d: Date) => {
  const day = getDay(d);
  return day === 0 || day === 6;
};

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

const onLeaveThatDay = (
  nurseId: string,
  day: Date,
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>,
) => {
  const leaves = leaveByNurse.get(nurseId) ?? [];
  return leaves.some((l) => l.startDate <= day && l.endDate >= day);
};

/**
 * Auto-roster rules:
 * - Off days per nurse = Saturdays + Sundays + holidays in the period
 * - Remaining days are work days
 * - On-duty headcount spread evenly across days
 * - Every day has at least one nurse on duty
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

  const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)));
  const leaveByNurse = new Map<string, typeof leaves>();
  for (const leave of leaves) {
    const list = leaveByNurse.get(leave.nurseId) ?? [];
    list.push(leave);
    leaveByNurse.set(leave.nurseId, list);
  }

  const dayCount = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  const days = Array.from({ length: dayCount }, (_, i) =>
    addDays(periodStart, i),
  );

  const offQuota = days.filter(
    (d) => isWeekend(d) || holidayKeys.has(dayKey(d)),
  ).length;
  const workTarget = Math.max(0, dayCount - offQuota);

  const dutyNames = new Set(DUTY_CODES.map((d) => d.code));
  // Prefer common 8h duties for auto-fill balance
  const preferredAuto = ["7", "3", "11", "6", "8", "2", "10", "12"];
  const orderedTemplates = orderTemplates(
    templates.filter((t) => dutyNames.has(t.name)),
  ).sort((a, b) => {
    const ia = preferredAuto.indexOf(a.name);
    const ib = preferredAuto.indexOf(b.name);
    const sa = ia === -1 ? 99 : ia;
    const sb = ib === -1 ? 99 : ib;
    return sa - sb || a.startTime.localeCompare(b.startTime);
  });

  if (orderedTemplates.length === 0) {
    return {
      created: 0,
      skipped: 0,
      message: "No duty-code templates found. Re-run db seed.",
    };
  }
  const minOnDuty = Math.max(1, Math.min(orderedTemplates.length, nurses.length));
  const targetOnDuty = Math.max(
    minOnDuty,
    Math.round((nurses.length * workTarget) / Math.max(1, dayCount)),
  );

  const offPlan = buildOffPlan({
    nurses,
    days,
    leaveByNurse,
    offQuota,
    minOnDuty,
    targetOnDuty,
  });

  const nightCounts = new Map(nurses.map((n) => [n.id, 0]));
  const workDays = new Map(nurses.map((n) => [n.id, 0]));
  let created = 0;
  let blocked = 0;
  let unstaffedDays = 0;

  for (const day of days) {
    const key = dayKey(day);
    let working = nurses.filter((n) => {
      if (offPlan.get(n.id)?.has(key)) return false;
      if (n.licenseExpiresAt < day) return false;
      if (onLeaveThatDay(n.id, day, leaveByNurse)) return false;
      return true;
    });

    if (working.length === 0) {
      const rescue = nurses
        .filter(
          (n) =>
            n.licenseExpiresAt >= day &&
            !onLeaveThatDay(n.id, day, leaveByNurse),
        )
        .sort(
          (a, b) =>
            (workDays.get(a.id) ?? 0) - (workDays.get(b.id) ?? 0) ||
            (offPlan.get(b.id)?.size ?? 0) - (offPlan.get(a.id)?.size ?? 0),
        )[0];

      if (rescue) {
        offPlan.get(rescue.id)?.delete(key);
        working = [rescue];
      } else {
        unstaffedDays += 1;
        continue;
      }
    }

    // Keep daily headcount near target
    if (working.length > targetOnDuty) {
      working.sort(
        (a, b) =>
          (workDays.get(a.id) ?? 0) - (workDays.get(b.id) ?? 0) ||
          a.user.name.localeCompare(b.user.name),
      );
      const keep = working.slice(0, targetOnDuty);
      const extras = working.slice(targetOnDuty);
      working = keep;
      for (const n of extras) {
        if ((offPlan.get(n.id)?.size ?? 0) < offQuota) {
          offPlan.get(n.id)!.add(key);
        }
      }
    }

    const assignments = balanceShiftTypes(working, orderedTemplates, nightCounts);

    for (const { nurse, template } of assignments) {
      const placed = await placeNurseShift({
        nurse,
        templates: orderedTemplates,
        preferred: template,
        day,
        unitId,
        nightCounts,
        workDays,
      });

      if (placed) created += 1;
      else {
        offPlan.get(nurse.id)?.add(key);
        blocked += 1;
      }
    }

    const dayStart = combineDateAndTime(day, "00:00");
    const onDuty = await prisma.shiftAssignment.count({
      where: {
        unitId,
        status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
        startAt: { gte: dayStart, lt: addDays(dayStart, 1) },
      },
    });

    if (onDuty === 0) {
      const any = nurses.find(
        (n) =>
          n.licenseExpiresAt >= day &&
          !onLeaveThatDay(n.id, day, leaveByNurse),
      );
      if (any) {
        offPlan.get(any.id)?.delete(key);
        const ok = await placeNurseShift({
          nurse: any,
          templates: orderedTemplates,
          preferred: orderedTemplates[0],
          day,
          unitId,
          nightCounts,
          workDays,
          relax: true,
        });
        if (ok) created += 1;
        else unstaffedDays += 1;
      } else {
        unstaffedDays += 1;
      }
    }
  }

  const offCounts = nurses.map((n) => offPlan.get(n.id)?.size ?? 0);
  const avgOff =
    offCounts.reduce((a, b) => a + b, 0) / Math.max(1, offCounts.length);
  const avgWork =
    [...workDays.values()].reduce((a, b) => a + b, 0) /
    Math.max(1, nurses.length);

  return {
    created,
    skipped: blocked,
    message: `Generated ${created} drafts. Off quota ${offQuota}/nurse; ~${targetOnDuty} on duty/day. Avg off ${avgOff.toFixed(1)}, avg work ${avgWork.toFixed(1)}/${workTarget}.${
      unstaffedDays > 0
        ? ` ${unstaffedDays} day(s) unstaffed.`
        : " All days covered."
    }`,
  };
};

const placeNurseShift = async (params: {
  nurse: NurseWithUser;
  templates: ShiftTemplate[];
  preferred: ShiftTemplate;
  day: Date;
  unitId: string;
  nightCounts: Map<string, number>;
  workDays: Map<string, number>;
  relax?: boolean;
}) => {
  const {
    nurse,
    templates,
    preferred,
    day,
    unitId,
    nightCounts,
    workDays,
    relax = false,
  } = params;

  const tryOne = async (template: ShiftTemplate) => {
    let startAt = combineDateAndTime(day, template.startTime);
    let endAt = combineDateAndTime(day, template.endTime);
    if (template.isNight) {
      endAt = combineDateAndTime(addDays(day, 1), template.endTime);
    }

    const issues = await evaluateAssignment({ nurse, startAt, endAt });
    if (hasBlockingIssues(issues)) {
      if (!relax) {
        await persistAlerts(issues);
        return false;
      }
      const hard = issues.filter(
        (i) =>
          i.type === "OVERLAP" ||
          i.type === "ON_LEAVE" ||
          i.type === "LICENSE_EXPIRED",
      );
      if (hard.length > 0) {
        await persistAlerts(issues);
        return false;
      }
    } else if (issues.length > 0) {
      await persistAlerts(issues);
    }

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

    workDays.set(nurse.id, (workDays.get(nurse.id) ?? 0) + 1);
    if (template.isNight) {
      nightCounts.set(nurse.id, (nightCounts.get(nurse.id) ?? 0) + 1);
    }
    return true;
  };

  if (await tryOne(preferred)) return true;
  for (const alt of templates) {
    if (alt.id === preferred.id) continue;
    if (await tryOne(alt)) return true;
  }
  return false;
};

const orderTemplates = (templates: ShiftTemplate[]) => {
  const score = (t: ShiftTemplate) => {
    if (t.isNight) return 2;
    const hour = Number(t.startTime.split(":")[0] ?? 0);
    if (hour >= 14) return 1;
    return 0;
  };
  return [...templates].sort(
    (a, b) => score(a) - score(b) || a.startTime.localeCompare(b.startTime),
  );
};

/** Spread Day / Evening / Night as evenly as possible among working nurses. */
const balanceShiftTypes = (
  working: NurseWithUser[],
  templates: ShiftTemplate[],
  nightCounts: Map<string, number>,
) => {
  const counts = templates.map(() => 0);
  const result: { nurse: NurseWithUser; template: ShiftTemplate }[] = [];

  const sorted = [...working].sort((a, b) =>
    a.user.name.localeCompare(b.user.name),
  );

  for (const nurse of sorted) {
    const prefs = parsePrefs(nurse.preferredShifts);
    let bestIdx = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const prefBonus = prefs.some((p) =>
        t.name.toLowerCase().includes(p.toLowerCase()),
      )
        ? -0.5
        : 0;
      const nightPenalty =
        t.isNight && (nightCounts.get(nurse.id) ?? 0) > 2 ? 2 : 0;
      const score = counts[i] + prefBonus + nightPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    counts[bestIdx] += 1;
    result.push({ nurse, template: templates[bestIdx] });
  }

  return result;
};

/**
 * Assign each nurse `offQuota` OFF days, keeping ~targetOnDuty working each day.
 * Offs are spread across the whole period (not piled onto weekends only).
 */
const buildOffPlan = (params: {
  nurses: NurseWithUser[];
  days: Date[];
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>;
  offQuota: number;
  minOnDuty: number;
  targetOnDuty: number;
}) => {
  const { nurses, days, leaveByNurse, offQuota, minOnDuty, targetOnDuty } =
    params;

  const offPlan = new Map<string, Set<string>>();
  const offCount = new Map<string, number>();
  for (const n of nurses) {
    offPlan.set(n.id, new Set());
    offCount.set(n.id, 0);
  }

  if (offQuota <= 0 || days.length === 0) return offPlan;

  const available = (day: Date) =>
    nurses.filter(
      (n) =>
        n.licenseExpiresAt >= day &&
        !onLeaveThatDay(n.id, day, leaveByNurse),
    );

  // Pass 1: each day take offs until headcount ≈ targetOnDuty
  for (const day of days) {
    const key = dayKey(day);
    const pool = available(day);
    const desiredOn = Math.min(
      pool.length,
      Math.max(minOnDuty, Math.min(targetOnDuty, pool.length)),
    );
    const desiredOff = Math.max(0, pool.length - desiredOn);
    if (desiredOff === 0) continue;

    const needing = [...pool]
      .filter((n) => (offCount.get(n.id) ?? 0) < offQuota)
      .sort((a, b) => {
        const ca = offCount.get(a.id) ?? 0;
        const cb = offCount.get(b.id) ?? 0;
        if (ca !== cb) return ca - cb;
        // Stagger by rotating name hash with day index for variety
        const dayBias =
          (a.id.charCodeAt(0) + days.indexOf(day)) % 7 -
          ((b.id.charCodeAt(0) + days.indexOf(day)) % 7);
        return dayBias || a.user.name.localeCompare(b.user.name);
      });

    for (const nurse of needing.slice(0, desiredOff)) {
      offPlan.get(nurse.id)!.add(key);
      offCount.set(nurse.id, (offCount.get(nurse.id) ?? 0) + 1);
    }
  }

  // Pass 2: nurses still short of offQuota — add offs on fullest days
  const onDutyEstimate = (day: Date) => {
    const key = dayKey(day);
    return available(day).filter((n) => !offPlan.get(n.id)?.has(key)).length;
  };

  for (const nurse of nurses) {
    while ((offCount.get(nurse.id) ?? 0) < offQuota) {
      const candidates = days
        .map((day, idx) => ({ day, idx, key: dayKey(day) }))
        .filter(({ day, key }) => {
          if (offPlan.get(nurse.id)?.has(key)) return false;
          if (nurse.licenseExpiresAt < day) return false;
          if (onLeaveThatDay(nurse.id, day, leaveByNurse)) return false;
          return onDutyEstimate(day) > minOnDuty;
        })
        .sort(
          (a, b) =>
            onDutyEstimate(b.day) - onDutyEstimate(a.day) || a.idx - b.idx,
        );

      if (candidates.length === 0) break;

      const pick = candidates[0];
      offPlan.get(nurse.id)!.add(pick.key);
      offCount.set(nurse.id, (offCount.get(nurse.id) ?? 0) + 1);
    }
  }

  return offPlan;
};
