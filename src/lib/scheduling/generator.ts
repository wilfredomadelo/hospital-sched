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

const intervalsOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
) => aStart < bEnd && bStart < aEnd;

const templateInterval = (template: ShiftTemplate, day: Date) => {
  const startAt = combineDateAndTime(day, template.startTime);
  let endAt = combineDateAndTime(day, template.endTime);
  if (template.isNight || endAt <= startAt) {
    endAt = combineDateAndTime(addDays(day, 1), template.endTime);
  }
  return { startAt, endAt };
};

type NurseWithUser = NurseProfile & {
  user: { id: string; name: string };
};

type MemAssignment = {
  id: string;
  nurseId: string;
  startAt: Date;
  endAt: Date;
};

type PendingCreate = {
  nurseId: string;
  unitId: string;
  templateId: string;
  startAt: Date;
  endAt: Date;
  status: typeof ShiftStatus.DRAFT;
};

const onLeaveThatDay = (
  nurseId: string,
  day: Date,
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>,
) => {
  const leaves = leaveByNurse.get(nurseId) ?? [];
  return leaves.some((l) => l.startDate <= day && l.endDate >= day);
};

const onLeaveOverlap = (
  nurseId: string,
  startAt: Date,
  endAt: Date,
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>,
) => {
  const leaves = leaveByNurse.get(nurseId) ?? [];
  return leaves.some((l) => l.startDate <= endAt && l.endDate >= startAt);
};

/** In-memory hard blocks only (no DB). Soft warnings are ignored during auto-gen. */
const isBlocked = (params: {
  nurse: NurseWithUser;
  startAt: Date;
  endAt: Date;
  existing: MemAssignment[];
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>;
}) => {
  const { nurse, startAt, endAt, existing, leaveByNurse } = params;
  if (nurse.licenseExpiresAt < startAt) return true;
  if (onLeaveOverlap(nurse.id, startAt, endAt, leaveByNurse)) return true;
  for (const other of existing) {
    if (intervalsOverlap(startAt, endAt, other.startAt, other.endAt)) {
      return true;
    }
  }
  return false;
};

/**
 * Auto-roster rules:
 * - Rest Day (RD) per nurse = count of Saturdays + Sundays + public holidays
 *   in the selected period (holiday on a weekend counts once)
 * - Remaining days are work days
 * - RDs and on-duty headcount spread as evenly as possible across days
 * - Every day has at least one nurse on duty
 * - Every duty code in the selected schedule type gets a nurse when staff exist
 *
 * Performance: plan + validate in memory, then one batched createMany.
 */
