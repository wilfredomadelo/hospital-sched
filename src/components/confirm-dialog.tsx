"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";

export type ConfirmDialogAction = {
  label: string;
  onClick: () => void;
  variant?: "danger" | "default" | "outline" | "ghost";
  disabled?: boolean;
};

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  actions?: ConfirmDialogAction[];
  onCancel: () => void;
  onConfirm?: () => void;
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  actions,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) => {
  const titleId = useId();
  const descId = useId();

  if (!open) return null;

  const handleCancel = () => {
    if (pending) return;
    onCancel();
  };

  const confirmButtons =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: confirmLabel,
            onClick: () => onConfirm?.(),
            variant: "danger" as const,
            disabled: false,
          },
        ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={0}
      onClick={handleCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-display text-lg font-bold">
          {title}
        </h3>
        <p id={descId} className="mt-2 text-sm text-slate-600">
          {description}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={handleCancel}
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </Button>
          {confirmButtons.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant={action.variant ?? "danger"}
              disabled={pending || action.disabled}
              onClick={action.onClick}
              aria-label={action.label}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
