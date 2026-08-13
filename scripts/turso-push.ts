/**
 * Push Prisma schema SQL to Turso.
 * Prisma CLI only accepts file: URLs for sqlite — use this for libsql://.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const stripSqlComments = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const main = async () => {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken || authToken.includes("REPLACE_WITH")) {
    console.error(
      "Set a real TURSO_AUTH_TOKEN in .env (from Turso dashboard → Tokens).\n" +
        "Keep DATABASE_URL as file:./dev.db",
    );
    process.exit(1);
  }

  process.env.DATABASE_URL = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL
    : "file:./dev.db";

  const outFile = join(process.cwd(), "prisma", "turso-schema.sql");

  console.log("Generating SQL from Prisma schema…");
  execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output "${outFile}"`,
    { encoding: "utf8", env: process.env, stdio: "inherit" },
  );

  if (!existsSync(outFile)) {
    console.error("SQL file was not created:", outFile);
    process.exit(1);
  }

  const raw = readFileSync(outFile, "utf8");
  const sql = stripSqlComments(raw);
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    console.error("No SQL statements found in", outFile);
    process.exit(1);
  }

  console.log(`Applying ${statements.length} statements to Turso…`);
  console.log(`URL: ${url}`);

  const client = createClient({ url, authToken });

  try {
    await client.execute("select 1");
    console.log("Turso auth OK");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("\nTurso auth failed:", message);
    console.error(
      "Open https://turso.tech → database hsdb-fred1011 → Tokens → create token\n" +
        "Paste it into TURSO_AUTH_TOKEN in .env (replace REPLACE_WITH_NEW_TURSO_TOKEN)\n",
    );
    process.exit(1);
  }

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(message)) {
        console.warn("skip:", message.split("\n")[0]);
        continue;
      }
      console.error("Failed on:\n", statement.slice(0, 240));
      throw err;
    }
  }

  try {
    unlinkSync(outFile);
  } catch {
    /* ignore */
  }

  console.log("Turso schema push complete.");
  console.log("Next: npm run db:seed:turso");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
