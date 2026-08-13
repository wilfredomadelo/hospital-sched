import "dotenv/config";
import { defineConfig } from "prisma/config";

// Fallback so `prisma generate` works on Vercel when DATABASE_URL isn't set yet.
// Runtime uses Turso via TURSO_* + libSQL adapter in src/lib/create-prisma.ts
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: databaseUrl,
  },
});