export const generateRoster = async (params: {
  unitId: string;
  periodStart: Date;
  periodEnd: Date;
  replaceDrafts?: boolean;
  nurseIds?: string[];
  dutyCodes?: string[];
}): Promise<{ created: number; skipped: number; message: string }> => {
  const {
    unitId,
    periodStart,
    periodEnd,
    replaceDrafts = true,
    nurseIds,
    dutyCodes,
  } = params;

  const nurseFilter =
    nurseIds && nurseIds.length > 0 ? { id: { in: nurseIds } } : {};

  const [nurses, templates, leaves, holidays] = await Promise.all([
    prisma.nurseProfile.findMany({
      where: { unitId, archivedAt: null, ...nurseFilter },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.shiftTemplate.findMany({ orderBy: { startTime: "asc" } }),
    prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.APPROVED,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
        nurse: { unitId, archivedAt: null, ...nurseFilter },
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
        ...(nurseIds && nurseIds.length > 0 ? { nurseId: { in: nurseIds } } : {}),
      },
      data: { status: ShiftStatus.CANCELLED },
    });
  }

  const resolvedNurseIds = nurses.map((n) => n.id);

  // One fetch of remaining assignments (published / outside period) for overlap checks
  const existingRows = await prisma.shiftAssignment.findMany({
    where: {
      nurseId: { in: resolvedNurseIds },
      status: { in: [ShiftStatus.DRAFT, ShiftStatus.PUBLISHED] },
    },
    select: { id: true, nurseId: true, startAt: true, endAt: true },
  });

  const byNurse = new Map<string, MemAssignment[]>();
  for (const id of resolvedNurseIds) byNurse.set(id, []);
  for (const row of existingRows) {
    byNurse.get(row.nurseId)?.push(row);
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

  const weekendCount = days.filter((d) => isWeekend(d)).length;
  const holidayOnlyCount = days.filter(
    (d) => holidayKeys.has(dayKey(d)) && !isWeekend(d),
  ).length;
  const rdQuota = weekendCount + holidayOnlyCount;
  const workTarget = Math.max(0, dayCount - rdQuota);

  const dutyNames = new Set(DUTY_CODES.map((d) => d.code));
  const requestedCodes = (dutyCodes ?? []).filter((c) => dutyNames.has(c));
  const preferredAuto =
    requestedCodes.length > 0
      ? requestedCodes
      : ["7", "3", "11", "6", "8", "2", "10", "12"];
  const orderedTemplates = orderTemplates(
    templates.filter((t) => preferredAuto.includes(t.name)),
  ).sort((a, b) => {
    const ia = preferredAuto.indexOf(a.name);
    const ib = preferredAuto.indexOf(b.name);
    return ia - ib || a.startTime.localeCompare(b.startTime);
  });

  const placeTemplates =
    orderedTemplates.length > 0
      ? orderedTemplates
      : requestedCodes.length > 0
        ? []
        : orderTemplates(templates.filter((t) => dutyNames.has(t.name))).slice(
            0,
            8,
          );

  if (placeTemplates.length === 0) {
    return {
      created: 0,
      skipped: 0,
      message:
        requestedCodes.length > 0
          ? "No shift templates match that schedule type. Check legend codes."
          : "No duty-code templates found. Re-run db seed.",
    };
  }

  const minOnDuty = Math.max(1, Math.min(placeTemplates.length, nurses.length));
  const targetOnDuty = Math.max(
    minOnDuty,
    Math.round((nurses.length * workTarget) / Math.max(1, dayCount)),
  );

  const offPlan = buildRestDayPlan({
    nurses,
    days,
    leaveByNurse,
    rdQuota,
    minOnDuty,
    targetOnDuty,
  });

  const nightCounts = new Map(nurses.map((n) => [n.id, 0]));
  const workDays = new Map(nurses.map((n) => [n.id, 0]));
  const pending: PendingCreate[] = [];
  let blocked = 0;
  let unstaffedDays = 0;
  let memId = 0;

  const tryPlace = (
    nurse: NurseWithUser,
    template: ShiftTemplate,
    day: Date,
  ) => {
    const { startAt, endAt } = templateInterval(template, day);
    const existing = byNurse.get(nurse.id) ?? [];
    if (
      isBlocked({
        nurse,
        startAt,
        endAt,
        existing,
        leaveByNurse,
      })
    ) {
      return false;
    }

    memId += 1;
    const id = `pending-${memId}`;
    existing.push({ id, nurseId: nurse.id, startAt, endAt });
    pending.push({
      nurseId: nurse.id,
      unitId,
      templateId: template.id,
      startAt,
      endAt,
      status: ShiftStatus.DRAFT,
    });
    workDays.set(nurse.id, (workDays.get(nurse.id) ?? 0) + 1);
    if (template.isNight) {
      nightCounts.set(nurse.id, (nightCounts.get(nurse.id) ?? 0) + 1);
    }
    return true;
  };

  const sortByLoad = (a: NurseWithUser, b: NurseWithUser) =>
    (workDays.get(a.id) ?? 0) - (workDays.get(b.id) ?? 0) ||
    (nightCounts.get(a.id) ?? 0) - (nightCounts.get(b.id) ?? 0) ||
    a.user.name.localeCompare(b.user.name);

  const coverOrder = [...placeTemplates].sort((a, b) => {
    const overlapCount = (t: ShiftTemplate) =>
      placeTemplates.filter((other) => {
        if (other.id === t.id) return false;
        const left = templateInterval(t, periodStart);
        const right = templateInterval(other, periodStart);
        return intervalsOverlap(
          left.startAt,
          left.endAt,
          right.startAt,
          right.endAt,
        );
      }).length;
    return overlapCount(b) - overlapCount(a);
  });

  let unstaffedSlots = 0;

  for (const day of days) {
    const key = dayKey(day);
    const eligible = nurses.filter(
      (n) =>
        n.licenseExpiresAt >= day &&
        !onLeaveThatDay(n.id, day, leaveByNurse),
    );
    const assigned = new Set<string>();
    const todayCount = new Map(placeTemplates.map((t) => [t.id, 0]));

    const takeFrom = (pool: NurseWithUser[], template: ShiftTemplate) => {
      const candidates = pool
        .filter((n) => !assigned.has(n.id))
        .sort(sortByLoad);
      for (const nurse of candidates) {
        if (tryPlace(nurse, template, day)) {
          assigned.add(nurse.id);
          offPlan.get(nurse.id)?.delete(key);
          todayCount.set(template.id, (todayCount.get(template.id) ?? 0) + 1);
          return true;
        }
      }
      return false;
    };

    const fillNurse = (nurse: NurseWithUser) => {
      const ranked = [...placeTemplates].sort(
        (a, b) => (todayCount.get(a.id) ?? 0) - (todayCount.get(b.id) ?? 0),
      );
      for (const template of ranked) {
        if (tryPlace(nurse, template, day)) {
          assigned.add(nurse.id);
          offPlan.get(nurse.id)?.delete(key);
          todayCount.set(template.id, (todayCount.get(template.id) ?? 0) + 1);
          return true;
        }
      }
      return false;
    };

    for (const template of coverOrder) {
      const onDuty = eligible.filter((n) => !offPlan.get(n.id)?.has(key));
      if (takeFrom(onDuty, template)) continue;
      const resting = eligible.filter((n) => offPlan.get(n.id)?.has(key));
      if (takeFrom(resting, template)) continue;
      unstaffedSlots += 1;
    }

    const leftover = eligible
      .filter((n) => !assigned.has(n.id) && !offPlan.get(n.id)?.has(key))
      .sort(sortByLoad);

    for (const nurse of leftover) {
      if (
        assigned.size >= targetOnDuty &&
        (offPlan.get(nurse.id)?.size ?? 0) < rdQuota
      ) {
        offPlan.get(nurse.id)!.add(key);
        continue;
      }
      if (fillNurse(nurse)) continue;
      if ((offPlan.get(nurse.id)?.size ?? 0) < rdQuota) {
        offPlan.get(nurse.id)!.add(key);
      }
      blocked += 1;
    }

    if ([...todayCount.values()].every((count) => count === 0)) {
      unstaffedDays += 1;
    }
  }

  // Batch insert — main speed win vs per-row create + compliance queries
  const CHUNK = 200;
  for (let i = 0; i < pending.length; i += CHUNK) {
    await prisma.shiftAssignment.createMany({
      data: pending.slice(i, i + CHUNK),
    });
  }

  const created = pending.length;
  const rdCounts = nurses.map((n) => offPlan.get(n.id)?.size ?? 0);
  const minRd = Math.min(...rdCounts);
  const maxRd = Math.max(...rdCounts);
  const avgWork =
    [...workDays.values()].reduce((a, b) => a + b, 0) /
    Math.max(1, nurses.length);

  return {
    created,
    skipped: blocked,
    message: `Generated ${created} drafts. RD quota = ${rdQuota}/nurse (${weekendCount} weekends + ${holidayOnlyCount} holidays). ~${targetOnDuty} on duty/day. RD range ${minRd}–${maxRd}, avg work ${avgWork.toFixed(1)}/${workTarget}.${
      unstaffedSlots > 0
        ? ` ${unstaffedSlots} shift slot(s) had no staff.`
        : " All schedule-type shifts staffed."
    }${unstaffedDays > 0 ? ` ${unstaffedDays} day(s) fully unstaffed.` : ""}`,
  };
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

const buildRestDayPlan = (params: {
  nurses: NurseWithUser[];
  days: Date[];
  leaveByNurse: Map<string, { startDate: Date; endDate: Date }[]>;
  rdQuota: number;
  minOnDuty: number;
  targetOnDuty: number;
}) => {
  const { nurses, days, leaveByNurse, rdQuota, minOnDuty, targetOnDuty } =
    params;

  const offPlan = new Map<string, Set<string>>();
  const offCount = new Map<string, number>();
  const lastRdIdx = new Map<string, number>();
  for (const n of nurses) {
    offPlan.set(n.id, new Set());
    offCount.set(n.id, 0);
    lastRdIdx.set(n.id, -999);
  }

  if (rdQuota <= 0 || days.length === 0) return offPlan;

  const available = (day: Date) =>
    nurses.filter(
      (n) =>
        n.licenseExpiresAt >= day &&
        !onLeaveThatDay(n.id, day, leaveByNurse),
    );

  const gapSinceLastRd = (nurseId: string, dayIdx: number) =>
    dayIdx - (lastRdIdx.get(nurseId) ?? -999);

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const key = dayKey(day);
    const pool = available(day);
    const desiredOn = Math.min(
      pool.length,
      Math.max(minOnDuty, Math.min(targetOnDuty, pool.length)),
    );
    const desiredOff = Math.max(0, pool.length - desiredOn);
    if (desiredOff === 0) continue;

    const needing = [...pool]
      .filter((n) => (offCount.get(n.id) ?? 0) < rdQuota)
      .sort((a, b) => {
        const ca = offCount.get(a.id) ?? 0;
        const cb = offCount.get(b.id) ?? 0;
        if (ca !== cb) return ca - cb;
        const ga = gapSinceLastRd(a.id, dayIdx);
        const gb = gapSinceLastRd(b.id, dayIdx);
        if (ga !== gb) return gb - ga;
        const rot =
          ((a.id.charCodeAt(0) + dayIdx) % nurses.length) -
          ((b.id.charCodeAt(0) + dayIdx) % nurses.length);
        return rot || a.user.name.localeCompare(b.user.name);
      });

    for (const nurse of needing.slice(0, desiredOff)) {
      offPlan.get(nurse.id)!.add(key);
      offCount.set(nurse.id, (offCount.get(nurse.id) ?? 0) + 1);
      lastRdIdx.set(nurse.id, dayIdx);
    }
  }

  const onDutyEstimate = (day: Date) => {
    const key = dayKey(day);
    return available(day).filter((n) => !offPlan.get(n.id)?.has(key)).length;
  };

  for (const nurse of nurses) {
    while ((offCount.get(nurse.id) ?? 0) < rdQuota) {
      const candidates = days
        .map((day, idx) => ({ day, idx, key: dayKey(day) }))
        .filter(({ day, key }) => {
          if (offPlan.get(nurse.id)?.has(key)) return false;
          if (nurse.licenseExpiresAt < day) return false;
          if (onLeaveThatDay(nurse.id, day, leaveByNurse)) return false;
          return onDutyEstimate(day) > minOnDuty;
        })
        .sort((a, b) => {
          const staff = onDutyEstimate(b.day) - onDutyEstimate(a.day);
          if (staff !== 0) return staff;
          const dist = (idx: number) => {
            const keys = [...(offPlan.get(nurse.id) ?? [])];
            if (keys.length === 0) return 999;
            return Math.min(
              ...keys.map((k) => {
                const other = days.findIndex((d) => dayKey(d) === k);
                return other < 0 ? 999 : Math.abs(other - idx);
              }),
            );
          };
          return dist(b.idx) - dist(a.idx) || a.idx - b.idx;
        });

      if (candidates.length === 0) break;

      const pick = candidates[0];
      offPlan.get(nurse.id)!.add(pick.key);
      offCount.set(nurse.id, (offCount.get(nurse.id) ?? 0) + 1);
      lastRdIdx.set(nurse.id, pick.idx);
    }
  }

  return offPlan;
};
