import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

import { createServiceUser } from "@project/service-core";
import {
  PostgresServiceUserRepository,
  createServicePostgresClient,
} from "@project/service-postgres";

function loadLocalEnv(): void {
  const root = process.env.INIT_CWD ?? process.cwd();
  const envPath = path.resolve(root, ".env.local");
  if (existsSync(envPath)) loadEnvFile(envPath);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const metricsEligible = !args.includes("--internal");
  const label = args.filter((arg) => arg !== "--internal").join(" ").trim();
  if (!label) throw new Error('Usage: pnpm beta:user:create -- [--internal] "Tester label"');
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const database = createServicePostgresClient({ connectionString });
  try {
    const created = createServiceUser({ label, metricsEligible });
    await new PostgresServiceUserRepository(database.db).insert(created.user);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "OK",
          user: {
            id: created.user.id,
            label: created.user.label,
            metricsEligible: created.user.metricsEligible,
            createdAt: created.user.createdAt,
          },
          accessToken: created.accessToken,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await database.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "ERROR", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
