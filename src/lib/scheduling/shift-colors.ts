/** @deprecated use duty-codes.ts — kept for any residual imports */
export {
  styleForCode as SHIFT_COLORS_LOOKUP,
  dutyByCode,
} from "@/lib/scheduling/duty-codes";

export type ShiftColorKey = string;

export const colorKeyFromTemplate = (template: {
  name: string;
  isNight?: boolean;
}): string => template.name;
