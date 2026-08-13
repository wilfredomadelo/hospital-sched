import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function NurseHomePage() {
  const session = await requireRole(["NURSE"]);
  const profile = await prisma.nurseProfile.findUnique({
    where: { userId: session.user.id },
    include: { unit: true },
  });

  if (!profile) {
    return <p className="text-sm text-rose-600 dark:text-rose-400">Nurse profile not found.</p>;
  }

  const [shifts, unread] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: {
        nurseId: profile.id,
        status: "PUBLISHED",
        startAt: { gte: new Date() },
      },
      include: { unit: true, template: true },
      orderBy: { startAt: "asc" },
      take: 14,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">My schedule</h2>
          <p className="text-sm text-slate-600">
            {profile.unit?.name ?? "Unassigned unit"} · License{" "}
            {profile.licenseNumber}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nurse/leave">
            <Button>Request leave</Button>
          </Link>
          <Link href="/nurse/notifications">
            <Button variant="outline">
              Notifications{unread > 0 ? ` (${unread})` : ""}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming published shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No upcoming published shifts yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shifts.map((shift) => (
                <li
                  key={shift.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {format(shift.startAt, "EEEE, MMM d")}
                    </p>
                    <p className="text-sm text-slate-500">
                      {shift.unit.name} · {shift.template.name} ·{" "}
                      {format(shift.startAt, "HH:mm")}–{format(shift.endAt, "HH:mm")}
                    </p>
                  </div>
                  {shift.template.isNight ? (
                    <Badge className="bg-indigo-50 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200">
                      {shift.template.name} overnight
                    </Badge>
                  ) : (
                    <Badge className="bg-teal-50 text-teal-800 dark:bg-teal-900/70 dark:text-teal-200">
                      {shift.template.name}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
