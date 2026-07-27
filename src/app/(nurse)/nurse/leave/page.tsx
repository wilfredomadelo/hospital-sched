import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { submitLeaveRequest } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NurseLeavePage() {
  const session = await requireRole(["NURSE"]);
  const profile = await prisma.nurseProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) {
    return <p className="text-sm text-rose-600">Nurse profile not found.</p>;
  }

  const leaves = await prisma.leaveRequest.findMany({
    where: { nurseId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  const statusClass = (status: string) => {
    if (status === "PENDING") return "bg-amber-50 text-amber-800";
    if (status === "APPROVED") return "bg-teal-50 text-teal-800";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Leave</h2>
        <p className="text-sm text-slate-600">
          Submit vacation or other leave for supervisor approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitLeaveRequest} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                required
                aria-label="Leave start date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                required
                aria-label="Leave end date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="VACATION" required>
                <option value="VACATION">Vacation</option>
                <option value="SICK">Sick</option>
                <option value="PERSONAL">Personal</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" aria-label="Leave reason" />
            </div>
            <div>
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {leaves.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {leaves.map((leave) => (
                <li
                  key={leave.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {leave.type} · {format(leave.startDate, "MMM d")} –{" "}
                      {format(leave.endDate, "MMM d, yyyy")}
                    </p>
                    {leave.reason ? (
                      <p className="text-sm text-slate-500">{leave.reason}</p>
                    ) : null}
                  </div>
                  <Badge className={statusClass(leave.status)}>
                    {leave.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
