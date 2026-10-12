import { describe, expect, it } from "vitest";

import { DEFAULT_OPS_THRESHOLDS, evaluateOpsStatus, type OpsSnapshot } from "../src/index.js";

const quiet: OpsSnapshot = {
  queued: 0,
  oldestQueuedAgeMs: null,
  running: 0,
  oldestRunningHeartbeatAgeMs: null,
  window: { ms: 3_600_000, succeeded: 0, failed: 0, unsupported: 0 },
};

describe("ops status", () => {
  it("is ok for an idle service", () => {
    expect(evaluateOpsStatus(quiet)).toEqual({ status: "ok", alerts: [], snapshot: quiet });
  });

  it("alerts on a stalled queue and a stale running heartbeat", () => {
    const status = evaluateOpsStatus({
      ...quiet,
      queued: 3,
      oldestQueuedAgeMs: DEFAULT_OPS_THRESHOLDS.maxQueuedAgeMs + 1,
      running: 1,
      oldestRunningHeartbeatAgeMs: DEFAULT_OPS_THRESHOLDS.maxRunningHeartbeatAgeMs + 1,
    });
    expect(status).toMatchObject({ status: "alert", alerts: ["queue_stalled", "running_heartbeat_stale"] });
  });

  it("judges the failure ratio without unsupported outcomes and only on a minimum sample", () => {
    const window = { ms: 3_600_000, succeeded: 1, failed: 2, unsupported: 10 };
    expect(evaluateOpsStatus({ ...quiet, window }).status).toBe("ok");
    expect(evaluateOpsStatus({ ...quiet, window: { ...window, failed: 3 } }).alerts).toEqual(["failure_ratio_high"]);
    expect(evaluateOpsStatus({ ...quiet, window: { ...window, succeeded: 2, failed: 2 } }).status).toBe("ok");
  });
});
