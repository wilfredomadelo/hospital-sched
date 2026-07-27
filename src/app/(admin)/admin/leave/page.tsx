import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { decideLeaveRequest } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminLeavePage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);

  const leaves = await prisma.leaveRequest.findMany({
    include: { nurse: { include: { user: true } } },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
  });

  const statusClass = (status: string) => {
    if (status === "PENDING") return "bg-amber-50 text-amber-800";
    if (status === "APPROVED") return "bg-teal-50 text-teal-800";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Leave requests</h2>
        <p className="text-sm text-slate-600">
          Approve or deny nurse leave. Approved leave blocks new assignments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All requests</CardTitle>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {leaves.map((leave) => (
                <li
                  key={leave.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-medium">{leave.nurse.user.name}</p>
                    <p className="text-sm text-slate-500">
                      {leave.type} · {format(leave.startDate, "MMM d")} –{" "}
                      {format(leave.endDate, "MMM d, yyyy")}
                    </p>
                    {leave.reason ? (
                      <p className="text-sm text-slate-600">{leave.reason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(leave.status)}>
                      {leave.status}
                    </Badge>
                    {leave.status === "PENDING" ? (
                      <>
                        <form action={decideLeaveRequest}>
                          <input type="hidden" name="id" value={leave.id} />
                          <input type="hidden" name="decision" value="APPROVED" />
                          <Button type="submit" size="sm">
                            Approve
                          </Button>
                        </form>
                        <form action={decideLeaveRequest}>
                          <input type="hidden" name="id" value={leave.id} />
                          <input type="hidden" name="decision" value="DENIED" />
                          <Button type="submit" size="sm" variant="outline">
                            Deny
                          </Button>
                        </form>
                      </>
                    ) : null}
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
