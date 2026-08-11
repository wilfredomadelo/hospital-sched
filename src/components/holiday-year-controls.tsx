"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const HolidayYearControls = ({ year }: { year: number }) => {
  const router = useRouter();
  const years = Array.from({ length: 7 }, (_, i) => year - 2 + i);

  return (
    <div className="space-y-1">
      <Label htmlFor="holiday-year">Year</Label>
      <Select
        id="holiday-year"
        value={String(year)}
        onChange={(e) =>
          router.push(`/admin/holidays?year=${e.target.value}`)
        }
        aria-label="Select year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
};
