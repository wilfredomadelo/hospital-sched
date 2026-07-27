import { differenceInMinutes, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePeriod } from "@/lib/scheduling/period";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ unitId?: string }>;
}) {
  await requireRole(["ADMIN", "SUPERVISOR"]);
  const params = await searchParams;
  const period = resolvePeriod({ view: "month" });
  const units = await prisma.unit.findMany({ orderBy: { name: "asc" } });
  const unitId = params.unitId || units[0]?.id;

  const assignments = unitId
    ? await prisma.shiftAssignment.findMany({
        where: {
          unitId,
          status: { in: ["DRAFT", "PUBLISHED"] },
          startAt: { gte: period.start, lt: period.end },
        },
        include: { template: true, nurse: { include: { user: true } } },
      })
    : [];

  const leaves = unitId
    ? await prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: period.end },
          endDate: { gte: period.start },
          nurse: { unitId },
        },
      })
    : [];

  const nurses = unitId
    ? await prisma.nurseProfile.count({ where: { unitId } })
    : 0;

  const totalHours = assignments.reduce(
    (sum, a) => sum + differenceInMinutes(a.endAt, a.startAt) / 60,
    0,
  );

  const byTemplate = new Map<string, number>();
  for (const a of assignments) {
    byTemplate.set(
      a.template.name,
      (byTemplate.get(a.template.name) ?? 0) + 1,
    );
  }

  const hoursByNurse = new Map<string, { name: string; hours: number }>();
  for (const a of assignments) {
    const cur = hoursByNurse.get(a.nurseId) ?? {
      name: a.nurse.user.name,
      hours: 0,
    };
    cur.hours += differenceInMinutes(a.endAt, a.startAt) / 60;
    hoursByNurse.set(a.nurseId, cur);
  }

  const overtime = [...hoursByNurse.values()].filter((n) => n.hours > 160);

  const coverageByDay = new Map<string, number>();
  for (const a of assignments) {
    const key = format(a.startAt, "yyyy-MM-dd");
    coverageByDay.set(key, (coverageByDay.get(key) ?? 0) + 1);
  }
  const avgCoverage =
    coverageByDay.size === 0
      ? 0
      : [...coverageByDay.values()].reduce((a, b) => a + b, 0) /
        coverageByDay.size;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Workforce analytics</h2>
        <p className="text-sm text-slate-600">
          {period.label}
          {unitId
            ? ` · ${units.find((u) => u.id === unitId)?.name ?? "Unit"}`
            : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Nurses", value: nurses },
          { label: "Total hours", value: totalHours.toFixed(0) },
          { label: "Assignments", value: assignments.length },
          { label: "Approved leave", value: leaves.length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-500">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shift distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[...byTemplate.entries()].map(([name, count]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
              {byTemplate.size === 0 ? (
                <li className="text-slate-500">No assignments this month.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverage & overtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Avg staffing per day:{" "}
              <span className="font-semibold">{avgCoverage.toFixed(1)}</span>
            </p>
            <p>
              Nurses over ~160h this month:{" "}
              <span className="font-semibold">{overtime.length}</span>
            </p>
            {overtime.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {overtime.map((n) => (
                  <li key={n.name} className="flex justify-between py-2">
                    <span>{n.name}</span>
                    <span>{n.hours.toFixed(1)}h</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">No overtime flags.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hours by nurse</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-slate-100 text-sm">
            {[...hoursByNurse.values()]
              .sort((a, b) => b.hours - a.hours)
              .map((n) => (
                <li key={n.name} className="flex justify-between py-2">
                  <span>{n.name}</span>
                  <span className="font-medium">{n.hours.toFixed(1)}h</span>
                </li>
              ))}
            {hoursByNurse.size === 0 ? (
              <li className="py-2 text-slate-500">No data.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
