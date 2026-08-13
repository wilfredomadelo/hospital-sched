"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  assignShift,
  bulkClearAssignments,
  copyPreviousPeriod,
  deleteCancelledShifts,
  publishPeriod,
  runAutoRoster,
  type AssignResult,
} from "@/app/actions/shifts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RosterControls } from "@/components/roster-controls";
import { RosterLegend } from "@/components/roster-legend";
import {
  ScheduleTypesManager,
  type ScheduleTypeItem,
} from "@/components/schedule-types-manager";
import {
  formatDutyLabel,
  statusByCode,
  styleForCode,
} from "@/lib/scheduling/duty-codes";
import type { RosterViewMode } from "@/lib/scheduling/period";
import { cn } from "@/lib/utils";

export type RosterNurse = {
  id: string;
  name: string;
  employeeId: string;
  unitName: string | null;
};

export type RosterAssignment = {
  id: string;
  nurseId: string;
  dateKey: string;
  templateId: string;
  templateName: string;
  isNight: boolean;
  status: string;
  startLabel: string;
  endLabel: string;
};

export type RosterTemplate = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isNight: boolean;
};

type Props = {
  unitId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  prevHref: string;
  nextHref: string;
  days: string[];
  nurses: RosterNurse[];
  assignments: RosterAssignment[];
  leaveCodes: Record<string, string>;
  holidayKeys: string[];
  holidayNames: Record<string, string>;
  templates: RosterTemplate[];
  view: RosterViewMode;
  units: { id: string; name: string }[];
  scheduleTypes: ScheduleTypeItem[];
};

