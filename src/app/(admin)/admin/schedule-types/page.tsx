import { requireRole } from "@/lib/session";
import { ScheduleTypesManager } from "@/components/schedule-types-manager";
import { listScheduleTypes } from "@/lib/schedule-types-db";

export default async function ScheduleTypesPage() {
  await requireRole(["ADMIN", "SUPERVISOR"]);
  const types = await listScheduleTypes();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">Schedule types</h2>
        <p className="text-sm text-slate-600">
          Add, edit, or delete types. Each type is a set of duty codes from the
          roster legend. Select a type before generating a schedule.
        </p>
      </div>
      <ScheduleTypesManager types={types} />
    </div>
  );
}
