import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { APP_JS } from "../src/ui.js";

type Listener = (event: { preventDefault(): void }) => unknown;

class FakeClassList {
  private readonly classes = new Set<string>();
  add(...names: string[]) { for (const name of names) this.classes.add(name); }
  remove(...names: string[]) { for (const name of names) this.classes.delete(name); }
  toggle(name: string, force?: boolean) {
    const enabled = force ?? !this.classes.has(name);
    if (enabled) this.classes.add(name);
    else this.classes.delete(name);
    return enabled;
  }
  contains(name: string) { return this.classes.has(name); }
}

class FakeElement {
  textContent = "";
  value = "";
  disabled = false;
  placeholder = "";
  innerHTML = "";
  className = "";
  type = "";
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  private readonly listeners = new Map<string, Listener[]>();
  private readonly queried = new Map<string, FakeElement>();

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  async dispatch(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((listener) => listener({ preventDefault() {} })));
  }
  querySelector(selector: string) {
    const existing = this.queried.get(selector);
    if (existing) return existing;
    const created = new FakeElement();
    this.queried.set(selector, created);
    return created;
  }
  querySelectorAll() { return []; }
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeElement[]) { this.children = nodes; }
  setAttribute() {}
  focus() {}
  scrollIntoView() {}
  allText(): string {
    return [this.textContent, ...this.children.map((child) => child.allText())].join(" ");
  }
}

interface PendingRequest {
  readonly path: string;
  readonly signal?: AbortSignal;
  respond(status: number, body: unknown, headers?: Record<string, string>): Promise<void>;
}

function createHarness() {
  const elements = new Map<string, FakeElement>();
  const element = (selector: string) => {
    const existing = elements.get(selector);
    if (existing) return existing;
    const created = new FakeElement();
    elements.set(selector, created);
    return created;
  };
  const timers: Array<{ id: number; delay: number; callback: () => void }> = [];
  let nextTimer = 1;
  const requests: PendingRequest[] = [];
  const session = new Map<string, string>([["project.betaToken", "beta_token_for_ui_test_abcdefghijklmnop"]]);

  const document = {
    title: "",
    documentElement: { lang: "" },
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
    createTextNode: (text: string) => Object.assign(new FakeElement(), { textContent: text }),
  };
  const window = {
    setTimeout(callback: () => void, delay: number) {
      const id = nextTimer++;
      timers.push({ id, delay, callback });
      return id;
    },
    clearTimeout(id: number) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    location: { assign() {} },
  };
  const fetch = (path: string, options: { signal?: AbortSignal } = {}) =>
    new Promise((resolve) => {
      requests.push({
        path,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        async respond(status, body, headers = {}) {
          const lower = Object.fromEntries(Object.entries({ "content-type": "application/json", ...headers })
            .map(([name, value]) => [name.toLowerCase(), value]));
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
            json: async () => body,
          });
          await flush();
        },
      });
    });

  runInNewContext(APP_JS, {
    document,
    window,
    fetch,
    AbortController,
    navigator: { language: "en-US" },
    localStorage: { getItem: () => "en", setItem() {} },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    },
    console,
  });

  async function flush() {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
  }
  async function runTimers() {
    const due = timers.splice(0);
    for (const timer of due) timer.callback();
    await flush();
    return due.map((timer) => timer.delay);
  }
  function takeRequest(path: string) {
    const index = requests.findIndex((request) => request.path === path);
    if (index < 0) throw new Error(`No pending request for ${path}; pending: ${requests.map((r) => r.path).join(", ")}`);
    return requests.splice(index, 1)[0]!;
  }
  return { element, timers, requests, runTimers, takeRequest, flush };
}

const record = (id: string, status: string) => ({
  id,
  status,
  prompt: `Prompt ${id}`,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
});
const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";

describe("tester UI polling lifecycle", () => {
  it("ignores a late poll response for a previously selected generation", async () => {
    const ui = createHarness();
    await ui.takeRequest("/v1/generations?limit=10").respond(200, {
      generations: [record(OLD, "running"), record(NEW, "succeeded")],
    });
    const [oldButton, newButton] = ui.element("#history-list").children;
    if (!oldButton || !newButton) throw new Error("History buttons were not rendered");

    void oldButton.dispatch("click");
    await ui.flush();
    await ui.takeRequest(`/v1/generations/${OLD}`).respond(200, { generation: record(OLD, "running") });
    expect(await ui.runTimers()).toEqual([500]);
    const stalePoll = ui.takeRequest(`/v1/generations/${OLD}`);

    void newButton.dispatch("click");
    await ui.flush();
    expect(stalePoll.signal?.aborted).toBe(true);
    await ui.takeRequest(`/v1/generations/${NEW}`).respond(200, { generation: record(NEW, "succeeded") });
    expect(ui.element("#result-meta").allText()).toContain(NEW);
    expect(ui.element("#generate").disabled).toBe(false);

    // The aborted request still delivers a response (e.g. it was already in transit).
    await stalePoll.respond(200, { generation: record(OLD, "succeeded") });
    expect(ui.element("#result-meta").allText()).toContain(NEW);
    expect(ui.element("#result-meta").allText()).not.toContain(OLD);
    expect(ui.element("#generate").disabled).toBe(false);
    expect(ui.timers).toHaveLength(0);
    expect(ui.requests.filter((request) => request.path.includes(OLD))).toHaveLength(0);
  });

  it("keeps polling after a 429 using Retry-After and finishes on the next success", async () => {
    const ui = createHarness();
    await ui.takeRequest("/v1/generations?limit=10").respond(200, { generations: [record(OLD, "running")] });
    const [button] = ui.element("#history-list").children;
    if (!button) throw new Error("History button was not rendered");
    void button.dispatch("click");
    await ui.flush();
    await ui.takeRequest(`/v1/generations/${OLD}`).respond(200, { generation: record(OLD, "running") });
    await ui.runTimers();

    await ui.takeRequest(`/v1/generations/${OLD}`).respond(
      429,
      { error: { code: "rate_limited", message: "Too many requests" } },
      { "Retry-After": "3" },
    );
    expect(ui.timers.map((timer) => timer.delay)).toEqual([3000]);
    expect(ui.element("#request-state").textContent).toContain("Connection hiccup");
    expect(ui.element("#generate").disabled).toBe(true);

    await ui.runTimers();
    await ui.takeRequest(`/v1/generations/${OLD}`).respond(200, { generation: record(OLD, "succeeded") });
    expect(ui.element("#request-state").textContent).toBe("Finished.");
    expect(ui.element("#generate").disabled).toBe(false);
  });

  it("stops polling and hides the result when the token is cleared", async () => {
    const ui = createHarness();
    await ui.takeRequest("/v1/generations?limit=10").respond(200, { generations: [record(OLD, "running")] });
    const [button] = ui.element("#history-list").children;
    if (!button) throw new Error("History button was not rendered");
    void button.dispatch("click");
    await ui.flush();
    await ui.takeRequest(`/v1/generations/${OLD}`).respond(200, { generation: record(OLD, "running") });
    await ui.runTimers();
    const inFlight = ui.takeRequest(`/v1/generations/${OLD}`);

    await ui.element("#clear-token").dispatch("click");
    expect(inFlight.signal?.aborted).toBe(true);
    expect(ui.element("#result-panel").classList.contains("hidden")).toBe(true);
    await inFlight.respond(200, { generation: record(OLD, "succeeded") });
    expect(ui.element("#result-panel").classList.contains("hidden")).toBe(true);
    expect(ui.timers).toHaveLength(0);
  });
});
