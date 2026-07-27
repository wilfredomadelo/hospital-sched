import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createNurse, updateNurse } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StaffPage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);

  const [nurses, units] = await Promise.all([
    prisma.nurseProfile.findMany({
      include: { user: true, unit: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.unit.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Staff</h2>
        <p className="text-sm text-slate-600">
          Nurse profiles, licenses, skills, and home units.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add nurse</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={createNurse}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required aria-label="Nurse name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                aria-label="Nurse email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Temp password</Label>
              <Input
                id="password"
                name="password"
                type="text"
                defaultValue="password123"
                aria-label="Temporary password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="licenseNumber">License #</Label>
              <Input
                id="licenseNumber"
                name="licenseNumber"
                required
                aria-label="License number"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="licenseExpiresAt">License expires</Label>
              <Input
                id="licenseExpiresAt"
                name="licenseExpiresAt"
                type="date"
                required
                aria-label="License expiration date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="unitId">Unit</Label>
              <Select id="unitId" name="unitId" aria-label="Home unit">
                <option value="">Unassigned</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="maxHoursPerWeek">Max hours / week</Label>
              <Input
                id="maxHoursPerWeek"
                name="maxHoursPerWeek"
                type="number"
                defaultValue={40}
                aria-label="Maximum hours per week"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input id="skills" name="skills" aria-label="Skills" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preferredShifts">Preferred shifts</Label>
              <Input
                id="preferredShifts"
                name="preferredShifts"
                placeholder="Day, Night"
                aria-label="Preferred shifts"
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button type="submit">Create nurse</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {nurses.map((nurse) => {
          const skills = JSON.parse(nurse.skills || "[]") as string[];
          const prefs = JSON.parse(nurse.preferredShifts || "[]") as string[];
          return (
            <Card key={nurse.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{nurse.user.name}</CardTitle>
                  <p className="text-sm text-slate-500">{nurse.user.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {nurse.unit ? (
                    <Badge className="bg-slate-100 text-slate-700">
                      {nurse.unit.name}
                    </Badge>
                  ) : null}
                  <Badge className="bg-amber-50 text-amber-800">
                    Lic. exp {format(nurse.licenseExpiresAt, "MMM d, yyyy")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Skills: {skills.join(", ") || "—"} · Prefers:{" "}
                  {prefs.join(", ") || "—"} · Max {nurse.maxHoursPerWeek}h/week
                </p>
                <form
                  action={updateNurse}
                  className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <input type="hidden" name="userId" value={nurse.userId} />
                  <div className="space-y-1">
                    <Label htmlFor={`name-${nurse.id}`}>Name</Label>
                    <Input
                      id={`name-${nurse.id}`}
                      name="name"
                      defaultValue={nurse.user.name}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`email-${nurse.id}`}>Email</Label>
                    <Input
                      id={`email-${nurse.id}`}
                      name="email"
                      type="email"
                      defaultValue={nurse.user.email}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`lic-${nurse.id}`}>License #</Label>
                    <Input
                      id={`lic-${nurse.id}`}
                      name="licenseNumber"
                      defaultValue={nurse.licenseNumber}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`exp-${nurse.id}`}>Expires</Label>
                    <Input
                      id={`exp-${nurse.id}`}
                      name="licenseExpiresAt"
                      type="date"
                      defaultValue={format(nurse.licenseExpiresAt, "yyyy-MM-dd")}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`unit-${nurse.id}`}>Unit</Label>
                    <Select
                      id={`unit-${nurse.id}`}
                      name="unitId"
                      defaultValue={nurse.unitId ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`hours-${nurse.id}`}>Max hours</Label>
                    <Input
                      id={`hours-${nurse.id}`}
                      name="maxHoursPerWeek"
                      type="number"
                      defaultValue={nurse.maxHoursPerWeek}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`skills-${nurse.id}`}>Skills</Label>
                    <Input
                      id={`skills-${nurse.id}`}
                      name="skills"
                      defaultValue={skills.join(", ")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`prefs-${nurse.id}`}>Preferred</Label>
                    <Input
                      id={`prefs-${nurse.id}`}
                      name="preferredShifts"
                      defaultValue={prefs.join(", ")}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
