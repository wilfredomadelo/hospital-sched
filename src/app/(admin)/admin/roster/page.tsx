import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RosterGrid } from "@/components/roster-grid";
import {
  dateKey,
  resolvePeriod,
  type RosterViewMode,
} from "@/lib/scheduling/period";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    unitId?: string;
    view?: string;
    start?: string;
  }>;
}) {
  await requireRole(["ADMIN", "SUPERVISOR"]);
  const params = await searchParams;

  const view = (["week", "15day", "month"].includes(params.view ?? "")
    ? params.view
    : "month") as RosterViewMode;

  const units = await prisma.unit.findMany({ orderBy: { name: "asc" } });
  const templates = await prisma.shiftTemplate.findMany({
    orderBy: { startTime: "asc" },
  });
  const unitId = params.unitId || units[0]?.id;
  const period = resolvePeriod({ view, start: params.start });
  const dayKeys = period.days.map(dateKey);

  const [assignments, nurses, leaves, holidays] = await Promise.all([
    unitId
      ? prisma.shiftAssignment.findMany({
          where: {
            unitId,
            startAt: { gte: period.start, lt: period.end },
            status: { in: ["DRAFT", "PUBLISHED"] },
          },
          include: {
            nurse: { include: { user: true } },
            template: true,
          },
          orderBy: { startAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.nurseProfile.findMany({
      where: {
        archivedAt: null,
        ...(unitId ? { unitId } : {}),
      },
      include: { user: true, unit: true },
      orderBy: { user: { name: "asc" } },
    }),
    unitId
      ? prisma.leaveRequest.findMany({
          where: {
            status: "APPROVED",
            startDate: { lte: period.end },
            endDate: { gte: period.start },
            nurse: { unitId, archivedAt: null },
          },
        })
      : Promise.resolve([]),
    prisma.publicHoliday.findMany({
      where: { date: { gte: period.start, lt: period.end } },
    }),
  ]);

  const leaveCodes: Record<string, string> = {};
  for (const leave of leaves) {
    for (const day of period.days) {
      if (day >= leave.startDate && day <= leave.endDate) {
        leaveCodes[`${leave.nurseId}|${dateKey(day)}`] = leave.type;
      }
    }
  }

  const holidayKeys = holidays.map((h) => dateKey(h.date));
  const holidayNames = Object.fromEntries(
    holidays.map((h) => [dateKey(h.date), h.name]),
  );

  const startParam = format(period.start, "yyyy-MM-dd");
  const endParam = format(period.end, "yyyy-MM-dd");

  return unitId ? (
    <RosterGrid
      unitId={unitId}
      periodStart={startParam}
      periodEnd={endParam}
      periodLabel={period.label}
      prevHref={`/admin/roster?unitId=${unitId}&view=${view}&start=${period.prevStart}`}
      nextHref={`/admin/roster?unitId=${unitId}&view=${view}&start=${period.nextStart}`}
      days={dayKeys}
      view={view}
      units={units.map((u) => ({ id: u.id, name: u.name }))}
      nurses={nurses.map((n) => ({
        id: n.id,
        name: n.user.name,
        employeeId: n.licenseNumber,
        unitName: n.unit?.name ?? null,
      }))}
      assignments={assignments.map((a) => ({
        id: a.id,
        nurseId: a.nurseId,
        dateKey: dateKey(a.startAt),
        templateId: a.templateId,
        templateName: a.template.name,
        isNight: a.template.isNight,
        status: a.status,
        startLabel: format(a.startAt, "HH:mm"),
        endLabel: format(a.endAt, "HH:mm"),
      }))}
      leaveCodes={leaveCodes}
      holidayKeys={holidayKeys}
      holidayNames={holidayNames}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        startTime: t.startTime,
        endTime: t.endTime,
        isNight: t.isNight,
      }))}
    />
  ) : (
    <p className="text-sm text-slate-500">Create a unit to begin rostering.</p>
  );
}
