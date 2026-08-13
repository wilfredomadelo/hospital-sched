export type DutyCodeDef = {
  code: string;
  startTime: string;
  endTime: string;
  hours: number;
  description: string;
  crossesMidnight: boolean;
};

export type StatusCodeDef = {
  code: string;
  description: string;
  kind: "status" | "leave";
};

/** Working duty codes shown on the roster. */
export const DUTY_CODES: DutyCodeDef[] = [
  { code: "7", startTime: "07:00", endTime: "15:00", hours: 8, description: "7AM – 3PM", crossesMidnight: false },
  { code: "7A", startTime: "07:00", endTime: "19:00", hours: 12, description: "7AM – 7PM (12hrs)", crossesMidnight: false },
  { code: "7*", startTime: "07:00", endTime: "23:00", hours: 16, description: "7AM – 11PM (16hrs)", crossesMidnight: false },
  { code: "6", startTime: "06:00", endTime: "14:00", hours: 8, description: "6AM – 2PM", crossesMidnight: false },
  { code: "10A", startTime: "10:00", endTime: "18:00", hours: 8, description: "10AM – 6PM", crossesMidnight: false },
  { code: "10AP", startTime: "10:00", endTime: "22:00", hours: 12, description: "10AM – 10PM (12hrs)", crossesMidnight: false },
  { code: "6A", startTime: "06:00", endTime: "18:00", hours: 12, description: "6AM – 6PM (12hrs)", crossesMidnight: false },
  { code: "8", startTime: "08:00", endTime: "16:00", hours: 8, description: "8AM – 4PM", crossesMidnight: false },
  { code: "8S", startTime: "08:00", endTime: "17:00", hours: 9, description: "8AM – 5PM (Seminar)", crossesMidnight: false },
  { code: "12", startTime: "00:00", endTime: "08:00", hours: 8, description: "12AM – 8AM", crossesMidnight: false },
  { code: "8*", startTime: "08:00", endTime: "00:00", hours: 16, description: "8AM – 12AM (16hrs)", crossesMidnight: true },
  { code: "9A", startTime: "09:00", endTime: "17:00", hours: 8, description: "9AM – 5PM", crossesMidnight: false },
  { code: "8A", startTime: "08:00", endTime: "20:00", hours: 12, description: "8AM – 8PM (12hrs)", crossesMidnight: false },
  { code: "11A", startTime: "11:00", endTime: "19:00", hours: 8, description: "11AM – 7PM", crossesMidnight: false },
  { code: "11AP", startTime: "11:00", endTime: "23:00", hours: 12, description: "11AM – 11PM", crossesMidnight: false },
  { code: "3", startTime: "15:00", endTime: "23:00", hours: 8, description: "3PM – 11PM", crossesMidnight: false },
  { code: "7P", startTime: "19:00", endTime: "07:00", hours: 12, description: "7PM – 7AM (12hrs)", crossesMidnight: true },
  { code: "2", startTime: "14:00", endTime: "22:00", hours: 8, description: "2PM – 10PM", crossesMidnight: false },
  { code: "6P", startTime: "18:00", endTime: "06:00", hours: 12, description: "6PM – 6AM (12hrs)", crossesMidnight: true },
  { code: "3*", startTime: "15:00", endTime: "07:00", hours: 16, description: "3PM – 7AM (16hrs)", crossesMidnight: true },
  { code: "4", startTime: "16:00", endTime: "00:00", hours: 8, description: "4PM – 12AM", crossesMidnight: true },
  { code: "4*", startTime: "16:00", endTime: "08:00", hours: 16, description: "4PM – 8AM (16hrs)", crossesMidnight: true },
  { code: "6*", startTime: "06:00", endTime: "22:00", hours: 16, description: "6AM – 10PM (16hrs)", crossesMidnight: false },
  { code: "2*", startTime: "14:00", endTime: "06:00", hours: 16, description: "2PM – 6AM (16hrs)", crossesMidnight: true },
  { code: "12P", startTime: "12:00", endTime: "20:00", hours: 8, description: "12PM – 8PM", crossesMidnight: false },
  { code: "3AP", startTime: "15:00", endTime: "07:00", hours: 16, description: "3PM – 7AM (16hrs)", crossesMidnight: true },
  { code: "11", startTime: "23:00", endTime: "07:00", hours: 8, description: "11PM – 7AM", crossesMidnight: true },
  { code: "10", startTime: "22:00", endTime: "06:00", hours: 8, description: "10PM – 6AM", crossesMidnight: true },
];

