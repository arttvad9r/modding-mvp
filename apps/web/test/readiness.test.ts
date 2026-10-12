import { describe, expect, it } from "vitest";

import { createReadinessProbe } from "../src/readiness.js";

describe("readiness probe", () => {
  it("reports per-component outcomes and is ready only when every check passes", async () => {
    const failures: string[] = [];
    const probe = createReadinessProbe({
      checks: {
        database: async () => undefined,
        storage: async () => {
          throw new Error("secret-bearing upstream detail");
        },
      },
      onCheckFailure: (name) => failures.push(name),
    });

    await expect(probe()).resolves.toEqual({ ready: false, checks: { database: "ok", storage: "fail" } });
    expect(failures).toEqual(["storage"]);
  });

  it("fails a check that exceeds its deadline and aborts its signal", async () => {
    let aborted = false;
    const probe = createReadinessProbe({
      timeoutMs: 20,
      checks: {
        queue: async (signal) => {
          await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
          aborted = signal.aborted;
          await new Promise<never>(() => undefined);
        },
      },
    });

    await expect(probe()).resolves.toEqual({ ready: false, checks: { queue: "fail" } });
    expect(aborted).toBe(true);
  });

  it("caches reports and coalesces concurrent probes so the endpoint cannot amplify load", async () => {
    let clock = 0;
    let calls = 0;
    const probe = createReadinessProbe({
      cacheMs: 1_000,
      now: () => clock,
      checks: {
        database: async () => {
          calls += 1;
        },
      },
    });

    await Promise.all([probe(), probe(), probe()]);
    expect(calls).toBe(1);
    clock = 999;
    await probe();
    expect(calls).toBe(1);
    clock = 1_000;
    await expect(probe()).resolves.toEqual({ ready: true, checks: { database: "ok" } });
    expect(calls).toBe(2);
  });
});
