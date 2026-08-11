"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { endOfYear, parseISO, setHours, setMinutes, startOfYear } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const holidaySchema = z.object({
  date: z.string().min(1),
  name: z.string().min(1).max(120),
});

const noonOn = (isoDate: string) =>
  setMinutes(setHours(parseISO(isoDate), 12), 0);

export const createHoliday = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const parsed = holidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) return;

  const date = noonOn(parsed.data.date);
  await prisma.publicHoliday.upsert({
    where: { date },
    create: { date, name: parsed.data.name.trim() },
    update: { name: parsed.data.name.trim() },
  });

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/roster");
};

export const deleteHoliday = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.publicHoliday.delete({ where: { id } });
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/roster");
};

export const getHolidaysForYear = async (year: number) => {
  const start = startOfYear(new Date(year, 0, 1));
  const end = endOfYear(new Date(year, 0, 1));
  return prisma.publicHoliday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });
};
