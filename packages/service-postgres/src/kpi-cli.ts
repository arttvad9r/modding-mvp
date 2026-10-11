import { buildBetaKpiReport } from "./kpis.js";
import { createServicePostgresClient } from "./db.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const client = createServicePostgresClient({ connectionString: required("DATABASE_URL") });
  try {
    const report = await buildBetaKpiReport(client.db);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "ERROR",
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
