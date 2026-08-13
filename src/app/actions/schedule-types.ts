"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { DUTY_CODES } from "@/lib/scheduling/duty-codes";
import {
  deleteScheduleTypeRow,
  findScheduleTypeByName,
  insertScheduleType,
  updateScheduleTypeRow,
} from "@/lib/schedule-types-db";

const allowedCodes = new Set(DUTY_CODES.map((d) => d.code));

const typeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dutyCodes: z.array(z.string()).min(1),
});

const parseCodes = (formData: FormData) =>
  formData
    .getAll("dutyCode")
    .map(String)
    .filter((code) => allowedCodes.has(code));

const revalidate = () => {
  revalidatePath("/admin/roster");
  revalidatePath("/admin/schedule-types");
};

export const createScheduleType = async (formData: FormData) => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const parsed = typeSchema.safeParse({
    name: formData.get("name"),
    dutyCodes: parseCodes(formData),
  });
  if (!parsed.success) {
    return { error: "Name and at least one legend code are required." };
  }

  const exists = await findScheduleTypeByName(parsed.data.name);
  if (exists) return { error: "A schedule type with that name already exists." };

  await insertScheduleType(
    parsed.data.name,
    JSON.stringify(parsed.data.dutyCodes),
  );
  revalidate();
  return { success: true };
};

export const updateScheduleType = async (formData: FormData) => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing schedule type." };

  const parsed = typeSchema.safeParse({
    name: formData.get("name"),
    dutyCodes: parseCodes(formData),
  });
  if (!parsed.success) {
    return { error: "Name and at least one legend code are required." };
  }

  const clash = await findScheduleTypeByName(parsed.data.name, id);
  if (clash) return { error: "A schedule type with that name already exists." };

  await updateScheduleTypeRow(
    id,
    parsed.data.name,
    JSON.stringify(parsed.data.dutyCodes),
  );
  revalidate();
  return { success: true };
};

export const deleteScheduleType = async (formData: FormData) => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing schedule type." };

  await deleteScheduleTypeRow(id);
  revalidate();
  return { success: true };
};