/** Non-duty status / leave codes for the legend. */
export const STATUS_CODES: StatusCodeDef[] = [
  { code: "L", description: "Lacking Rest Day", kind: "status" },
  { code: "C", description: "Compensatory", kind: "status" },
  { code: "RD", description: "Rest Day (RD)", kind: "status" },
  { code: "LV", description: "Leave", kind: "leave" },
  { code: "QL", description: "Quarantine Leave", kind: "leave" },
  { code: "RL", description: "Rehabilitation Leave", kind: "leave" },
  { code: "PL", description: "Privilege Leave", kind: "leave" },
  { code: "PaL", description: "Paternity Leave", kind: "leave" },
  { code: "ML", description: "Maternity Leave", kind: "leave" },
  { code: "FL", description: "Force Leave", kind: "leave" },
  { code: "SL", description: "Sick Leave", kind: "leave" },
  { code: "VL", description: "Vacation Leave", kind: "leave" },
];

export const parseDutyCodes = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [] as string[];
    return parsed.filter((c): c is string => typeof c === "string");
  } catch {
    return [] as string[];
  }
};

export const dutyByCode = Object.fromEntries(
  DUTY_CODES.map((d) => [d.code, d]),
) as Record<string, DutyCodeDef>;

export const statusByCode = Object.fromEntries(
  STATUS_CODES.map((s) => [s.code, s]),
) as Record<string, StatusCodeDef>;

const PALETTE = [
  { bg: "bg-emerald-100 dark:bg-emerald-900/80", text: "text-emerald-900 dark:text-emerald-100", border: "border-emerald-300 dark:border-emerald-700" },
  { bg: "bg-teal-100 dark:bg-teal-900/80", text: "text-teal-900 dark:text-teal-100", border: "border-teal-300 dark:border-teal-700" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/80", text: "text-cyan-900 dark:text-cyan-100", border: "border-cyan-300 dark:border-cyan-700" },
  { bg: "bg-sky-100 dark:bg-sky-900/80", text: "text-sky-900 dark:text-sky-100", border: "border-sky-300 dark:border-sky-700" },
  { bg: "bg-blue-100 dark:bg-blue-900/80", text: "text-blue-900 dark:text-blue-100", border: "border-blue-300 dark:border-blue-700" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/80", text: "text-indigo-900 dark:text-indigo-100", border: "border-indigo-300 dark:border-indigo-700" },
  { bg: "bg-violet-100 dark:bg-violet-900/80", text: "text-violet-900 dark:text-violet-100", border: "border-violet-300 dark:border-violet-700" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-900/80", text: "text-fuchsia-900 dark:text-fuchsia-100", border: "border-fuchsia-300 dark:border-fuchsia-700" },
  { bg: "bg-pink-100 dark:bg-pink-900/80", text: "text-pink-900 dark:text-pink-100", border: "border-pink-300 dark:border-pink-700" },
  { bg: "bg-rose-100 dark:bg-rose-900/80", text: "text-rose-900 dark:text-rose-100", border: "border-rose-300 dark:border-rose-700" },
  { bg: "bg-orange-100 dark:bg-orange-900/80", text: "text-orange-900 dark:text-orange-100", border: "border-orange-300 dark:border-orange-700" },
  { bg: "bg-amber-100 dark:bg-amber-900/80", text: "text-amber-900 dark:text-amber-100", border: "border-amber-300 dark:border-amber-700" },
  { bg: "bg-lime-100 dark:bg-lime-900/80", text: "text-lime-900 dark:text-lime-100", border: "border-lime-300 dark:border-lime-700" },
  { bg: "bg-green-100 dark:bg-green-900/80", text: "text-green-900 dark:text-green-100", border: "border-green-300 dark:border-green-700" },
];

const hashCode = (code: string) => {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const styleForCode = (code: string) => {
  if (code === "RD") {
    return {
      bg: "bg-amber-50 dark:bg-amber-900/70",
      text: "text-amber-800 dark:text-amber-100",
      border: "border-amber-200 dark:border-amber-700",
    };
  }
  if (code === "L" || code === "C") {
    return { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" };
  }
  if (STATUS_CODES.some((s) => s.kind === "leave" && s.code === code)) {
    return {
      bg: "bg-rose-100 dark:bg-rose-900/70",
      text: "text-rose-900 dark:text-rose-100",
      border: "border-rose-300 dark:border-rose-700",
    };
  }
  if (code === "HOL") {
    return { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300" };
  }
  return PALETTE[hashCode(code) % PALETTE.length];
};

export const formatDutyLabel = (code: string) => {
  const duty = dutyByCode[code];
  if (duty) return `${duty.code} · ${duty.description}`;
  const status = statusByCode[code];
  if (status) return `${status.code} · ${status.description}`;
  return code;
};
