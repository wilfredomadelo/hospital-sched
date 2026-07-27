import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type RosterViewMode = "week" | "15day" | "month";

export const resolvePeriod = (params: {
  view: RosterViewMode;
  start?: string;
}) => {
  const view = params.view;
  let start: Date;

  if (params.start) {
    start = parseISO(params.start);
  } else if (view === "month") {
    start = startOfMonth(new Date());
  } else {
    start = startOfWeek(new Date(), { weekStartsOn: 1 });
  }

  if (view === "month") {
    start = startOfMonth(start);
    const monthEnd = endOfMonth(start);
    const dayCount = differenceInCalendarDays(monthEnd, start) + 1;
    return {
      start,
      end: addDays(monthEnd, 1),
      days: Array.from({ length: dayCount }, (_, i) => addDays(start, i)),
      dayCount,
      prevStart: format(addMonths(start, -1), "yyyy-MM-dd"),
      nextStart: format(addMonths(start, 1), "yyyy-MM-dd"),
      label: format(start, "MMMM yyyy"),
    };
  }

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
