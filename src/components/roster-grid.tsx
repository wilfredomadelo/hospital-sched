"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  assignShift,
  bulkAssignShifts,
  bulkClearAssignments,
  copyPreviousPeriod,
  runAutoRoster,
  type AssignResult,
} from "@/app/actions/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { RosterLegend } from "@/components/roster-legend";
import {
  DUTY_CODES,
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
  const [selectedNurses, setSelectedNurses] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [bulkTemplateId, setBulkTemplateId] = useState(templates[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{
    nurseId: string;
    dateKey: string;
  } | null>(null);
  const [fillMode, setFillMode] = useState(false);
  const [fillTemplateId, setFillTemplateId] = useState(templates[0]?.id ?? "");

  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, RosterAssignment>();
    for (const a of assignments) {
      map.set(`${a.nurseId}|${a.dateKey}`, a);
    }
    return map;
  }, [assignments]);

  const filteredNurses = useMemo(() => {
    return nurses.filter((n) => {
      if (
        nameFilter &&
        !n.name.toLowerCase().includes(nameFilter.toLowerCase()) &&
        !n.employeeId.toLowerCase().includes(nameFilter.toLowerCase())
      ) {
        return false;
      }
      if (shiftFilter === "all") return true;
      return days.some((d) => {
        const leave = leaveCodes[`${n.id}|${d}`];
        if (shiftFilter === "RD") {
          return !leave && !assignmentMap.get(`${n.id}|${d}`);
        }
        if (leave) return leave === shiftFilter;
        const a = assignmentMap.get(`${n.id}|${d}`);
        return a?.templateName === shiftFilter;
      });
    });
  }, [nurses, nameFilter, shiftFilter, days, assignmentMap, leaveCodes]);

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

    if (fillMode && fillTemplateId) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("nurseId", nurseId);
        fd.set("unitId", unitId);
        fd.set("templateId", fillTemplateId);
        fd.set("date", dateKey);
        const existing = assignmentMap.get(`${nurseId}|${dateKey}`);
        if (existing) fd.set("replaceAssignmentId", existing.id);
        applyResult(await assignShift(fd));
      });
      return;
    }

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
      setMessage("Cleared — cell is RD (Rest Day).");
      setActiveCell(null);
      router.refresh();
    });
  };

  const toggleNurse = (id: string) => {
    setSelectedNurses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedNurses(new Set(filteredNurses.map((n) => n.id)));
  };

  const handleBulkAssign = () => {
    if (selectedNurses.size === 0 || !bulkTemplateId) {
      setError("Select nurses and a duty code.");
      return;
    }
    startTransition(async () => {
      applyResult(
        await bulkAssignShifts({
          nurseIds: [...selectedNurses],
          unitId,
          templateId: bulkTemplateId,
          dates: days,
        }),
      );
    });
  };

  const handleBulkClear = () => {
    const ids = assignments
      .filter((a) => selectedNurses.has(a.nurseId))
      .map((a) => a.id);
    if (ids.length === 0) {
      setError("No assignments for selected nurses.");
      return;
    }
    startTransition(async () => {
      await bulkClearAssignments({ assignmentIds: ids });
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
        title: `${holidayNames[d] || "Public holiday"} · Rest Day`,
        locked: false,
      };
    }
    return { code: "RD", title: "Rest Day", locked: false };
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
          Codes: duty (7, 7A, 3…) · RD rest · leave (VL, SL…)
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
        <div className="space-y-1">
          <Label htmlFor="shift-filter">Code filter</Label>
          <Select
            id="shift-filter"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            aria-label="Filter by duty code"
          >
            <option value="all">All</option>
            <option value="RD">RD</option>
            {DUTY_CODES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code}
              </option>
            ))}
            <option value="VL">VL</option>
            <option value="SL">SL</option>
            <option value="PL">PL</option>
            <option value="LV">LV</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bulk-shift">Bulk code</Label>
          <Select
            id="bulk-shift"
            value={bulkTemplateId}
            onChange={(e) => setBulkTemplateId(e.target.value)}
            aria-label="Bulk duty code"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={selectAllVisible}
          disabled={pending}
        >
          Select all
        </Button>
        <Button type="button" onClick={handleBulkAssign} disabled={pending}>
          Apply to selected
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleBulkClear}
          disabled={pending}
        >
          Clear selected
        </Button>
        <Button
          type="button"
          variant={fillMode ? "default" : "outline"}
          onClick={() => setFillMode((v) => !v)}
          aria-pressed={fillMode}
        >
          {fillMode ? "Fill mode on" : "Fill mode"}
        </Button>
        {fillMode ? (
          <Select
            value={fillTemplateId}
            onChange={(e) => setFillTemplateId(e.target.value)}
            aria-label="Fill duty code"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
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
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-teal-700" role="status">
          {message}
        </p>
      ) : null}

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-20 min-w-[200px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">
                Nurse
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "min-w-[72px] border-b border-slate-200 px-1 py-2 text-center font-medium",
                    holidaySet.has(d) && "bg-slate-100",
                  )}
                >
                  <div>{format(new Date(d + "T12:00:00"), "EEE")}</div>
                  <div className="text-xs font-normal text-slate-500">
                    {format(new Date(d + "T12:00:00"), "MMM d")}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredNurses.map((nurse) => (
              <tr key={nurse.id} className="hover:bg-slate-50/80">
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedNurses.has(nurse.id)}
                      onChange={() => toggleNurse(nurse.id)}
                      aria-label={`Select ${nurse.name}`}
                    />
                    <span>
                      <span className="block font-medium">{nurse.name}</span>
                      <span className="block text-xs text-slate-500">
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
                  return (
                    <td key={d} className="border-b border-slate-100 p-0.5">
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
                          "flex h-10 w-full flex-col items-center justify-center rounded border text-[11px] font-bold transition",
                          colors.bg,
                          colors.text,
                          colors.border,
                          isActive && "ring-2 ring-teal-600",
                          !meta.locked && "hover:brightness-95",
                          meta.locked && "cursor-default opacity-90",
                        )}
                      >
                        <span>{meta.code}</span>
                        {meta.assignment?.status === "DRAFT" ? (
                          <span className="text-[9px] font-normal opacity-70">
                            draft
                          </span>
                        ) : null}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
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
                Clear / RD (Rest Day)
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
