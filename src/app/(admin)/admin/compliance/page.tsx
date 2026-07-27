import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolveAlert } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CompliancePage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);

  const alerts = await prisma.complianceAlert.findMany({
    where: { resolvedAt: null },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Compliance</h2>
        <p className="text-sm text-slate-600">
          Open alerts from overlap, hours, rest, leave, and license checks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open alerts ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">No open compliance alerts.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div>
                    <div className="mb-1 flex flex-wrap gap-2">
                      <Badge
                        className={
                          alert.severity === "BLOCK"
                            ? "bg-rose-50 text-rose-800"
                            : "bg-amber-50 text-amber-800"
                        }
                      >
                        {alert.severity}
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-700">
                        {alert.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-800">{alert.message}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {format(alert.createdAt, "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                  <form action={resolveAlert}>
                    <input type="hidden" name="id" value={alert.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      Resolve
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
