import type { IncomingMessage, ServerResponse } from "node:http";

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Factorio Mod Beta</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <main class="shell">
    <header>
      <p class="eyebrow">PRIVATE BETA</p>
      <h1>Generate a Factorio mod</h1>
      <p class="lede">Describe one supported prototype-stage change. The service plans it, validates it in real Factorio, and returns an installable ZIP.</p>
    </header>

    <section class="panel" aria-labelledby="auth-title">
      <h2 id="auth-title">Access</h2>
      <label for="token">Beta token</label>
      <div class="row">
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your beta token">
        <button id="save-token" type="button" class="secondary">Use for this tab</button>
      </div>
      <p class="hint">The token is stored only in this browser tab's session storage.</p>
    </section>

    <section class="panel" aria-labelledby="request-title">
      <h2 id="request-title">Request</h2>
      <form id="generation-form">
        <label for="prompt">What should the mod change?</label>
        <textarea id="prompt" maxlength="4000" required placeholder="Make steel furnaces twice as fast"></textarea>
        <div class="actions">
          <button id="generate" type="submit">Generate mod</button>
          <span id="request-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </form>
    </section>

    <section id="result-panel" class="panel hidden" aria-labelledby="result-title">
      <div class="result-head">
        <div>
          <p class="eyebrow">GENERATION</p>
          <h2 id="result-title">Result</h2>
        </div>
        <span id="status-badge" class="badge">queued</span>
      </div>
      <dl id="result-meta"></dl>
      <p id="result-message"></p>
      <div id="result-actions" class="actions hidden">
        <button id="download" type="button">Download ZIP</button>
      </div>
      <div id="feedback" class="feedback hidden">
        <label for="feedback-note">Was this useful?</label>
        <textarea id="feedback-note" maxlength="2000" placeholder="Optional note"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-rating="up">Works</button>
          <button type="button" class="secondary" data-rating="down">Needs work</button>
          <span id="feedback-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>
    </section>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`;

const APP_CSS = String.raw`:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0e12;color:#e9edf2}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#17202b 0,#0b0e12 42%)}.shell{width:min(760px,calc(100% - 32px));margin:0 auto;padding:64px 0 96px}header{margin-bottom:28px}.eyebrow{margin:0 0 8px;font-size:12px;letter-spacing:.16em;font-weight:700;color:#9db0c3}h1{font-size:clamp(36px,7vw,58px);line-height:1.02;letter-spacing:-.045em;margin:0 0 16px}h2{font-size:20px;margin:0 0 18px}.lede{max-width:670px;color:#aab5c1;font-size:17px;line-height:1.55;margin:0}.panel{background:rgba(17,22,29,.92);border:1px solid #28323e;border-radius:16px;padding:22px;margin:14px 0;box-shadow:0 18px 60px rgba(0,0,0,.2)}label{display:block;font-size:14px;font-weight:650;margin:0 0 8px}input,textarea{width:100%;border:1px solid #344151;background:#0d1218;color:#f2f5f8;border-radius:10px;padding:12px 13px;font:inherit;outline:none}input:focus,textarea:focus{border-color:#7e9cbb;box-shadow:0 0 0 3px rgba(126,156,187,.14)}textarea{min-height:112px;resize:vertical}.row{display:grid;grid-template-columns:1fr auto;gap:10px}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}button{border:0;border-radius:10px;padding:11px 15px;font:inherit;font-weight:700;cursor:pointer;background:#e9edf2;color:#11161c}button:hover{filter:brightness(.94)}button:disabled{opacity:.48;cursor:not-allowed}.secondary{background:#25303c;color:#e8edf3}.hint,.muted{font-size:13px;color:#8493a3}.hint{margin:8px 0 0}.hidden{display:none!important}.result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.badge{border:1px solid #3a4857;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.badge.succeeded{border-color:#3f765b;color:#a8e2bf}.badge.failed{border-color:#874b4b;color:#f0aaaa}.badge.unsupported{border-color:#7f7047;color:#ead395}dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px;margin:14px 0;color:#aeb8c4;font-size:14px}dt{color:#778697}dd{margin:0;overflow-wrap:anywhere}#result-message{line-height:1.5}.feedback{border-top:1px solid #29333e;margin-top:20px;padding-top:20px}@media(max-width:600px){.shell{width:min(100% - 20px,760px);padding-top:32px}.row{grid-template-columns:1fr}.panel{padding:18px}}`;

