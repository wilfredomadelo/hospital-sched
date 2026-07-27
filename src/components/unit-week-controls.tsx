"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const UnitWeekControls = ({
  units,
  unitId,
  week,
}: {
  units: { id: string; name: string }[];
  unitId?: string;
  week: string;
}) => {
  const router = useRouter();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextUnit = event.target.value;
    router.push(`/admin/roster?unitId=${nextUnit}&week=${week}`);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor="unit-switcher">Unit</Label>
      <Select
        id="unit-switcher"
        value={unitId}
        onChange={handleChange}
        aria-label="Select unit"
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </div>
  );
};
