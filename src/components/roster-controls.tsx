"use client";

import { useRouter } from "next/navigation";
import { format, parseISO, startOfWeek } from "date-fns";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RosterViewMode } from "@/lib/scheduling/period";

const toMonday = (isoDate: string) =>
  format(startOfWeek(parseISO(isoDate), { weekStartsOn: 1 }), "yyyy-MM-dd");

const selectClass =
  "h-8 w-auto min-w-[6.5rem] border-slate-300 bg-white px-2 text-xs";

export const RosterControls = ({
  units,
  unitId,
  view,
  start,
}: {
  units: { id: string; name: string }[];
  unitId?: string;
  view: RosterViewMode;
  start: string;
}) => {
  const router = useRouter();

  const push = (next: { unitId?: string; view?: string; start?: string }) => {
    const u = next.unitId ?? unitId ?? "";
    const v = (next.view ?? view) as RosterViewMode;
    let s = next.start ?? start;
    if (v === "week" || v === "15day") {
      s = toMonday(s);
    }
    router.push(`/admin/roster?unitId=${u}&view=${v}&start=${s}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor="roster-unit" className="sr-only">
        Unit
      </Label>
      <Select
        id="roster-unit"
        value={unitId}
        onChange={(e) => push({ unitId: e.target.value })}
        aria-label="Select unit"
        className={selectClass}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Label htmlFor="roster-view" className="sr-only">
        Schedule view
      </Label>
      <Select
        id="roster-view"
        value={view}
        onChange={(e) => push({ view: e.target.value, start })}
        aria-label="Select schedule view"
        className={selectClass}
      >
        <option value="week">Weekly</option>
        <option value="15day">15-Day</option>
        <option value="month">Monthly</option>
      </Select>
    </div>
  );
};