export const RosterGrid = ({
  unitId,
  periodStart,
  periodEnd,
  periodLabel,
  prevHref,
  nextHref,
  days,
  nurses,
  assignments,
  leaveCodes,
  holidayKeys,
  holidayNames,
  templates,
  view,
  units,
  scheduleTypes,
}: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nameFilter, setNameFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{
    nurseId: string;
    dateKey: string;
  } | null>(null);
  const [selectedNurses, setSelectedNurses] = useState<Set<string>>(new Set());
  const [scheduleTypeId, setScheduleTypeId] = useState(
    scheduleTypes[0]?.id ?? "",
  );
  const [typesOpen, setTypesOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "clear" | "deleteCancelled" | null
  >(null);

  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, RosterAssignment>();
    for (const a of assignments) {
      map.set(`${a.nurseId}|${a.dateKey}`, a);
    }
    return map;
  }, [assignments]);

  const filteredNurses = useMemo(() => {
    if (!nameFilter) return nurses;
    const q = nameFilter.toLowerCase();
    return nurses.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.employeeId.toLowerCase().includes(q),
    );
  }, [nurses, nameFilter]);

  const draftCount = useMemo(
    () => assignments.filter((a) => a.status === "DRAFT").length,
    [assignments],
  );
  const publishedCount = assignments.length - draftCount;

  const allFilteredSelected =
    filteredNurses.length > 0 &&
    filteredNurses.every((n) => selectedNurses.has(n.id));

  useEffect(() => {
    if (
      scheduleTypeId &&
      scheduleTypes.some((t) => t.id === scheduleTypeId)
    ) {
      return;
    }
    setScheduleTypeId(scheduleTypes[0]?.id ?? "");
  }, [scheduleTypes, scheduleTypeId]);

  const handleToggleNurse = (id: string) => {
    setSelectedNurses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAllStaff = () => {
    setSelectedNurses((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const n of filteredNurses) next.delete(n.id);
      } else {
        for (const n of filteredNurses) next.add(n.id);
      }
      return next;
    });
  };

  const applyResult = (result: AssignResult) => {
    if (result.error) {
      setError(result.error);
      setMessage(null);
      return;
    }
    setError(null);
    setMessage(
      result.warnings?.length
        ? result.warnings.join(" ")
        : "Schedule updated.",
    );
    router.refresh();
  };

  const handleCellClick = (nurseId: string, dateKey: string) => {
    if (leaveCodes[`${nurseId}|${dateKey}`]) return;
    setActiveCell({ nurseId, dateKey });
  };

  const handleAssignToCell = (templateId: string) => {
    if (!activeCell) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("nurseId", activeCell.nurseId);
      fd.set("unitId", unitId);
      fd.set("templateId", templateId);
      fd.set("date", activeCell.dateKey);
      const existing = assignmentMap.get(
        `${activeCell.nurseId}|${activeCell.dateKey}`,
      );
      if (existing) fd.set("replaceAssignmentId", existing.id);
      applyResult(await assignShift(fd));
      setActiveCell(null);
    });
  };

  const handleClearCell = () => {
    if (!activeCell) return;
    const existing = assignmentMap.get(
      `${activeCell.nurseId}|${activeCell.dateKey}`,
    );
    if (!existing) {
      setActiveCell(null);
      return;
    }
    startTransition(async () => {
      await bulkClearAssignments({ assignmentIds: [existing.id] });
      setMessage("Cleared — cell is Rest Day (RD).");
      setActiveCell(null);
      router.refresh();
    });
  };

  const handleClearAll = () => {
    if (assignments.length === 0) {
      setError("No assignments to clear.");
      return;
    }
    setConfirmAction("clear");
  };

  const handleDeleteCancelled = () => {
    setConfirmAction("deleteCancelled");
  };

  const handleClearAssignments = (scope: "all" | "selected") => {
    const ids =
      scope === "selected"
        ? assignments
            .filter((a) => selectedNurses.has(a.nurseId))
            .map((a) => a.id)
        : assignments.map((a) => a.id);
    if (ids.length === 0) {
      setError(
        scope === "selected"
          ? "No selected staff have shifts to clear."
          : "No assignments to clear.",
      );
      setConfirmAction(null);
      return;
    }
    startTransition(async () => {
      await bulkClearAssignments({ assignmentIds: ids });
      setConfirmAction(null);
      setError(null);
      setMessage(
        scope === "selected"
          ? `Cleared ${ids.length} assignments for selected staff.`
          : `Cleared ${ids.length} assignments.`,
      );
      router.refresh();
    });
  };

  const handleConfirmDeleteCancelled = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("unitId", unitId);
      applyResult(await deleteCancelledShifts(fd));
      setConfirmAction(null);
    });
  };

  const cellMeta = (
    nurseId: string,
    d: string,
  ): { code: string; title: string; assignment?: RosterAssignment; locked: boolean } => {
    const leaveCode = leaveCodes[`${nurseId}|${d}`];
    if (leaveCode) {
      const status = statusByCode[leaveCode];
      return {
        code: leaveCode,
        title: status?.description ?? leaveCode,
        locked: true,
      };
    }
    const a = assignmentMap.get(`${nurseId}|${d}`);
    if (a) {
      const holidayNote = holidaySet.has(d)
        ? ` · ${holidayNames[d] || "Holiday"}`
        : "";
      return {
        code: a.templateName,
        title: `${formatDutyLabel(a.templateName)} · ${a.startLabel}–${a.endLabel} (${a.status})${holidayNote}`,
        assignment: a,
        locked: false,
      };
    }
    if (holidaySet.has(d)) {
      return {
        code: "RD",
        title: `${holidayNames[d] || "Public holiday"} · Rest Day (RD)`,
        locked: false,
      };
    }
    return { code: "RD", title: "Rest Day (RD)", locked: false };
  };

  const exportCsv = () => {
    const header = ["Nurse", "Employee ID", "Unit", ...days];
    const rows = filteredNurses.map((n) => {
      const cells = days.map((d) => cellMeta(n.id, d).code);
      return [n.name, n.employeeId, n.unitName ?? "", ...cells];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${unitId}-${periodStart}-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const templateLabel = (t: RosterTemplate) => formatDutyLabel(t.name);

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-teal-700 dark:text-teal-400" role="status">
          {message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-2 py-1.5">
          <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-slate-300">
            <Link
              href={prevHref}
              className="inline-flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              tabIndex={0}
              aria-label="Previous period"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <span className="min-w-[7.5rem] border-x border-slate-300 px-2 text-center text-xs font-medium text-slate-800">
              {periodLabel}
            </span>
            <Link
              href={nextHref}
              className="inline-flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              tabIndex={0}
              aria-label="Next period"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <RosterControls
            units={units}
            unitId={unitId}
            view={view}
            start={periodStart}
          />

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              id="name-filter"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Search"
              aria-label="Filter by nurse name or employee ID"
              className="h-8 w-40 pl-7 text-xs"
            />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1">
            {draftCount > 0 ? (
              <span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                {draftCount} draft{draftCount === 1 ? "" : "s"}
              </span>
            ) : publishedCount > 0 ? (
              <span className="inline-flex h-6 items-center rounded-full bg-teal-100 px-2 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-100">
                Published
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("unitId", unitId);
                  fd.set("periodStart", periodStart);
                  fd.set("periodEnd", periodEnd);
                  applyResult(await copyPreviousPeriod(fd));
                });
              }}
            >
              Copy
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={exportCsv}
            >
              Export
            </Button>
            <RosterLegend />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={handleClearAll}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
              aria-label="Clear all assignments in this period"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={handleDeleteCancelled}
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
              aria-label="Permanently delete cancelled shifts for this unit in the current period"
              title="Permanently delete cancelled shifts for this unit in the current period"
            >
              Delete cancelled
            </Button>
            <Select
              id="schedule-type"
              value={scheduleTypeId}
              onChange={(e) => setScheduleTypeId(e.target.value)}
              aria-label="Select schedule type"
              className="h-8 w-40 text-xs"
            >
              <option value="">
                {scheduleTypes.length === 0 ? "Add a type first" : "Schedule type"}
              </option>
              {scheduleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTypesOpen(true)}
              aria-label="Add, edit, or delete schedule types"
            >
              Types
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!scheduleTypeId) {
                  setError("Select a schedule type before generating.");
                  return;
                }
                if (selectedNurses.size === 0) {
                  setError("Select at least one staff member.");
                  return;
                }
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("unitId", unitId);
                  fd.set("periodStart", periodStart);
                  fd.set("periodEnd", periodEnd);
                  fd.set("scheduleTypeId", scheduleTypeId);
                  fd.set("nurseIds", JSON.stringify([...selectedNurses]));
                  applyResult(await runAutoRoster(fd));
                });
              }}
              title="Select a schedule type and staff, then generate. Rest Days = weekends + holidays in this period."
              aria-label="Auto-generate schedule for selected staff and schedule type"
            >
              Generate
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draftCount > 0 ? "default" : "outline"}
              disabled={pending || draftCount === 0}
              onClick={() => {
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("unitId", unitId);
                  fd.set("periodStart", periodStart);
                  fd.set("periodEnd", periodEnd);
                  applyResult(await publishPeriod(fd));
                });
              }}
              aria-label={
                draftCount > 0
                  ? `Publish ${draftCount} draft shifts`
                  : "Nothing to publish"
              }
            >
              {draftCount > 0 ? `Publish (${draftCount})` : "Publish"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 w-40 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">
                <div className="flex items-center justify-between gap-1">
                  <span>Nurse</span>
                  <button
                    type="button"
                    onClick={handleToggleAllStaff}
                    className="rounded px-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-teal-400 dark:hover:bg-teal-900/40"
                    aria-label={
                      allFilteredSelected
                        ? "Unselect all staff"
                        : "Select all staff"
                    }
                  >
                    {allFilteredSelected ? "None" : "All"}
                  </button>
                </div>
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "border-b border-slate-200 px-0 py-1 text-center font-medium leading-tight",
                    holidaySet.has(d) && "bg-slate-100",
                  )}
                >
                  <div className="text-[10px] uppercase text-slate-500">
                    {format(new Date(d + "T12:00:00"), "EEEEE")}
                  </div>
                  <div className="text-[11px]">
                    {format(new Date(d + "T12:00:00"), "d")}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredNurses.map((nurse) => (
              <tr
                key={nurse.id}
                className={cn(
                  "hover:bg-slate-50/80",
                  selectedNurses.has(nurse.id) && "bg-teal-50/60 dark:bg-teal-950/20",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 w-40 overflow-hidden border-b border-r border-slate-200 px-2 py-0.5",
                    selectedNurses.has(nurse.id)
                      ? "bg-teal-50 dark:bg-teal-950/40"
                      : "bg-white",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-1.5">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={selectedNurses.has(nurse.id)}
                      onChange={() => handleToggleNurse(nurse.id)}
                      aria-label={`Select ${nurse.name}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium leading-tight">
                        {nurse.name}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {nurse.employeeId}
                        {nurse.unitName ? ` · ${nurse.unitName}` : ""}
                      </span>
                    </span>
                  </label>
                </td>
                {days.map((d) => {
                  const meta = cellMeta(nurse.id, d);
                  const colors = styleForCode(meta.code);
                  const isActive =
                    activeCell?.nurseId === nurse.id &&
                    activeCell?.dateKey === d;
                  const isDraft = meta.assignment?.status === "DRAFT";
                  const isPublished = meta.assignment?.status === "PUBLISHED";
                  return (
                    <td key={d} className="border-b border-slate-100 p-px">
                      <button
                        type="button"
                        title={meta.title}
                        disabled={meta.locked || pending}
                        onClick={() => handleCellClick(nurse.id, d)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCellClick(nurse.id, d);
                          }
                        }}
                        aria-label={`${nurse.name} on ${d}: ${meta.title}`}
                        tabIndex={0}
                        className={cn(
                          "relative flex h-7 w-full items-center justify-center rounded-sm border text-[10px] font-bold leading-none transition",
                          colors.bg,
                          colors.text,
                          colors.border,
                          isActive && "ring-2 ring-teal-600",
                          !meta.locked && "hover:brightness-95",
                          meta.locked && "cursor-default opacity-90",
                          isDraft && "border-dashed border-amber-500 shadow-[inset_0_2px_0_0_#f59e0b]",
                          isPublished && "shadow-[inset_0_2px_0_0_#0d9488]",
                        )}
                      >
                        <span>{meta.code}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredNurses.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No nurses match filters.</p>
        ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === "clear"}
        title="Clear assignments?"
        description="Clear selected marks shifts for checked staff as cancelled. Clear all marks every visible shift in this period as cancelled. Cells become Rest Day (RD). Rows stay in the database until you delete cancelled shifts."
        pending={pending}
        onCancel={() => setConfirmAction(null)}
        actions={[
          {
            label: "Clear selected",
            variant: "outline",
            disabled: selectedNurses.size === 0,
            onClick: () => handleClearAssignments("selected"),
          },
          {
            label: "Clear all",
            variant: "danger",
            onClick: () => handleClearAssignments("all"),
          },
        ]}
      />
      <ConfirmDialog
        open={confirmAction === "deleteCancelled"}
        title="Delete cancelled shifts?"
        description="This permanently removes every cancelled shift for this unit from the database, including other months. This cannot be undone."
        confirmLabel="Delete cancelled"
        pending={pending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirmDeleteCancelled}
      />

      {typesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Manage schedule types"
          onClick={() => setTypesOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTypesOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold">Schedule types</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTypesOpen(false)}
                aria-label="Close schedule types"
              >
                Close
              </Button>
            </div>
            <ScheduleTypesManager types={scheduleTypes} />
          </div>
        </div>
      ) : null}

      {activeCell ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Assign duty code"
          onClick={() => setActiveCell(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setActiveCell(null);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold">Assign code</h3>
            <p className="mt-1 text-sm text-slate-600">
              {nurses.find((n) => n.id === activeCell.nurseId)?.name} ·{" "}
              {activeCell.dateKey}
            </p>
            <div className="mt-4 grid max-h-[50vh] gap-1.5 overflow-y-auto">
              {templates.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant="outline"
                  className="justify-start text-left"
                  disabled={pending}
                  onClick={() => handleAssignToCell(t.id)}
                >
                  {templateLabel(t)}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={handleClearCell}
              >
                Clear / Rest Day (RD)
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveCell(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
