import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminOverviewPage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);

  const [nurses, units, pendingLeave, openAlerts, upcoming] = await Promise.all([
    prisma.nurseProfile.count(),
    prisma.unit.count(),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.complianceAlert.count({ where: { resolvedAt: null } }),
    prisma.shiftAssignment.findMany({
      where: {
        status: "PUBLISHED",
        startAt: { gte: new Date() },
      },
      include: {
        nurse: { include: { user: true } },
        unit: true,
        template: true,
      },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
  ]);

  const stats = [
    { label: "Nurses", value: nurses, href: "/admin/staff" },
    { label: "Units", value: units, href: "/admin/units" },
    { label: "Pending leave", value: pendingLeave, href: "/admin/leave" },
    { label: "Open alerts", value: openAlerts, href: "/admin/compliance" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Overview</h2>
        <p className="text-sm text-slate-600">
          Staffing snapshot and upcoming published shifts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block">
            <Card className="transition hover:border-teal-300">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-500">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-slate-900">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming published shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming published shifts.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((shift) => (
                <li
                  key={shift.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{shift.nurse.user.name}</p>
                    <p className="text-slate-500">
                      {shift.unit.name} · {shift.template.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-teal-50 text-teal-800">
                      {format(shift.startAt, "EEE MMM d · HH:mm")}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
