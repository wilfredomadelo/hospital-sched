"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createScheduleType,
  deleteScheduleType,
  updateScheduleType,
} from "@/app/actions/schedule-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DUTY_CODES,
  parseDutyCodes,
  styleForCode,
} from "@/lib/scheduling/duty-codes";
import { cn } from "@/lib/utils";

export type ScheduleTypeItem = {
  id: string;
  name: string;
  dutyCodes: string;
};

type Props = {
  types: ScheduleTypeItem[];
};

export const ScheduleTypesManager = ({ types }: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleReset = () => {
    setEditingId(null);
    setName("");
    setSelected(new Set());
    setError(null);
  };

  const handleEdit = (type: ScheduleTypeItem) => {
    setEditingId(type.id);
    setName(type.name);
    setSelected(new Set(parseDutyCodes(type.dutyCodes)));
    setError(null);
    setMessage(null);
  };

  const handleToggleCode = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.set("name", name);
    for (const code of selected) fd.append("dutyCode", code);
    if (editingId) fd.set("id", editingId);

    startTransition(async () => {
      const result = editingId
        ? await updateScheduleType(fd)
        : await createScheduleType(fd);
      if (result.error) {
        setError(result.error);
        setMessage(null);
        return;
      }
      setMessage(editingId ? "Schedule type updated." : "Schedule type added.");
      handleReset();
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const result = await deleteScheduleType(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (editingId === id) handleReset();
      setMessage("Schedule type deleted.");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-display text-lg font-bold">
          {editingId ? "Edit type" : "Add type"}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Pick duty codes from the legend. Generate uses only these codes.
        </p>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="schedule-type-name">Name</Label>
            <Input
              id="schedule-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Day shift, Nights"
              aria-label="Schedule type name"
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">
              Legend codes
            </legend>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {DUTY_CODES.map((d) => {
                const style = styleForCode(d.code);
                const checked = selected.has(d.code);
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => handleToggleCode(d.code)}
                    aria-pressed={checked}
                    aria-label={`${d.code} ${d.description}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
                      checked
                        ? "border-teal-600 bg-teal-50 dark:bg-teal-900/40"
                        : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex min-w-[2.25rem] justify-center rounded border px-1 py-0.5 font-bold",
                        style.bg,
                        style.text,
                        style.border,
                      )}
                    >
                      {d.code}
                    </span>
                    <span className="truncate text-slate-600">{d.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={pending}>
              {editingId ? "Save changes" : "Add type"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={pending}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-display text-lg font-bold">Existing types</h3>
        {types.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No schedule types yet. Add one from the legend codes.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {types.map((type) => {
              const codes = parseDutyCodes(type.dutyCodes);
              return (
                <li
                  key={type.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">{type.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {codes.map((code) => {
                        const style = styleForCode(code);
                        return (
                          <span
                            key={code}
                            className={cn(
                              "inline-flex rounded border px-1.5 py-0.5 text-[11px] font-bold",
                              style.bg,
                              style.text,
                              style.border,
                            )}
                          >
                            {code}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(type)}
                      disabled={pending}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(type.id)}
                      disabled={pending}
                      aria-label={`Delete ${type.name}`}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
