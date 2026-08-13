"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DUTY_CODES,
  STATUS_CODES,
  styleForCode,
} from "@/lib/scheduling/duty-codes";
import { cn } from "@/lib/utils";

export const RosterLegend = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Open duty code legend"
      >
        Legend
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Duty code legend"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold">Legend</h3>
                <p className="text-sm text-slate-600">
                  Duty codes and leave / status markers used on the roster.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close legend"
              >
                Close
              </Button>
            </div>

            <section className="mb-6">
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Duty codes
              </h4>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {DUTY_CODES.map((d) => {
                  const style = styleForCode(d.code);
                  return (
                    <li
                      key={d.code}
                      className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm"
                    >
                      <span
                        className={cn(
                          "inline-flex min-w-[3rem] justify-center rounded border px-1.5 py-0.5 text-xs font-bold",
                          style.bg,
                          style.text,
                          style.border,
                        )}
                      >
                        {d.code}
                      </span>
                      <span className="text-slate-700">{d.description}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Status & leave
              </h4>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {STATUS_CODES.map((s) => {
                  const style = styleForCode(s.code);
                  return (
                    <li
                      key={s.code}
                      className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm"
                    >
                      <span
                        className={cn(
                          "inline-flex min-w-[3rem] justify-center rounded border px-1.5 py-0.5 text-xs font-bold",
                          style.bg,
                          style.text,
                          style.border,
                        )}
                      >
                        {s.code}
                      </span>
                      <span className="text-slate-700">{s.description}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
};
