"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  assignShift,
  bulkClearAssignments,
  copyPreviousPeriod,
  runAutoRoster,
  type AssignResult,
} from "@/app/actions/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RosterLegend } from "@/components/roster-legend";
import {
  formatDutyLabel,
  statusByCode,
  styleForCode,
} from "@/lib/scheduling/duty-codes";
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
  days: string[];
  nurses: RosterNurse[];
  assignments: RosterAssignment[];
  leaveCodes: Record<string, string>;
  holidayKeys: string[];
  holidayNames: Record<string, string>;
  templates: RosterTemplate[];
  view: string;
};

export const RosterGrid = ({
  unitId,
  periodStart,
  periodEnd,
  days,
  nurses,
  assignments,
  leaveCodes,
  holidayKeys,
  holidayNames,
  templates,
  view,
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
    const ids = assignments.map((a) => a.id);
    if (ids.length === 0) {
      setError("No assignments to clear.");
      return;
    }
    startTransition(async () => {
      await bulkClearAssignments({ assignmentIds: ids });
      setError(null);
      setMessage(`Cleared ${ids.length} assignments.`);
      router.refresh();
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Codes: duty (7, 7A, 3…) · Rest Day (RD) · leave (VL, SL…). Auto-generate:
          RD per nurse = Saturdays + Sundays + holidays in this period; staffing
          spread evenly across days.
        </p>
        <RosterLegend />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="space-y-1">
          <Label htmlFor="name-filter">Search nurse / ID</Label>
          <Input
            id="name-filter"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Name or license #"
            aria-label="Filter by nurse name or employee ID"
          />
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set("unitId", unitId);
              fd.set("periodStart", periodStart);
              fd.set("periodEnd", periodEnd);
              applyResult(await runAutoRoster(fd));
            });
          }}
          title="Each nurse gets Rest Days (RD) equal to Saturdays + Sundays + holidays in this period. Work and RD days are spread evenly."
          aria-label="Auto-generate schedule with Rest Day quota from weekends and holidays"
        >
          Auto-generate
        </Button>
        <Button
          type="button"
          variant="secondary"
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
          Copy previous period
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={handleClearAll}
          aria-label="Clear all assignments in this period"
        >
          Clear all
        </Button>
      </div>

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

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 w-32 border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold">
                Nurse
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
              <tr key={nurse.id} className="hover:bg-slate-50/80">
                <td className="sticky left-0 z-10 w-32 overflow-hidden border-b border-r border-slate-200 bg-white px-2 py-0.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium leading-tight">
                      {nurse.name}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {nurse.employeeId}
                      {nurse.unitName ? ` · ${nurse.unitName}` : ""}
                    </span>
                  </span>
                </td>
                {days.map((d) => {
                  const meta = cellMeta(nurse.id, d);
                  const colors = styleForCode(meta.code);
                  const isActive =
                    activeCell?.nurseId === nurse.id &&
                    activeCell?.dateKey === d;
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
                          "flex h-7 w-full items-center justify-center rounded-sm border text-[10px] font-bold leading-none transition",
                          colors.bg,
                          colors.text,
                          colors.border,
                          isActive && "ring-2 ring-teal-600",
                          !meta.locked && "hover:brightness-95",
                          meta.locked && "cursor-default opacity-90",
                          meta.assignment?.status === "DRAFT" && "opacity-80",
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
