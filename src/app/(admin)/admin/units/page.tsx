import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createUnit, deleteUnit } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UnitsPage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);
  const units = await prisma.unit.findMany({
    include: {
      _count: { select: { nurses: { where: { archivedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Units</h2>
        <p className="text-sm text-slate-600">
          Hospital units used for rostering.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add unit</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createUnit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required aria-label="Unit name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  aria-label="Unit description"
                />
              </div>
              <Button type="submit">Create unit</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing units</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {units.map((unit) => (
                <li
                  key={unit.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">{unit.name}</p>
                    <p className="text-sm text-slate-500">
                      {unit.description || "No description"} ·{" "}
                      {unit._count.nurses} nurses
                    </p>
                    <p className="text-xs text-slate-400">
                      Updated {format(unit.updatedAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  <form action={deleteUnit}>
                    <input type="hidden" name="id" value={unit.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
