import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createServicePostgresClient } from "./db.js";
import { serviceMigrationsFolder } from "./migrations.js";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const migrationsFolder = serviceMigrationsFolder();
  const database = createServicePostgresClient({ connectionString });
  try {
    await migrate(database.db, { migrationsFolder });
    process.stdout.write(`${JSON.stringify({ status: "OK", migrationsFolder })}\n`);
  } finally {
    await database.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "ERROR", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
