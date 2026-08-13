import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export type ScheduleTypeRow = {
  id: string;
  name: string;
  dutyCodes: string;
};

let ensured = false;

const ensureScheduleTypeTable = async () => {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ScheduleType (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      dutyCodes TEXT NOT NULL DEFAULT '[]',
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ScheduleType_name_key ON ScheduleType(name)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO ScheduleType (id, name, dutyCodes, createdAt, updatedAt)
    SELECT 'cstdstd00000000000000001', 'Standard',
      '["7","3","11","6","8","2","10","12"]', datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM ScheduleType WHERE name = 'Standard')
  `);
  ensured = true;
};

export const listScheduleTypes = async () => {
  await ensureScheduleTypeTable();
  return prisma.$queryRaw<ScheduleTypeRow[]>`
    SELECT id, name, dutyCodes FROM ScheduleType ORDER BY name ASC
  `;
};

export const findScheduleTypeById = async (id: string) => {
  await ensureScheduleTypeTable();
  const rows = await prisma.$queryRaw<ScheduleTypeRow[]>`
    SELECT id, name, dutyCodes FROM ScheduleType WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
};

export const findScheduleTypeByName = async (name: string, exceptId?: string) => {
  await ensureScheduleTypeTable();
  const rows = exceptId
    ? await prisma.$queryRaw<ScheduleTypeRow[]>`
        SELECT id, name, dutyCodes FROM ScheduleType
        WHERE name = ${name} AND id != ${exceptId}
        LIMIT 1
      `
    : await prisma.$queryRaw<ScheduleTypeRow[]>`
        SELECT id, name, dutyCodes FROM ScheduleType WHERE name = ${name} LIMIT 1
      `;
  return rows[0] ?? null;
};

export const insertScheduleType = async (name: string, dutyCodes: string) => {
  await ensureScheduleTypeTable();
  const id = randomUUID();
  const now = new Date().toISOString();
  await prisma.$executeRaw`
    INSERT INTO ScheduleType (id, name, dutyCodes, createdAt, updatedAt)
    VALUES (${id}, ${name}, ${dutyCodes}, ${now}, ${now})
  `;
};

export const updateScheduleTypeRow = async (
  id: string,
  name: string,
  dutyCodes: string,
) => {
  await ensureScheduleTypeTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE ScheduleType
    SET name = ${name}, dutyCodes = ${dutyCodes}, updatedAt = ${now}
    WHERE id = ${id}
  `;
};

export const deleteScheduleTypeRow = async (id: string) => {
  await ensureScheduleTypeTable();
  await prisma.$executeRaw`DELETE FROM ScheduleType WHERE id = ${id}`;
};