const APP_JS = String.raw`(() => {
  const TOKEN_KEY = "project.betaToken";
  const tokenInput = document.querySelector("#token");
  const saveToken = document.querySelector("#save-token");
  const form = document.querySelector("#generation-form");
  const promptInput = document.querySelector("#prompt");
  const generateButton = document.querySelector("#generate");
  const requestState = document.querySelector("#request-state");
  const resultPanel = document.querySelector("#result-panel");
  const statusBadge = document.querySelector("#status-badge");
  const resultMeta = document.querySelector("#result-meta");
  const resultMessage = document.querySelector("#result-message");
  const resultActions = document.querySelector("#result-actions");
  const downloadButton = document.querySelector("#download");
  const feedback = document.querySelector("#feedback");
  const feedbackNote = document.querySelector("#feedback-note");
  const feedbackState = document.querySelector("#feedback-state");
  let generationId = null;
  let pollTimer = null;

  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) tokenInput.value = stored;

  function token() {
    return tokenInput.value.trim() || sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function authHeaders(extra = {}) {
    const value = token();
    if (!value) throw new Error("Enter your beta token first.");
    return { Authorization: "Bearer " + value, ...extra };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: authHeaders(options.headers || {}),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const message = body && body.error && body.error.message ? body.error.message : "Request failed (" + response.status + ")";
      throw new Error(message);
    }
    return body;
  }

  function addMeta(label, value) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    resultMeta.append(dt, dd);
  }

  function render(record) {
    resultPanel.classList.remove("hidden");
    statusBadge.textContent = record.status;
    statusBadge.className = "badge " + record.status;
    resultMeta.replaceChildren();
    addMeta("ID", record.id);
    addMeta("Status", record.status);
    if (record.modSpec && record.modSpec.capability) addMeta("Capability", record.modSpec.capability);
    if (record.telemetry && typeof record.telemetry.durationMs === "number") addMeta("Duration", (record.telemetry.durationMs / 1000).toFixed(1) + " s");

    resultActions.classList.toggle("hidden", record.status !== "succeeded");
    const terminal = ["succeeded", "failed", "unsupported"].includes(record.status);
    feedback.classList.toggle("hidden", !terminal);

    if (record.status === "queued") resultMessage.textContent = "Queued for generation.";
    else if (record.status === "running") resultMessage.textContent = "Generating and validating in Factorio.";
    else if (record.status === "succeeded") resultMessage.textContent = "Validated successfully. The ZIP is ready to install.";
    else if (record.status === "unsupported") resultMessage.textContent = record.reason || "This request is outside the current supported scope.";
    else if (record.status === "failed") resultMessage.textContent = record.error && record.error.message ? record.error.message : "Generation failed.";

    return terminal;
  }

  async function poll() {
    if (!generationId) return;
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId));
      const terminal = render(body.generation);
      if (terminal) {
        generateButton.disabled = false;
        requestState.textContent = "";
        pollTimer = null;
        return;
      }
      pollTimer = window.setTimeout(poll, 1000);
    } catch (error) {
      requestState.textContent = error instanceof Error ? error.message : String(error);
      generateButton.disabled = false;
      pollTimer = null;
    }
  }

  saveToken.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    if (!value) {
      requestState.textContent = "Enter a beta token first.";
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, value);
    requestState.textContent = "Token stored for this tab.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    generationId = null;
    feedbackState.textContent = "";
    generateButton.disabled = true;
    requestState.textContent = "Submitting…";
    try {
      const body = await api("/v1/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptInput.value }),
      });
      generationId = body.generation.id;
      render(body.generation);
      requestState.textContent = "Working…";
      pollTimer = window.setTimeout(poll, 500);
    } catch (error) {
      requestState.textContent = error instanceof Error ? error.message : String(error);
      generateButton.disabled = false;
    }
  });

  downloadButton.addEventListener("click", async () => {
    if (!generationId) return;
    downloadButton.disabled = true;
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId) + "/download", {
        headers: { Accept: "application/json" },
      });
      window.location.assign(body.downloadUrl);
    } catch (error) {
      resultMessage.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      downloadButton.disabled = false;
    }
  });

  feedback.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!generationId) return;
      feedbackState.textContent = "Saving…";
      try {
        await api("/v1/generations/" + encodeURIComponent(generationId) + "/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: button.dataset.rating, ...(feedbackNote.value.trim() ? { note: feedbackNote.value.trim() } : {}) }),
        });
        feedbackState.textContent = "Feedback saved.";
      } catch (error) {
        feedbackState.textContent = error instanceof Error ? error.message : String(error);
      }
    });
  });
})();`;

function sendStatic(response: ServerResponse, contentType: string, body: string): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  response.end(body);
}

export function createPrivateBetaWebHandler(
  apiHandler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    if (method === "GET" && url.pathname === "/") {
      sendStatic(response, "text/html; charset=utf-8", INDEX_HTML);
      return;
    }
    if (method === "GET" && url.pathname === "/app.css") {
      sendStatic(response, "text/css; charset=utf-8", APP_CSS);
      return;
    }
    if (method === "GET" && url.pathname === "/app.js") {
      sendStatic(response, "text/javascript; charset=utf-8", APP_JS);
      return;
    }
    await apiHandler(request, response);
  };
}
