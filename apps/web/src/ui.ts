import type { IncomingMessage, ServerResponse } from "node:http";

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Private beta for building personal, validated Factorio 2.0 tweak bundles from plain-English requests.">
  <title>Factorio Mod Generator — Private Beta</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <main class="shell">
    <header class="hero">
      <p class="eyebrow">FACTORIO 2.0 · PRIVATE BETA</p>
      <h1>Describe the rebalance.<br>Get one tested mod.</h1>
      <p class="lede">No Lua required. Combine several supported tweaks in one request; the service builds one installable mod and checks every requested change in a real Factorio 2.0.77 runtime before giving you the ZIP.</p>
      <div class="proof-row" aria-label="Beta guarantees">
        <span>Real Factorio validation</span>
        <span>Multi-change tweak bundles</span>
        <span>Explicit unsupported results</span>
      </div>
    </header>

    <section class="notice" aria-label="Beta scope notice">
      <strong>This beta focuses on personal base-game tweak packs.</strong>
      <span>Combine supported machine speed, crafting time, recipe input/output, stack-size, and research changes in one request. If any essential part is outside the current scope, the whole request is rejected instead of silently dropping it.</span>
    </section>

    <section class="panel access-panel" aria-labelledby="auth-title">
      <div class="section-head">
        <div>
          <p class="step">01 · ACCESS</p>
          <h2 id="auth-title">Enter your beta token</h2>
        </div>
        <span id="access-state" class="access-state" role="status" aria-live="polite">Not saved</span>
      </div>
      <label class="sr-only" for="token">Beta token</label>
      <div class="row token-row">
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your beta token">
        <button id="save-token" type="button" class="secondary">Save for this tab</button>
        <button id="clear-token" type="button" class="ghost">Clear</button>
      </div>
      <p class="hint">Stored only in this browser tab's session storage. Closing the tab clears it.</p>
    </section>

    <section class="panel request-panel" aria-labelledby="request-title">
      <div class="section-head">
        <div>
          <p class="step">02 · REQUEST</p>
          <h2 id="request-title">What should the mod change?</h2>
        </div>
      </div>

      <div class="examples" aria-labelledby="examples-title">
        <p id="examples-title" class="mini-title">Try a known-good tweak bundle</p>
        <div class="example-grid">
          <button type="button" class="example" data-prompt="Make assembling machine 2 twice as fast, make steel furnaces 50% faster, make iron gears cost one iron plate, and halve Automation research cost">
            <span class="example-kicker">Fast-start bundle</span>
            <span>Faster assemblers + furnaces, cheaper gears, cheaper Automation</span>
          </button>
          <button type="button" class="example" data-prompt="Double electric mining drill speed and double lab research speed">
            <span class="example-kicker">Production</span>
            <span>Double mining drill and lab speeds</span>
          </button>
          <button type="button" class="example" data-prompt="Make iron gears craft twice as fast, make transport belts produce 4 belts per craft, and set electronic circuit stack size to 500">
            <span class="example-kicker">Throughput bundle</span>
            <span>Faster gears, more belts per craft, bigger circuit stacks</span>
          </button>
          <button type="button" class="example" data-prompt="Remove Steel processing as a prerequisite for Automation 2">
            <span class="example-kicker">Prerequisite</span>
            <span>Remove Steel processing as a prerequisite for Automation 2</span>
          </button>
        </div>
      </div>

      <form id="generation-form">
        <div class="prompt-label-row">
          <label for="prompt">Or describe your own tweak bundle</label>
          <span id="prompt-count" class="muted">0 / 4000</span>
        </div>
        <textarea id="prompt" maxlength="4000" required placeholder="Example: Make my early game faster: double assembler 2 and mining drill speeds, halve Automation cost, and make gears cost one plate"></textarea>
        <div class="scope-grid">
          <div class="scope-card">
            <p class="scope-title">Good beta requests</p>
            <p>Combine reviewed machine speeds with selected recipe ingredients, crafting times, recipe outputs, item stack sizes, research costs, and reviewed prerequisites.</p>
          </div>
          <div class="scope-card muted-card">
            <p class="scope-title">Not supported yet</p>
            <p>New gameplay systems, <code>control.lua</code>, graphics/assets, arbitrary recipes, or Workshop publishing.</p>
          </div>
        </div>
        <div class="actions submit-row">
          <button id="generate" type="submit">Generate &amp; validate</button>
          <span id="request-state" class="muted" role="status" aria-live="polite">Supported tweak bundles usually finish in seconds.</span>
        </div>
      </form>
    </section>

    <section id="result-panel" class="panel result-panel hidden" aria-labelledby="result-title">
      <div class="result-head">
        <div>
          <p class="step">03 · RESULT</p>
          <h2 id="result-title">Generation result</h2>
        </div>
        <span id="status-badge" class="badge">queued</span>
      </div>

      <div id="progress" class="progress" aria-hidden="true">
        <span data-phase="queued">Queued</span>
        <span data-phase="running">Build + validate</span>
        <span data-phase="terminal">Result</span>
      </div>

      <p id="result-message" class="result-message"></p>
      <dl id="result-meta"></dl>

      <div id="result-actions" class="actions hidden">
        <button id="download" type="button">Download validated ZIP</button>
        <button id="retry" type="button" class="secondary hidden">Retry generation</button>
      </div>

      <div id="install-note" class="install-note hidden">
        <strong>Next:</strong> put the downloaded ZIP in your Factorio <code>mods</code> folder without unpacking it, then launch the game.
      </div>

      <div id="revision" class="feedback hidden">
        <p class="feedback-title">Refine this tweak bundle</p>
        <label for="revision-prompt">Describe what should change from this validated version</label>
        <textarea id="revision-prompt" maxlength="4000" placeholder="Example: Keep everything else, but make steel furnaces another 25% faster and restore Automation research cost to normal"></textarea>
        <div class="actions">
          <button id="revise" type="button" class="secondary">Revise &amp; validate</button>
          <span id="revision-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div id="feedback" class="feedback hidden">
        <p class="feedback-title">Did this result work for you?</p>
        <label for="feedback-note">Optional note</label>
        <textarea id="feedback-note" maxlength="2000" placeholder="What worked, or what should have been different?"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-rating="up">Yes, it worked</button>
          <button type="button" class="secondary" data-rating="down">No / needs work</button>
          <span id="feedback-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div id="survey" class="feedback hidden">
        <p class="feedback-title">One product question</p>
        <label>Would you pay for a service like this if it reliably generated the mods you wanted?</label>
        <div class="actions">
          <button type="button" class="secondary" data-wtp="yes">Yes</button>
          <button type="button" class="secondary" data-wtp="maybe">Maybe</button>
          <button type="button" class="secondary" data-wtp="no">No</button>
          <span id="survey-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>
    </section>

    <footer>
      Private beta · Factorio stable 2.0.x · Successful ZIPs are exposed only after automated runtime validation.
    </footer>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`;

const APP_CSS = String.raw`:root{
  color-scheme:dark;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:#090c0f;
  color:#eef2f5;
  --bg:#090c0f;
  --panel:#11171d;
  --panel-soft:#151c23;
  --line:#29343e;
  --line-strong:#394854;
  --text:#eef2f5;
  --muted:#93a1ad;
  --faint:#71808c;
  --accent:#f4a72c;
  --accent-soft:rgba(244,167,44,.12);
  --good:#9bd4ae;
  --bad:#f1a3a3;
  --warn:#e5cc87;
}
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100vh;
  background:
    radial-gradient(circle at 50% -10%,rgba(244,167,44,.11),transparent 34rem),
    linear-gradient(180deg,#0d1115 0,var(--bg) 34rem);
}
body:before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  opacity:.18;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:36px 36px;
  mask-image:linear-gradient(to bottom,black,transparent 70%);
}
.shell{width:min(900px,calc(100% - 36px));margin:0 auto;padding:72px 0 80px;position:relative}
.hero{margin-bottom:28px;max-width:820px}
.eyebrow,.step{margin:0 0 10px;font-size:11px;letter-spacing:.16em;font-weight:800;color:#c58c35}
h1{font-size:clamp(42px,7vw,72px);line-height:.98;letter-spacing:-.052em;margin:0 0 22px;max-width:800px}
h2{font-size:22px;letter-spacing:-.02em;margin:0}
.lede{max-width:740px;color:#aeb9c2;font-size:18px;line-height:1.6;margin:0}
.proof-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}
.proof-row span{font-size:12px;color:#b8c2ca;border:1px solid #2d3943;background:#10161b;border-radius:999px;padding:7px 10px}
.notice{display:grid;grid-template-columns:max-content 1fr;gap:16px;align-items:start;border:1px solid rgba(244,167,44,.28);background:var(--accent-soft);border-radius:14px;padding:15px 17px;margin:0 0 20px;color:#c7d0d7;font-size:14px;line-height:1.5}
.notice strong{color:#f2c06f}
.panel{background:rgba(17,23,29,.94);border:1px solid var(--line);border-radius:18px;padding:24px;margin:14px 0;box-shadow:0 24px 70px rgba(0,0,0,.24);backdrop-filter:blur(8px)}
.section-head,.result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
label{display:block;font-size:14px;font-weight:700;margin:0 0 8px}
input,textarea{width:100%;border:1px solid #35434f;background:#0c1116;color:#f2f5f7;border-radius:11px;padding:13px 14px;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
input:focus,textarea:focus{border-color:#c28a35;box-shadow:0 0 0 3px rgba(244,167,44,.10);background:#0e141a}
textarea{min-height:132px;resize:vertical;line-height:1.45}
#feedback-note{min-height:86px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px}
.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}
button{border:1px solid transparent;border-radius:10px;padding:11px 15px;font:inherit;font-size:14px;font-weight:750;cursor:pointer;background:#f0a62f;color:#19130a;transition:transform .12s,filter .12s,border-color .12s,background .12s}
button:hover{filter:brightness(1.06)}
button:active{transform:translateY(1px)}
button:focus-visible{outline:3px solid rgba(244,167,44,.24);outline-offset:2px}
button:disabled{opacity:.48;cursor:not-allowed;transform:none;filter:none}
.secondary{background:#25313a;color:#eef2f5;border-color:#33424e}
.ghost{background:transparent;color:#9eabb5;border-color:#2c3740}
.hint,.muted{font-size:13px;color:var(--muted)}
.hint{margin:9px 0 0}
.access-state{font-size:12px;color:var(--faint);border:1px solid #2d3943;border-radius:999px;padding:6px 9px;white-space:nowrap}
.access-state.ready{color:var(--good);border-color:#365b43;background:rgba(80,150,103,.08)}
.examples{border-bottom:1px solid #28323b;padding-bottom:22px;margin-bottom:22px}
.mini-title{font-size:13px;font-weight:750;color:#bac5cd;margin:0 0 10px}
.example-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.example{display:flex;flex-direction:column;align-items:flex-start;gap:5px;text-align:left;background:#121a21;color:#dce3e8;border:1px solid #2d3943;padding:13px 14px;min-height:74px}
.example:hover{background:#182129;border-color:#455560;filter:none}
.example-kicker{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#c58c35}
.prompt-label-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.scope-card{border:1px solid #2d3943;background:#111920;border-radius:11px;padding:12px 13px}
.scope-card p{margin:0;font-size:12px;line-height:1.55;color:#aeb9c1}
.scope-card .scope-title{color:#dce3e8;font-weight:750;margin-bottom:4px}
.muted-card{background:#10151a}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;color:#d4dde4}
.submit-row{min-height:42px}
.badge{border:1px solid #3a4857;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#bac4cc;white-space:nowrap}
.badge.succeeded{border-color:#3f765b;color:#a8e2bf;background:rgba(63,118,91,.08)}
.badge.failed{border-color:#874b4b;color:#f0aaaa;background:rgba(135,75,75,.08)}
.badge.unsupported{border-color:#7f7047;color:#ead395;background:rgba(127,112,71,.08)}
.progress{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:6px;margin:6px 0 20px}
.progress span{position:relative;border-top:3px solid #303b44;padding-top:8px;color:#63717c;font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:750}
.progress span.active{border-color:#d2912c;color:#e3b66f}
.progress span.done{border-color:#527860;color:#9bc2a7}
.result-message{font-size:16px;line-height:1.55;margin:0 0 14px;color:#dbe2e7}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 15px;margin:14px 0;color:#aeb8c4;font-size:13px}
dt{color:#71808c}
dd{margin:0;overflow-wrap:anywhere;color:#c7d0d7}
.install-note{margin-top:14px;border:1px solid #36513e;background:rgba(74,122,88,.09);border-radius:11px;padding:12px 13px;color:#bcd2c3;font-size:13px;line-height:1.5}
.feedback{border-top:1px solid #29333e;margin-top:22px;padding-top:20px}
.feedback-title{font-size:14px;font-weight:800;margin:0 0 12px;color:#dbe2e7}
.hidden{display:none!important}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
footer{margin-top:24px;color:#65737e;font-size:11px;line-height:1.5;text-align:center}
@media(max-width:700px){
  .shell{width:min(100% - 20px,900px);padding-top:38px}
  .panel{padding:19px}
  .notice{grid-template-columns:1fr;gap:4px}
  .row{grid-template-columns:1fr 1fr}
  .row input{grid-column:1/-1}
  .example-grid,.scope-grid{grid-template-columns:1fr}
  .lede{font-size:16px}
}
@media(max-width:430px){
  .row{grid-template-columns:1fr}
  .row input{grid-column:auto}
  .section-head,.result-head{align-items:flex-start}
  .proof-row{gap:6px}
}`;

const APP_JS = String.raw`(() => {
  const TOKEN_KEY = "project.betaToken";
  const tokenInput = document.querySelector("#token");
  const saveToken = document.querySelector("#save-token");
  const clearToken = document.querySelector("#clear-token");
  const accessState = document.querySelector("#access-state");
  const form = document.querySelector("#generation-form");
  const promptInput = document.querySelector("#prompt");
  const promptCount = document.querySelector("#prompt-count");
  const generateButton = document.querySelector("#generate");
  const requestState = document.querySelector("#request-state");
  const resultPanel = document.querySelector("#result-panel");
  const statusBadge = document.querySelector("#status-badge");
  const resultMeta = document.querySelector("#result-meta");
  const resultMessage = document.querySelector("#result-message");
  const resultActions = document.querySelector("#result-actions");
  const installNote = document.querySelector("#install-note");
  const downloadButton = document.querySelector("#download");
  const retryButton = document.querySelector("#retry");
  const revision = document.querySelector("#revision");
  const revisionPrompt = document.querySelector("#revision-prompt");
  const reviseButton = document.querySelector("#revise");
  const revisionState = document.querySelector("#revision-state");
  const feedback = document.querySelector("#feedback");
  const feedbackNote = document.querySelector("#feedback-note");
  const feedbackState = document.querySelector("#feedback-state");
  const survey = document.querySelector("#survey");
  const surveyState = document.querySelector("#survey-state");
  const progress = document.querySelector("#progress");
  let generationId = null;
  let pollTimer = null;

  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) tokenInput.value = stored;

  function setAccessState(ready, text) {
    accessState.textContent = text;
    accessState.classList.toggle("ready", ready);
  }

  setAccessState(Boolean(stored), stored ? "Ready" : "Not saved");

  function updatePromptCount() {
    promptCount.textContent = String(promptInput.value.length) + " / 4000";
  }

  updatePromptCount();
  promptInput.addEventListener("input", updatePromptCount);

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      promptInput.value = button.dataset.prompt || "";
      updatePromptCount();
      promptInput.focus();
      requestState.textContent = "Example loaded. Edit it or generate as-is.";
    });
  });

  function token() {
    return tokenInput.value.trim() || sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function authHeaders(extra = {}) {
    const value = token();
    if (!value) throw new Error("Enter your beta token first.");
    return { Authorization: "Bearer " + value, ...extra };
  }

  function friendlyError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Authentication required") return "Beta token is missing or invalid.";
    if (message === "Too many requests") return "Rate limit reached. Try again after the cooldown.";
    return message;
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

  function capabilityLabel(value) {
    const labels = {
      prototype_property: "Prototype property",
      recipe_ingredient: "Recipe ingredient",
      recipe_crafting_time: "Recipe crafting time",
      recipe_result: "Recipe result",
      item_stack_size: "Item stack size",
      technology_cost: "Research cost",
      technology_prerequisite: "Research prerequisite",
      mixed: "Tweak bundle",
    };
    return labels[value] || value;
  }

  function fileSize(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;
    if (bytes < 1024) return String(bytes) + " B";
    return (bytes / 1024).toFixed(1) + " KiB";
  }

  function renderProgress(status) {
    const terminal = ["succeeded", "failed", "unsupported"].includes(status);
    progress.querySelectorAll("span").forEach((item) => item.classList.remove("active", "done"));
    const queued = progress.querySelector('[data-phase="queued"]');
    const running = progress.querySelector('[data-phase="running"]');
    const result = progress.querySelector('[data-phase="terminal"]');
    if (status === "queued") queued.classList.add("active");
    else if (status === "running") {
      queued.classList.add("done");
      running.classList.add("active");
    } else if (terminal) {
      queued.classList.add("done");
      running.classList.add(status === "succeeded" ? "done" : "active");
      result.classList.add(status === "succeeded" ? "done" : "active");
    }
  }

  function render(record) {
    resultPanel.classList.remove("hidden");
    statusBadge.textContent = record.status;
    statusBadge.className = "badge " + record.status;
    renderProgress(record.status);
    resultMeta.replaceChildren();
    addMeta("Generation", record.id);
    if (record.modSpec && record.modSpec.capability) addMeta("Capability", capabilityLabel(record.modSpec.capability));
    if (record.telemetry && typeof record.telemetry.durationMs === "number") addMeta("Total time", (record.telemetry.durationMs / 1000).toFixed(1) + " s");
    if (record.telemetry && record.telemetry.validation && typeof record.telemetry.validation.finalDurationMs === "number") addMeta("Factorio check", (record.telemetry.validation.finalDurationMs / 1000).toFixed(1) + " s");
    if (record.artifact && record.artifact.fileName) addMeta("Artifact", record.artifact.fileName);
    const size = record.artifact ? fileSize(record.artifact.sizeBytes) : null;
    if (size) addMeta("ZIP size", size);

    const canDownload = record.status === "succeeded";
    const canRetry = record.status === "failed" && record.error && record.error.retryable === true;
    resultActions.classList.toggle("hidden", !canDownload && !canRetry);
    downloadButton.classList.toggle("hidden", !canDownload);
    retryButton.classList.toggle("hidden", !canRetry);
    installNote.classList.toggle("hidden", !canDownload);
    revision.classList.toggle("hidden", record.status !== "succeeded");
    const terminal = ["succeeded", "failed", "unsupported"].includes(record.status);
    feedback.classList.toggle("hidden", !terminal);
    survey.classList.toggle("hidden", record.status !== "succeeded");

    if (record.status === "queued") {
      resultMessage.textContent = "Request received. It is waiting for the generation worker.";
    } else if (record.status === "running") {
      resultMessage.textContent = "Building the mod and checking every requested change in real Factorio…";
    } else if (record.status === "succeeded") {
      resultMessage.textContent = "Validated successfully in Factorio. Your installable ZIP is ready.";
    } else if (record.status === "unsupported") {
      const reason = record.reason || "This request is outside the current supported scope.";
      resultMessage.textContent = reason + " Try a supported tweak bundle or one of the examples above.";
    } else if (record.status === "failed") {
      const message = record.error && record.error.message ? record.error.message : "Generation failed.";
      resultMessage.textContent = canRetry ? message + " This failure is retryable; you can start a fresh generation below." : message;
    }

    return terminal;
  }

  async function poll() {
    if (!generationId) return;
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId));
      const terminal = render(body.generation);
      if (terminal) {
        generateButton.disabled = false;
        requestState.textContent = "Generation finished.";
        pollTimer = null;
        return;
      }
      pollTimer = window.setTimeout(poll, 1000);
    } catch (error) {
      requestState.textContent = friendlyError(error);
      generateButton.disabled = false;
      pollTimer = null;
    }
  }

  saveToken.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    if (!value) {
      setAccessState(false, "Not saved");
      requestState.textContent = "Enter a beta token first.";
      tokenInput.focus();
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, value);
    setAccessState(true, "Ready");
    requestState.textContent = "Beta access saved for this tab.";
  });

  clearToken.addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    setAccessState(false, "Not saved");
    requestState.textContent = "Beta token cleared.";
    tokenInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!token()) {
      requestState.textContent = "Enter your beta token before generating.";
      tokenInput.focus();
      return;
    }
    if (!promptInput.value.trim()) {
      requestState.textContent = "Describe the Factorio change you want first.";
      promptInput.focus();
      return;
    }
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    generationId = null;
    feedbackState.textContent = "";
    surveyState.textContent = "";
    revisionState.textContent = "";
    revisionPrompt.value = "";
    feedbackNote.value = "";
    resultPanel.classList.add("hidden");
    generateButton.disabled = true;
    requestState.textContent = "Submitting request…";
    try {
      const body = await api("/v1/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptInput.value.trim() }),
      });
      generationId = body.generation.id;
      render(body.generation);
      resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      requestState.textContent = "Generation in progress…";
      pollTimer = window.setTimeout(poll, 500);
    } catch (error) {
      requestState.textContent = friendlyError(error);
      generateButton.disabled = false;
    }
  });

  retryButton.addEventListener("click", async () => {
    if (!generationId) return;
    retryButton.disabled = true;
    requestState.textContent = "Starting a fresh generation…";
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId) + "/retry", {
        method: "POST",
      });
      generationId = body.generation.id;
      revisionPrompt.value = "";
      feedbackState.textContent = "";
      surveyState.textContent = "";
      render(body.generation);
      generateButton.disabled = true;
      requestState.textContent = "Generation in progress…";
      pollTimer = window.setTimeout(poll, 500);
    } catch (error) {
      requestState.textContent = friendlyError(error);
    } finally {
      retryButton.disabled = false;
    }
  });

  reviseButton.addEventListener("click", async () => {
    if (!generationId) return;
    const prompt = revisionPrompt.value.trim();
    if (!prompt) {
      revisionState.textContent = "Describe what you want to change from this version.";
      revisionPrompt.focus();
      return;
    }
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    reviseButton.disabled = true;
    revisionState.textContent = "Submitting revision…";
    requestState.textContent = "Starting a revised generation…";
    try {
      const sourceGenerationId = generationId;
      const body = await api("/v1/generations/" + encodeURIComponent(sourceGenerationId) + "/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      generationId = body.generation.id;
      revisionPrompt.value = "";
      feedbackState.textContent = "";
      surveyState.textContent = "";
      revisionState.textContent = "Revision queued from " + sourceGenerationId + ".";
      render(body.generation);
      generateButton.disabled = true;
      requestState.textContent = "Revised generation in progress…";
      pollTimer = window.setTimeout(poll, 500);
    } catch (error) {
      revisionState.textContent = friendlyError(error);
    } finally {
      reviseButton.disabled = false;
    }
  });

  downloadButton.addEventListener("click", async () => {
    if (!generationId) return;
    downloadButton.disabled = true;
    downloadButton.textContent = "Preparing download…";
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId) + "/download", {
        headers: { Accept: "application/json" },
      });
      window.location.assign(body.downloadUrl);
    } catch (error) {
      resultMessage.textContent = friendlyError(error);
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = "Download validated ZIP";
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
        feedbackState.textContent = "Feedback saved. Thank you.";
      } catch (error) {
        feedbackState.textContent = friendlyError(error);
      }
    });
  });

  survey.querySelectorAll("[data-wtp]").forEach((button) => {
    button.addEventListener("click", async () => {
      surveyState.textContent = "Saving…";
      try {
        await api("/v1/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ willingnessToPay: button.dataset.wtp }),
        });
        surveyState.textContent = "Answer saved. Thank you.";
      } catch (error) {
        surveyState.textContent = friendlyError(error);
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
