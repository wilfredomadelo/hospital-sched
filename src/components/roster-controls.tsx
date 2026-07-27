"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RosterViewMode } from "@/lib/scheduling/period";

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
    const v = next.view ?? view;
    const s = next.start ?? start;
    router.push(`/admin/roster?unitId=${u}&view=${v}&start=${s}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="roster-unit">Department / Unit</Label>
        <Select
          id="roster-unit"
          value={unitId}
          onChange={(e) => push({ unitId: e.target.value })}
          aria-label="Select unit"
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="roster-view">Schedule view</Label>
        <Select
          id="roster-view"
          value={view}
          onChange={(e) => push({ view: e.target.value, start })}
          aria-label="Select schedule view"
        >
          <option value="week">Weekly (7 days)</option>
          <option value="15day">15-Day</option>
          <option value="month">Monthly</option>
        </Select>
      </div>
    </div>
  );
};
