"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const unitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const createUnit = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const parsed = unitSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return;

  await prisma.unit.create({ data: parsed.data });
  revalidatePath("/admin/units");
};

export const updateUnit = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const id = String(formData.get("id") ?? "");
  const parsed = unitSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!id || !parsed.success) return;

  await prisma.unit.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/units");
};

export const deleteUnit = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.unit.delete({ where: { id } });
  revalidatePath("/admin/units");
};

const nurseSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  licenseNumber: z.string().min(1),
  licenseExpiresAt: z.string().min(1),
  unitId: z.string().optional(),
  maxHoursPerWeek: z.coerce.number().int().min(1).max(84),
  skills: z.string().optional(),
  preferredShifts: z.string().optional(),
});

const parseList = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const createNurse = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const parsed = nurseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || "password123",
    licenseNumber: formData.get("licenseNumber"),
    licenseExpiresAt: formData.get("licenseExpiresAt"),
    unitId: formData.get("unitId") || undefined,
    maxHoursPerWeek: formData.get("maxHoursPerWeek") || 40,
    skills: formData.get("skills") || "",
    preferredShifts: formData.get("preferredShifts") || "",
  });
  if (!parsed.success) return;

  const passwordHash = await bcrypt.hash(parsed.data.password!, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: Role.NURSE,
      passwordHash,
      nurseProfile: {
        create: {
          licenseNumber: parsed.data.licenseNumber,
          licenseExpiresAt: new Date(parsed.data.licenseExpiresAt),
          unitId: parsed.data.unitId || null,
          maxHoursPerWeek: parsed.data.maxHoursPerWeek,
          skills: JSON.stringify(parseList(parsed.data.skills)),
          preferredShifts: JSON.stringify(parseList(parsed.data.preferredShifts)),
        },
      },
    },
  });

  revalidatePath("/admin/staff");
};

export const updateNurse = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const userId = String(formData.get("userId") ?? "");
  const parsed = nurseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    licenseNumber: formData.get("licenseNumber"),
    licenseExpiresAt: formData.get("licenseExpiresAt"),
    unitId: formData.get("unitId") || undefined,
    maxHoursPerWeek: formData.get("maxHoursPerWeek") || 40,
    skills: formData.get("skills") || "",
    preferredShifts: formData.get("preferredShifts") || "",
  });
  if (!userId || !parsed.success) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      nurseProfile: {
        update: {
          licenseNumber: parsed.data.licenseNumber,
          licenseExpiresAt: new Date(parsed.data.licenseExpiresAt),
          unitId: parsed.data.unitId || null,
          maxHoursPerWeek: parsed.data.maxHoursPerWeek,
          skills: JSON.stringify(parseList(parsed.data.skills)),
          preferredShifts: JSON.stringify(
            parseList(parsed.data.preferredShifts),
          ),
        },
      },
    },
  });

  revalidatePath("/admin/staff");
};

export const archiveNurse = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const nurseId = String(formData.get("nurseId") ?? "");
  if (!nurseId) return;

  await prisma.nurseProfile.update({
    where: { id: nurseId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin/roster");
  revalidatePath("/admin");
  revalidatePath("/admin/units");
  revalidatePath("/admin/analytics");
};

export const unarchiveNurse = async (formData: FormData): Promise<void> => {
  await requireRole([Role.ADMIN, Role.SUPERVISOR]);
  const nurseId = String(formData.get("nurseId") ?? "");
  if (!nurseId) return;

  await prisma.nurseProfile.update({
    where: { id: nurseId },
    data: { archivedAt: null },
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin/roster");
  revalidatePath("/admin");
  revalidatePath("/admin/units");
  revalidatePath("/admin/analytics");
};
