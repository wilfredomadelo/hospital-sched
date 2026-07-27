"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AssignResult = {
  error?: string;
  success?: boolean;
  warnings?: string[];
};

export const AssignShiftForm = ({
  unitId,
  nurses,
  templates,
  defaultDate,
  assignAction,
}: {
  unitId: string;
  nurses: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  defaultDate: string;
  assignAction: (formData: FormData) => Promise<AssignResult>;
}) => {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await assignAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      const warnings =
        result.warnings && result.warnings.length > 0
          ? ` Warnings: ${result.warnings.join(" ")}`
          : "";
      setMessage(`Shift assigned.${warnings}`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign shift</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={handleSubmit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input type="hidden" name="unitId" value={unitId} />
          <div className="space-y-1">
            <Label htmlFor="nurseId">Nurse</Label>
            <Select id="nurseId" name="nurseId" required aria-label="Select nurse">
              <option value="">Select…</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="templateId">Shift</Label>
            <Select
              id="templateId"
              name="templateId"
              required
              aria-label="Select shift template"
            >
              <option value="">Select…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={defaultDate}
              required
              aria-label="Shift date"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-teal-700" role="status">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
