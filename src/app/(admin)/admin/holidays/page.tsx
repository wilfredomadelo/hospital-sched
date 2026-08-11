import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createHoliday, deleteHoliday } from "@/app/actions/holidays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HolidayYearControls } from "@/components/holiday-year-controls";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireRole(["ADMIN", "SUPERVISOR"]);
  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">Holidays</h2>
          <p className="text-sm text-slate-600">
            Set public holidays for {year}. Auto-roster counts these (plus
            weekends) as each nurse&apos;s off-duty quota while still staffing
            every day.
          </p>
        </div>
        <HolidayYearControls year={year} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add holiday</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createHoliday} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  min={`${year}-01-01`}
                  max={`${year}-12-31`}
                  aria-label="Holiday date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g. Independence Day"
                  aria-label="Holiday name"
                />
              </div>
              <Button type="submit">Save holiday</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {year} holidays ({holidays.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-500">
                No holidays set for this year yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {holidays.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-sm text-slate-500">
                        {format(h.date, "EEEE, MMM d, yyyy")}
                      </p>
                    </div>
                    <form action={deleteHoliday}>
                      <input type="hidden" name="id" value={h.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
