import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type RosterViewMode = "week" | "15day" | "month";

const mondayOf = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });

export const resolvePeriod = (params: {
  view: RosterViewMode;
  start?: string;
}) => {
  const view = params.view;
  const raw = params.start ? parseISO(params.start) : new Date();

  if (view === "month") {
    const monthAnchor = startOfMonth(raw);
    const start = mondayOf(monthAnchor);
    const monthEnd = endOfMonth(monthAnchor);
    const endExclusive = addDays(endOfWeek(monthEnd, { weekStartsOn: 1 }), 1);
    const dayCount = Math.round(
      (endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );

    return {
      start,
      end: endExclusive,
      days: Array.from({ length: dayCount }, (_, i) => addDays(start, i)),
      dayCount,
      prevStart: format(addMonths(monthAnchor, -1), "yyyy-MM-dd"),
      nextStart: format(addMonths(monthAnchor, 1), "yyyy-MM-dd"),
      label: format(monthAnchor, "MMMM yyyy"),
    };
  }

  // Week and 15-day always begin on Monday
  const start = mondayOf(raw);
  const dayCount = view === "15day" ? 15 : 7;
  const end = addDays(start, dayCount);

  return {
    start,
    end,
    days: Array.from({ length: dayCount }, (_, i) => addDays(start, i)),
    dayCount,
    prevStart: format(addDays(start, -dayCount), "yyyy-MM-dd"),
    nextStart: format(end, "yyyy-MM-dd"),
    label: `${format(start, "MMM d")} – ${format(addDays(start, dayCount - 1), "MMM d, yyyy")}`,
  };
};

export const dateKey = (d: Date) => format(d, "yyyy-MM-dd");
