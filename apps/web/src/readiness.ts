export type ReadinessCheck = (signal: AbortSignal) => Promise<void>;

export interface ReadinessReport {
  readonly ready: boolean;
  /** Component name -> outcome. Failure details are never exposed to unauthenticated callers. */
  readonly checks: Readonly<Record<string, "ok" | "fail">>;
}

export type ReadinessProbe = () => Promise<ReadinessReport>;

export interface ReadinessProbeOptions {
  readonly checks: Readonly<Record<string, ReadinessCheck>>;
  /** Per-check deadline; a slow dependency counts as not ready. */
  readonly timeoutMs?: number;
  /**
   * Reuse a report this long. `/health/ready` is unauthenticated, so callers must not be able to
   * turn it into a database/object-store request amplifier.
   */
  readonly cacheMs?: number;
  readonly now?: () => number;
  readonly onCheckFailure?: (name: string, error: unknown) => void;
}

export interface ServiceReadinessDependencies {
  readonly database: { query(statement: string): Promise<unknown> };
  readonly queue: { checkReady(): Promise<void> };
  readonly storage: { checkAccess(signal?: AbortSignal): Promise<void> };
}

/** The dependencies the web service needs to accept and serve generations. */
export function serviceReadinessChecks(dependencies: ServiceReadinessDependencies): Record<string, ReadinessCheck> {
  return {
    database: async () => {
      await dependencies.database.query("select 1");
    },
    queue: async () => await dependencies.queue.checkReady(),
    storage: async (signal) => await dependencies.storage.checkAccess(signal),
  };
}

async function runCheck(check: ReadinessCheck, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`readiness check timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createReadinessProbe(options: ReadinessProbeOptions): ReadinessProbe {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const cacheMs = options.cacheMs ?? 5_000;
  const now = options.now ?? Date.now;
  let cached: { at: number; report: ReadinessReport } | undefined;
  let inFlight: Promise<ReadinessReport> | undefined;

  const evaluate = async (): Promise<ReadinessReport> => {
    const entries = await Promise.all(
      Object.entries(options.checks).map(async ([name, check]) => {
        try {
          await runCheck(check, timeoutMs);
          return [name, "ok"] as const;
        } catch (error) {
          options.onCheckFailure?.(name, error);
          return [name, "fail"] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    return { ready: entries.every(([, outcome]) => outcome === "ok"), checks };
  };

  return async () => {
    if (cached !== undefined && now() - cached.at < cacheMs) return cached.report;
    inFlight ??= evaluate()
      .then((report) => {
        cached = { at: now(), report };
        return report;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return await inFlight;
  };
}
