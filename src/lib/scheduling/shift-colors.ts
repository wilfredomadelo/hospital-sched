export type ShiftColorKey =
  | "day"
  | "evening"
  | "night"
  | "off"
  | "leave"
  | "holiday";

export const SHIFT_COLORS: Record<
  ShiftColorKey,
  { label: string; bg: string; text: string; border: string }
> = {
  day: {
    label: "Day",
    bg: "bg-emerald-100",
    text: "text-emerald-900",
    border: "border-emerald-300",
  },
  evening: {
    label: "Evening",
    bg: "bg-orange-100",
    text: "text-orange-900",
    border: "border-orange-300",
  },
  night: {
    label: "Night",
    bg: "bg-sky-100",
    text: "text-sky-900",
    border: "border-sky-300",
  },
  off: {
    label: "Off",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  leave: {
    label: "Leave",
    bg: "bg-rose-100",
    text: "text-rose-900",
    border: "border-rose-300",
  },
  holiday: {
    label: "Holiday",
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
  },
};

export const colorKeyFromTemplate = (template: {
  name: string;
  isNight: boolean;
}): ShiftColorKey => {
  const name = template.name.toLowerCase();
  if (template.isNight || name.includes("night")) return "night";
  if (name.includes("evening") || name.includes("pm")) return "evening";
  if (name.includes("day") || name.includes("morning")) return "day";
  return "day";
};
