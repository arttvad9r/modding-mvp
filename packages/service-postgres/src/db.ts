import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

export type ServicePostgresDb = NodePgDatabase<typeof schema>;

export interface ServicePostgresClient {
  readonly pool: Pool;
  readonly db: ServicePostgresDb;
  close(): Promise<void>;
}

export function createServicePostgresClient(config: PoolConfig): ServicePostgresClient {
  const pool = new Pool(config);
  const db = drizzle(pool, { schema });
  return {
    pool,
    db,
    async close() {
      await pool.end();
    },
  };
}
