import type { IncomingMessage, ServerResponse } from "node:http";

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Private beta for building personal, validated Factorio 2.0 tweak bundles from natural-language requests.">
  <title>Factorio Mod Beta</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <main class="shell">
    <nav class="topbar" aria-label="Page controls">
      <span class="product-mark">FACTORIO MOD BETA</span>
      <div class="language-switch" role="group" aria-label="Language">
        <button type="button" class="lang-button" data-lang-select="en" aria-pressed="true">EN</button>
        <button type="button" class="lang-button" data-lang-select="ru" aria-pressed="false">RU</button>
      </div>
    </nav>

    <header class="hero">
      <p class="eyebrow" data-i18n="hero.eyebrow">FACTORIO 2.0 · PRIVATE BETA</p>
      <h1 data-i18n="hero.title">Make Factorio play your way.</h1>
      <p class="lede" data-i18n="hero.lede">Describe the mod you want in normal language — rebalance the game or create new reviewed machines and recipes. Get one installable ZIP that has already been loaded and checked in Factorio.</p>
      <div class="proof-row" aria-label="Beta guarantees">
        <span data-i18n="proof.noCode">No Lua required</span>
        <span data-i18n="proof.multi">Several tweaks in one mod</span>
        <span data-i18n="proof.validated">Checked in real Factorio</span>
      </div>
    </header>

    <section class="workflow" aria-label="How it works">
      <article class="workflow-card">
        <span>1</span>
        <div><strong data-i18n="workflow.describe.title">Describe</strong><p data-i18n="workflow.describe.body">Tell us what you want to change or add.</p></div>
      </article>
      <article class="workflow-card">
        <span>2</span>
        <div><strong data-i18n="workflow.build.title">We build & check</strong><p data-i18n="workflow.build.body">The service creates the mod and validates the requested changes.</p></div>
      </article>
      <article class="workflow-card">
        <span>3</span>
        <div><strong data-i18n="workflow.install.title">Install</strong><p data-i18n="workflow.install.body">Download one ZIP and put it in your Factorio mods folder.</p></div>
      </article>
    </section>

    <section class="notice" aria-label="Beta scope notice">
      <div class="notice-icon" aria-hidden="true">i</div>
      <div>
        <strong data-i18n="notice.title">What this beta is good at</strong>
        <p data-i18n="notice.body">Personal base-game mods: rebalance existing content or create a new reviewed assembling machine/electric furnace with its own item, recipe and technology unlock. If part of your request is outside the reviewed scope, we reject the whole request instead of pretending it worked.</p>
        <p class="notice-boundary" data-i18n="notice.boundary">Validation runs in isolated base-game Factorio 2.0.77. Compatibility with Space Age or your third-party mod stack is not guaranteed yet.</p>
      </div>
    </section>

    <section class="panel access-panel" aria-labelledby="auth-title">
      <div class="section-head">
        <div>
          <p class="step" data-i18n="access.step">01 · BETA ACCESS</p>
          <h2 id="auth-title" data-i18n="access.title">Paste your invite token</h2>
          <p class="section-copy" data-i18n="access.copy">You only need to do this once per browser tab.</p>
        </div>
        <span id="access-state" class="access-state" role="status" aria-live="polite">Not saved</span>
      </div>
      <label class="sr-only" for="token" data-i18n="access.label">Beta token</label>
      <div class="row token-row">
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste beta token" data-i18n-placeholder="access.placeholder">
        <button id="save-token" type="button" class="secondary" data-i18n="access.save">Use token</button>
        <button id="clear-token" type="button" class="ghost" data-i18n="access.clear">Clear</button>
      </div>
      <p class="hint" data-i18n="access.hint">The token is kept only in this tab and disappears when the tab is closed.</p>
    </section>

    <section class="panel request-panel" aria-labelledby="request-title">
      <div class="section-head">
        <div>
          <p class="step" data-i18n="request.step">02 · DESCRIBE YOUR MOD</p>
          <h2 id="request-title" data-i18n="request.title">What should change?</h2>
          <p class="section-copy" data-i18n="request.copy">Write one change or combine several. You can refine the result later.</p>
        </div>
      </div>

      <div class="examples" aria-labelledby="examples-title">
        <p id="examples-title" class="mini-title" data-i18n="examples.title">Start with an example</p>
        <div class="example-grid">
          <button type="button" class="example example-featured" data-prompt-en="Create a new machine called Advanced Electric Furnace based on the electric furnace. Set crafting speed to 4, energy use to 540 kW, module slots to 4 and stack size to 50. Recipe: 10 steel plates, 5 advanced circuits and 10 stone bricks, 5 seconds. Unlock it with a new technology called Advanced Electric Furnace after Advanced material processing 2, using chemical science, 300 packs and 30 seconds." data-prompt-ru="Создай новую машину «Улучшенная электрическая печь» на основе электрической печи. Скорость крафта 4, энергопотребление 540 кВт, 4 слота модулей, размер стака 50. Рецепт: 10 стальных пластин, 5 улучшенных схем и 10 каменных кирпичей, время 5 секунд. Открой её новой технологией «Улучшенная электрическая печь» после Продвинутой обработки материалов 2, химический уровень науки, стоимость 300 пакетов, время 30 секунд.">
            <span class="example-kicker" data-i18n="example.machine.kicker">NEW CONTENT</span>
            <span data-i18n="example.machine.body">Create a new machine with its own recipe and technology</span>
          </button>
          <button type="button" class="example example-featured" data-prompt-en="Create a new intermediate item called Reinforced Plate based on the steel plate. Stack size 100. Recipe: 2 steel plates and 5 plastic bars make 1 Reinforced Plate in 2 seconds, unlocked by Advanced material processing 2. Then create a new machine called Reinforced Furnace based on the electric furnace: speed 4, energy use 500 kW, 4 module slots, stack size 50. Recipe: 1 electric furnace, 10 Reinforced Plates and 5 processing units, 6 seconds. Unlock it with Advanced material processing 2." data-prompt-ru="Создай новый промежуточный предмет «Усиленная пластина» на основе стальной пластины. Размер стака 100. Рецепт: 2 стальные пластины и 5 пластиковых брусков дают 1 Усиленную пластину за 2 секунды, открыть технологией «Продвинутая обработка материалов 2». Затем создай новую машину «Усиленная печь» на основе электрической печи: скорость 4, энергопотребление 500 кВт, 4 слота модулей, размер стака 50. Рецепт: 1 электрическая печь, 10 Усиленных пластин и 5 процессоров, 6 секунд. Открыть технологией «Продвинутая обработка материалов 2».">
            <span class="example-kicker" data-i18n="example.chain.kicker">CONTENT CHAIN</span>
            <span data-i18n="example.chain.body">Create a new material and use it in a new machine</span>
          </button>
          <button type="button" class="example" data-prompt-en="Create a new recipe called Steel Gears: 1 steel plate makes 5 iron gears in 1 second, unlocked by Steel processing." data-prompt-ru="Создай новый рецепт «Стальные шестерни»: 1 стальная пластина даёт 5 железных шестерён за 1 секунду, открыть технологией «Обработка стали».">
            <span class="example-kicker" data-i18n="example.recipe.kicker">ALT RECIPE</span>
            <span data-i18n="example.recipe.body">Add a new alternative recipe for an existing item</span>
          </button>
          <button type="button" class="example" data-prompt-en="Make assembling machine 2 twice as fast, make steel furnaces 50% faster, make iron gears cost one iron plate, and halve Automation research cost" data-prompt-ru="Ускорь сборочный автомат 2 в 2 раза, стальные печи на 50%, сделай железные шестерни по 1 железной пластине и уменьши стоимость исследования Автоматизации вдвое">
            <span class="example-kicker" data-i18n="example.fast.kicker">FAST START</span>
            <span data-i18n="example.fast.body">Faster production, cheaper gears and research</span>
          </button>
          <button type="button" class="example" data-prompt-en="Double electric mining drill speed and double lab research speed" data-prompt-ru="Увеличь скорость электрического бура в 2 раза и скорость исследования лаборатории в 2 раза">
            <span class="example-kicker" data-i18n="example.production.kicker">PRODUCTION</span>
            <span data-i18n="example.production.body">Double mining and lab speed</span>
          </button>
          <button type="button" class="example" data-prompt-en="Make iron gears craft twice as fast, make transport belts produce 4 belts per craft, and set electronic circuit stack size to 500" data-prompt-ru="Сделай железные шестерни в 2 раза быстрее в производстве, пусть рецепт конвейера выдаёт 4 конвейера, а размер стака электронных схем будет 500">
            <span class="example-kicker" data-i18n="example.throughput.kicker">THROUGHPUT</span>
            <span data-i18n="example.throughput.body">Faster gears, more belts, larger stacks</span>
          </button>
          <button type="button" class="example" data-prompt-en="Remove Steel processing as a prerequisite for Automation 2" data-prompt-ru="Убери Обработку стали из требований для Автоматизации 2">
            <span class="example-kicker" data-i18n="example.tech.kicker">RESEARCH</span>
            <span data-i18n="example.tech.body">Change a reviewed technology prerequisite</span>
          </button>
        </div>
      </div>

      <form id="generation-form">
        <div class="prompt-label-row">
          <label for="prompt" data-i18n="request.promptLabel">Describe your tweak pack</label>
          <span id="prompt-count" class="muted">0 / 4000</span>
        </div>
        <textarea id="prompt" maxlength="4000" required placeholder="Example: Double assembler 2 and mining drill speeds, halve Automation cost, and make gears cost one plate" data-i18n-placeholder="request.placeholder"></textarea>

        <details class="scope-details">
          <summary data-i18n="scope.summary">What can I change right now?</summary>
          <div class="scope-grid">
            <div class="scope-card">
              <p class="scope-title" data-i18n="scope.yesTitle">Works well in this beta</p>
              <p data-i18n="scope.yesBody">Selected rebalance changes, new intermediate materials, alternative item-only recipes, plus reviewed assemblers, electric furnaces, mining drills, labs, chemical plants, oil refineries and centrifuges. New materials can feed new recipes/machines in the same mod.</p>
            </div>
            <div class="scope-card muted-card">
              <p class="scope-title" data-i18n="scope.noTitle">Not supported yet</p>
              <p data-i18n="scope.noBody">Arbitrary entity types or gameplay systems, runtime control.lua logic, custom graphics/assets, unreviewed item/entity types, fluid recipes, Space Age-specific content, or Workshop publishing.</p>
            </div>
          </div>
        </details>

        <div class="actions submit-row">
          <button id="generate" type="submit" class="primary-action" data-i18n="request.generate">Build my mod</button>
          <span id="request-state" class="muted" role="status" aria-live="polite" data-i18n="request.ready">Most supported requests finish in seconds.</span>
        </div>
      </form>
    </section>

    <section id="history-panel" class="panel history-panel hidden" aria-labelledby="history-title">
      <div class="section-head compact-head">
        <div>
          <p class="step" data-i18n="history.step">RECENT</p>
          <h2 id="history-title" data-i18n="history.title">Your recent mods</h2>
        </div>
        <button id="refresh-history" type="button" class="ghost" data-i18n="history.refresh">Refresh</button>
      </div>
      <div id="history-list" class="history-list"></div>
    </section>

    <section id="result-panel" class="panel result-panel hidden" aria-labelledby="result-title">
      <div class="result-head">
        <div>
          <p class="step" data-i18n="result.step">03 · YOUR MOD</p>
          <h2 id="result-title" data-i18n="result.title">Generation result</h2>
        </div>
        <span id="status-badge" class="badge">queued</span>
      </div>

      <div id="progress" class="progress" aria-hidden="true">
        <span data-phase="queued" data-i18n="progress.queued">Queued</span>
        <span data-phase="running" data-i18n="progress.running">Build + check</span>
        <span data-phase="terminal" data-i18n="progress.done">Ready</span>
      </div>

      <p id="result-message" class="result-message"></p>
      <dl id="result-meta"></dl>

      <div id="change-summary" class="change-summary hidden">
        <p class="feedback-title" data-i18n="result.changes">What the mod changes</p>
        <ul id="change-list" class="change-list"></ul>
      </div>

      <div id="revision-diff-summary" class="change-summary hidden">
        <p class="feedback-title" data-i18n="result.diff">What changed in this revision</p>
        <ul id="revision-diff-list" class="change-list"></ul>
      </div>

      <div id="result-actions" class="actions hidden">
        <button id="download" type="button" class="primary-action" data-i18n="result.download">Download mod ZIP</button>
        <button id="retry" type="button" class="secondary hidden" data-i18n="result.retry">Try again</button>
      </div>

      <div id="install-note" class="install-note hidden" data-i18n-html="result.installNote">
        <strong>Install:</strong> put the ZIP in your Factorio <code>mods</code> folder without unpacking it, then launch the game. This build was checked against isolated base-game Factorio 2.0.77; your own mod stack still needs an in-game check.
      </div>

      <div id="revision" class="feedback hidden">
        <p class="feedback-title" data-i18n="revision.title">Want to change it?</p>
        <label for="revision-prompt" data-i18n="revision.label">Describe the next version in normal language</label>
        <textarea id="revision-prompt" maxlength="4000" placeholder="Example: Keep everything else, but make steel furnaces another 25% faster and restore Automation research cost to normal" data-i18n-placeholder="revision.placeholder"></textarea>
        <div class="actions">
          <button id="revise" type="button" class="secondary" data-i18n="revision.button">Update & check again</button>
          <span id="revision-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div id="feedback" class="feedback hidden">
        <p class="feedback-title" data-i18n="feedback.title">Did the result match what you wanted?</p>
        <label for="feedback-note" data-i18n="feedback.label">Optional note</label>
        <textarea id="feedback-note" maxlength="2000" placeholder="Tell us what worked or what should have been different" data-i18n-placeholder="feedback.placeholder"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-rating="up" data-i18n="feedback.up">Yes</button>
          <button type="button" class="secondary" data-rating="down" data-i18n="feedback.down">No / needs work</button>
          <span id="feedback-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>

      <div id="survey" class="feedback hidden">
        <p class="feedback-title" data-i18n="survey.title">One product question</p>
        <p class="survey-copy" data-i18n="survey.question">If this reliably made the personal mods you wanted, would you pay for it?</p>
        <div class="actions">
          <button type="button" class="secondary" data-wtp="yes" data-i18n="survey.yes">Yes</button>
          <button type="button" class="secondary" data-wtp="maybe" data-i18n="survey.maybe">Maybe</button>
          <button type="button" class="secondary" data-wtp="no" data-i18n="survey.no">No</button>
          <span id="survey-state" class="muted" role="status" aria-live="polite"></span>
        </div>
      </div>
    </section>

    <footer data-i18n="footer">Private beta · Factorio stable 2.0.x · ZIPs are offered only after automated runtime validation.</footer>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`;

const APP_CSS = String.raw`:root{
  color-scheme:dark;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:#080b0e;
  color:#eef2f5;
  --bg:#080b0e;--panel:#11171d;--panel-soft:#151c23;--line:#29343e;--line-strong:#394854;
  --text:#eef2f5;--muted:#96a3ad;--faint:#71808c;--accent:#f4a72c;--accent-soft:rgba(244,167,44,.11);
  --good:#9bd4ae;--bad:#f1a3a3;--warn:#e5cc87;
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -8%,rgba(244,167,44,.13),transparent 34rem),linear-gradient(180deg,#0d1115 0,var(--bg) 35rem)}
body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.15;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(to bottom,black,transparent 72%)}
.shell{width:min(940px,calc(100% - 36px));margin:0 auto;padding:28px 0 80px;position:relative}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:58px}
.product-mark{font-size:11px;letter-spacing:.16em;font-weight:850;color:#9ca8b1}
.language-switch{display:flex;gap:3px;padding:3px;border:1px solid #29343e;background:#0c1116;border-radius:10px}
.lang-button{padding:6px 10px;border:0;background:transparent;color:#7f8d98;border-radius:7px;font-size:11px;letter-spacing:.08em}
.lang-button[aria-pressed="true"]{background:#273039;color:#f1f4f6}
.hero{margin-bottom:28px;max-width:850px}
.eyebrow,.step{margin:0 0 10px;font-size:11px;letter-spacing:.16em;font-weight:800;color:#c58c35}
h1{font-size:clamp(44px,7vw,74px);line-height:.98;letter-spacing:-.052em;margin:0 0 22px;max-width:820px}
h2{font-size:23px;letter-spacing:-.025em;margin:0}
.lede{max-width:750px;color:#b1bcc5;font-size:18px;line-height:1.62;margin:0}
.proof-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}.proof-row span{font-size:12px;color:#bec7ce;border:1px solid #2d3943;background:#10161b;border-radius:999px;padding:7px 10px}
.workflow{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:26px 0 16px}
.workflow-card{display:flex;gap:12px;align-items:flex-start;border:1px solid #27323b;background:rgba(14,20,25,.8);border-radius:14px;padding:14px 15px}
.workflow-card>span{display:grid;place-items:center;flex:0 0 28px;height:28px;border-radius:50%;background:var(--accent-soft);color:#e5af58;font-size:12px;font-weight:850}
.workflow-card strong{display:block;font-size:13px;color:#dde4e9;margin:1px 0 3px}.workflow-card p{margin:0;font-size:12px;line-height:1.45;color:#8796a1}
.notice{display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:start;border:1px solid rgba(244,167,44,.25);background:var(--accent-soft);border-radius:14px;padding:15px 16px;margin:0 0 20px;color:#c7d0d7;font-size:13px;line-height:1.52}
.notice-icon{display:grid;place-items:center;width:24px;height:24px;border:1px solid rgba(244,167,44,.4);border-radius:50%;color:#e7b565;font-weight:850}.notice strong{color:#f1c16f}.notice p{margin:3px 0 0}.notice-boundary{color:#9eaab3!important}
.panel{background:rgba(17,23,29,.95);border:1px solid var(--line);border-radius:18px;padding:24px;margin:14px 0;box-shadow:0 24px 70px rgba(0,0,0,.22);backdrop-filter:blur(8px)}
.section-head,.result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}.compact-head{margin-bottom:14px}
.section-copy{margin:7px 0 0;color:#8796a1;font-size:13px;line-height:1.45}
label{display:block;font-size:14px;font-weight:700;margin:0 0 8px}input,textarea{width:100%;border:1px solid #35434f;background:#0c1116;color:#f2f5f7;border-radius:11px;padding:13px 14px;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
input:focus,textarea:focus{border-color:#c28a35;box-shadow:0 0 0 3px rgba(244,167,44,.10);background:#0e141a}textarea{min-height:138px;resize:vertical;line-height:1.48}#feedback-note{min-height:86px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}
button{border:1px solid transparent;border-radius:10px;padding:11px 15px;font:inherit;font-size:14px;font-weight:760;cursor:pointer;background:#f0a62f;color:#19130a;transition:transform .12s,filter .12s,border-color .12s,background .12s}button:hover{filter:brightness(1.06)}button:active{transform:translateY(1px)}button:focus-visible{outline:3px solid rgba(244,167,44,.24);outline-offset:2px}button:disabled{opacity:.48;cursor:not-allowed;transform:none;filter:none}
.primary-action{min-height:44px;padding-inline:20px}.secondary{background:#25313a;color:#eef2f5;border-color:#33424e}.ghost{background:transparent;color:#9eabb5;border-color:#2c3740}
.hint,.muted{font-size:13px;color:var(--muted)}.hint{margin:9px 0 0}.access-state{font-size:12px;color:var(--faint);border:1px solid #2d3943;border-radius:999px;padding:6px 9px;white-space:nowrap}.access-state.ready{color:var(--good);border-color:#365b43;background:rgba(80,150,103,.08)}
.examples{border-bottom:1px solid #28323b;padding-bottom:22px;margin-bottom:22px}.mini-title{font-size:13px;font-weight:760;color:#bac5cd;margin:0 0 10px}.example-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.example{display:flex;flex-direction:column;align-items:flex-start;gap:5px;text-align:left;background:#121a21;color:#dce3e8;border:1px solid #2d3943;padding:13px 14px;min-height:76px}.example:hover{background:#182129;border-color:#455560;filter:none}.example-featured{grid-column:1/-1;border-color:rgba(244,167,44,.38);background:linear-gradient(135deg,rgba(244,167,44,.10),#121a21 55%)}.example-kicker{font-size:10px;letter-spacing:.12em;color:#c58c35}
.prompt-label-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.scope-details{margin-top:12px;border:1px solid #29343e;border-radius:11px;background:#0f151a}.scope-details summary{cursor:pointer;padding:11px 13px;color:#aeb9c1;font-size:12px;font-weight:720}.scope-details[open] summary{border-bottom:1px solid #29343e}.scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}.scope-card{border:1px solid #2d3943;background:#111920;border-radius:10px;padding:12px 13px}.scope-card p{margin:0;font-size:12px;line-height:1.55;color:#aeb9c1}.scope-card .scope-title{color:#dce3e8;font-weight:760;margin-bottom:4px}.muted-card{background:#10151a}.submit-row{min-height:46px}
.history-list{display:grid;gap:8px}.history-item{display:grid;grid-template-columns:1fr auto;gap:6px 14px;width:100%;text-align:left;background:#10171d;color:#dce3e8;border:1px solid #2d3943;padding:11px 13px}.history-item:hover{background:#172027;border-color:#455560;filter:none}.history-prompt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}.history-meta{font-size:11px;color:#83919c;white-space:nowrap}
.badge{border:1px solid #3a4857;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#bac4cc;white-space:nowrap}.badge.succeeded{border-color:#3f765b;color:#a8e2bf;background:rgba(63,118,91,.08)}.badge.failed{border-color:#874b4b;color:#f0aaaa;background:rgba(135,75,75,.08)}.badge.unsupported{border-color:#7f7047;color:#ead395;background:rgba(127,112,71,.08)}
.progress{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:6px;margin:6px 0 20px}.progress span{position:relative;border-top:3px solid #303b44;padding-top:8px;color:#63717c;font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:750}.progress span.active{border-color:#d2912c;color:#e3b66f}.progress span.done{border-color:#527860;color:#9bc2a7}.result-message{font-size:16px;line-height:1.55;margin:0 0 14px;color:#dbe2e7}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 15px;margin:14px 0;color:#aeb8c4;font-size:13px}dt{color:#71808c}dd{margin:0;overflow-wrap:anywhere;color:#c7d0d7}.install-note{margin-top:14px;border:1px solid #36513e;background:rgba(74,122,88,.09);border-radius:11px;padding:12px 13px;color:#bcd2c3;font-size:13px;line-height:1.5}
.change-summary{border:1px solid #2d3943;background:#0f161c;border-radius:11px;padding:13px 14px;margin:14px 0}.change-list{margin:0;padding-left:19px;color:#c8d2d9;font-size:13px;line-height:1.6}.change-list li+li{margin-top:4px}.diff-kind{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#c58c35;margin-right:7px}.feedback{border-top:1px solid #29333e;margin-top:22px;padding-top:20px}.feedback-title{font-size:14px;font-weight:800;margin:0 0 12px;color:#dbe2e7}.survey-copy{font-size:13px;color:#aeb9c1;line-height:1.5;margin:0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;color:#d4dde4}.hidden{display:none!important}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}footer{margin-top:28px;color:#65737e;font-size:11px;line-height:1.5;text-align:center}
@media(max-width:760px){.shell{width:min(100% - 20px,940px);padding-top:20px}.topbar{margin-bottom:38px}.panel{padding:19px}.workflow{grid-template-columns:1fr}.row{grid-template-columns:1fr 1fr}.row input{grid-column:1/-1}.example-grid,.scope-grid{grid-template-columns:1fr}.lede{font-size:16px}.notice{grid-template-columns:24px 1fr}}
@media(max-width:430px){.row{grid-template-columns:1fr}.row input{grid-column:auto}.section-head,.result-head{align-items:flex-start}.proof-row{gap:6px}.history-item{grid-template-columns:1fr}.history-meta{white-space:normal}}
`;

const APP_JS = String.raw`(() => {
  const TOKEN_KEY = "project.betaToken";
  const LANGUAGE_KEY = "project.language";
  const dictionaries = {
    en: {
      "page.title":"Factorio Mod Beta",
      "hero.eyebrow":"FACTORIO 2.0 · PRIVATE BETA",
      "hero.title":"Make Factorio play your way.",
      "hero.lede":"Describe the mod you want in normal language — rebalance the game, create reviewed machines, or add alternative recipes. Get one installable ZIP that has already been loaded and checked in Factorio.",
      "proof.noCode":"No Lua required","proof.multi":"Several tweaks in one mod","proof.validated":"Checked in real Factorio",
      "workflow.describe.title":"Describe","workflow.describe.body":"Tell us what you want to change or add.",
      "workflow.build.title":"We build & check","workflow.build.body":"The service creates the mod and validates the requested changes.",
      "workflow.install.title":"Install","workflow.install.body":"Download one ZIP and put it in your Factorio mods folder.",
      "notice.title":"What this beta is good at",
      "notice.body":"Personal base-game mods: rebalance existing content or create a new reviewed assembling machine/electric furnace with its own item, recipe and technology unlock. If part of your request is outside the reviewed scope, we reject the whole request instead of pretending it worked.",
      "notice.boundary":"Validation runs in isolated base-game Factorio 2.0.77. Compatibility with Space Age or your third-party mod stack is not guaranteed yet.",
      "access.step":"01 · BETA ACCESS","access.title":"Paste your invite token","access.copy":"You only need to do this once per browser tab.","access.label":"Beta token","access.placeholder":"Paste beta token","access.save":"Use token","access.clear":"Clear","access.hint":"The token is kept only in this tab and disappears when the tab is closed.","access.ready":"Ready","access.empty":"Not saved",
      "request.step":"02 · DESCRIBE YOUR MOD","request.title":"What should change?","request.copy":"Write one change or combine several. You can refine the result later.","request.promptLabel":"Describe your tweak pack","request.placeholder":"Example: Double assembler 2 and mining drill speeds, halve Automation cost, and make gears cost one plate","request.generate":"Build my mod","request.ready":"Most supported requests finish in seconds.",
      "examples.title":"Start with an example","example.machine.kicker":"NEW CONTENT","example.machine.body":"Create a new machine with its own recipe and technology","example.recipe.kicker":"ALT RECIPE","example.recipe.body":"Add a new alternative recipe for an existing item","example.chain.kicker":"CONTENT CHAIN","example.chain.body":"Create a new material and use it in a new machine","example.fast.kicker":"FAST START","example.fast.body":"Faster production, cheaper gears and research","example.production.kicker":"PRODUCTION","example.production.body":"Double mining and lab speed","example.throughput.kicker":"THROUGHPUT","example.throughput.body":"Faster gears, more belts, larger stacks","example.tech.kicker":"RESEARCH","example.tech.body":"Change a reviewed technology prerequisite",
      "scope.summary":"What can I change right now?","scope.yesTitle":"Works well in this beta","scope.yesBody":"Selected rebalance changes, new intermediate materials, alternative item-only recipes, plus reviewed assemblers, electric furnaces, mining drills, labs, chemical plants, oil refineries and centrifuges. New materials can feed new recipes/machines in the same mod.","scope.noTitle":"Not supported yet","scope.noBody":"Arbitrary entity types or gameplay systems, runtime control.lua logic, custom graphics/assets, unreviewed item/entity types, fluid recipes, Space Age-specific content, or Workshop publishing.",
      "history.step":"RECENT","history.title":"Your recent mods","history.refresh":"Refresh","history.none":"No generations yet.","history.token":"Use your beta token to load recent mods.",
      "result.step":"03 · YOUR MOD","result.title":"Generation result","result.changes":"What the mod changes","result.diff":"What changed in this revision","result.download":"Download mod ZIP","result.preparing":"Preparing download…","result.retry":"Try again","result.installNote":"<strong>Install:</strong> put the ZIP in your Factorio <code>mods</code> folder without unpacking it, then launch the game. This build was checked against isolated base-game Factorio 2.0.77; your own mod stack still needs an in-game check.",
      "progress.queued":"Queued","progress.running":"Build + check","progress.done":"Ready",
      "revision.title":"Want to change it?","revision.label":"Describe the next version in normal language","revision.placeholder":"Example: Keep everything else, but make steel furnaces another 25% faster and restore Automation research cost to normal","revision.button":"Update & check again",
      "feedback.title":"Did the result match what you wanted?","feedback.label":"Optional note","feedback.placeholder":"Tell us what worked or what should have been different","feedback.up":"Yes","feedback.down":"No / needs work",
      "survey.title":"One product question","survey.question":"If this reliably made the personal mods you wanted, would you pay for it?","survey.yes":"Yes","survey.maybe":"Maybe","survey.no":"No",
      "footer":"Private beta · Factorio stable 2.0.x · ZIPs are offered only after automated runtime validation.",
      "status.queued":"queued","status.running":"building","status.succeeded":"ready","status.unsupported":"unsupported","status.failed":"failed",
      "message.queued":"Request received. It is waiting for the generation worker.","message.running":"Building the mod and checking every requested change in real Factorio…","message.succeeded":"Validated successfully. Your installable ZIP is ready.","message.unsupportedSuffix":"Try a supported tweak pack or one of the examples above.","message.failed":"Generation failed.","message.retryable":"You can try again with a fresh generation.",
      "state.example":"Example loaded. Edit it or build it as-is.","state.enterToken":"Paste your beta token first.","state.tokenSaved":"Beta access is ready for this tab.","state.tokenCleared":"Beta token cleared.","state.describe":"Describe the Factorio changes you want first.","state.submitting":"Sending request…","state.running":"Building your mod…","state.finished":"Finished.","state.retrying":"Starting a fresh generation…","state.revisionEmpty":"Describe what you want to change from this version.","state.revisionSubmitting":"Sending revision…","state.revisionRunning":"Building the revised mod…","state.feedbackSaving":"Saving…","state.feedbackSaved":"Feedback saved. Thank you.","state.surveySaved":"Answer saved. Thank you.",
      "error.auth":"Beta token is missing or invalid.","error.rate":"Rate limit reached. Try again after the cooldown.","error.generic":"Request failed",
      "meta.generation":"Generation","meta.capability":"Type","meta.totalTime":"Total time","meta.factorio":"Factorio check","meta.artifact":"File","meta.size":"ZIP size",
      "cap.prototype_property":"Machine property","cap.recipe_ingredient":"Recipe ingredient","cap.recipe_crafting_time":"Crafting time","cap.recipe_result":"Recipe output","cap.item_stack_size":"Stack size","cap.technology_cost":"Research cost","cap.technology_prerequisite":"Research prerequisite","cap.new_machine":"New machine","cap.new_recipe":"New recipe","cap.new_item":"New material","cap.mixed":"Mod bundle",
      "change.ingredient":"ingredient","change.craftingTime":"crafting time","change.output":"output","change.stack":"stack size","change.researchCost":"research cost","change.prerequisite":"prerequisite","change.newMachine":"create machine","change.machineSpeed":"speed","change.energy":"energy","change.modules":"module slots","change.newRecipe":"create recipe","change.newItem":"create material","change.stack":"stack","change.seconds":"s","change.unknown":"Unknown change","diff.added":"added","diff.removed":"removed","diff.changed":"changed",
      "operation.add":"add","operation.remove":"remove"
    },
    ru: {
      "page.title":"Factorio Mod Beta — Русский",
      "hero.eyebrow":"FACTORIO 2.0 · ЗАКРЫТАЯ БЕТА",
      "hero.title":"Настрой Factorio под себя.",
      "hero.lede":"Опиши обычными словами мод, который хочешь: измени баланс, добавь новую проверенную машину или альтернативный рецепт. Получи готовый ZIP, который уже загрузился и прошёл проверку в Factorio.",
      "proof.noCode":"Lua знать не нужно","proof.multi":"Несколько правок в одном моде","proof.validated":"Проверка в настоящей Factorio",
      "workflow.describe.title":"Опиши","workflow.describe.body":"Напиши, что хочешь изменить или добавить в игру.",
      "workflow.build.title":"Мы соберём и проверим","workflow.build.body":"Сервис создаст мод и проверит запрошенные изменения.",
      "workflow.install.title":"Установи","workflow.install.body":"Скачай один ZIP и положи его в папку mods игры.",
      "notice.title":"Для чего эта бета уже подходит",
      "notice.body":"Персональные моды для базовой игры: можно менять баланс или создавать новую проверенную печь/сборочный автомат со своим предметом, рецептом и технологией. Если часть запроса пока не поддерживается, мы отклоним запрос целиком, а не сделаем вид, что всё сработало.",
      "notice.boundary":"Проверка запускается в изолированной базовой Factorio 2.0.77. Совместимость с Space Age и твоим набором сторонних модов пока не гарантируется.",
      "access.step":"01 · ДОСТУП К БЕТЕ","access.title":"Вставь токен приглашения","access.copy":"Это нужно сделать один раз для текущей вкладки.","access.label":"Бета-токен","access.placeholder":"Вставь бета-токен","access.save":"Использовать токен","access.clear":"Очистить","access.hint":"Токен хранится только в этой вкладке и удалится после её закрытия.","access.ready":"Готово","access.empty":"Не сохранён",
      "request.step":"02 · ОПИШИ МОД","request.title":"Что нужно изменить?","request.copy":"Можно попросить одну правку или сразу несколько. Потом результат можно доработать новым сообщением.","request.promptLabel":"Опиши свой набор изменений","request.placeholder":"Например: ускорь сборочный автомат 2 и электрический бур в 2 раза, удешеви Автоматизацию вдвое и сделай шестерни по 1 железной пластине","request.generate":"Собрать мой мод","request.ready":"Поддерживаемые запросы обычно готовы за несколько секунд.",
      "examples.title":"Можно начать с примера","example.machine.kicker":"НОВЫЙ КОНТЕНТ","example.machine.body":"Создать новую машину со своим рецептом и технологией","example.recipe.kicker":"НОВЫЙ РЕЦЕПТ","example.recipe.body":"Добавить альтернативный рецепт для существующего предмета","example.chain.kicker":"ЦЕПОЧКА КОНТЕНТА","example.chain.body":"Создать новый материал и использовать его в новой машине","example.fast.kicker":"БЫСТРЫЙ СТАРТ","example.fast.body":"Быстрее производство, дешевле шестерни и исследования","example.production.kicker":"ПРОИЗВОДСТВО","example.production.body":"Ускорить добычу и исследования","example.throughput.kicker":"ПРОПУСКНАЯ СПОСОБНОСТЬ","example.throughput.body":"Быстрее шестерни, больше конвейеров, крупнее стаки","example.tech.kicker":"ИССЛЕДОВАНИЯ","example.tech.body":"Изменить проверенную зависимость технологии",
      "scope.summary":"Что сейчас можно менять?","scope.yesTitle":"Хорошо работает в этой бете","scope.yesBody":"Проверенные изменения баланса, новые промежуточные материалы и альтернативные item-рецепты, а также новые сборочные автоматы, электропечи, электрические буры, лаборатории, химзаводы, НПЗ и центрифуги. Новый материал можно использовать в новой машине/рецепте того же мода.","scope.noTitle":"Пока не поддерживается","scope.noBody":"Произвольные типы сущностей и игровые системы, логика control.lua, собственная графика/ассеты, непроверенные типы item/entity, fluid-рецепты, контент только для Space Age и публикация в Workshop.",
      "history.step":"НЕДАВНИЕ","history.title":"Твои последние моды","history.refresh":"Обновить","history.none":"Генераций пока нет.","history.token":"Используй бета-токен, чтобы загрузить последние моды.",
      "result.step":"03 · ТВОЙ МОД","result.title":"Результат","result.changes":"Что именно изменяет мод","result.diff":"Что изменилось в этой версии","result.download":"Скачать ZIP мода","result.preparing":"Готовим скачивание…","result.retry":"Попробовать ещё раз","result.installNote":"<strong>Установка:</strong> положи ZIP в папку <code>mods</code> Factorio, не распаковывая, и запусти игру. Эта сборка проверена в изолированной базовой Factorio 2.0.77; совместимость с твоими сторонними модами нужно проверить уже в игре.",
      "progress.queued":"В очереди","progress.running":"Сборка + проверка","progress.done":"Готово",
      "revision.title":"Хочешь что-то изменить?","revision.label":"Опиши следующую версию обычными словами","revision.placeholder":"Например: оставь всё остальное, но ускорь стальные печи ещё на 25% и верни стоимость Автоматизации к обычной","revision.button":"Изменить и проверить снова",
      "feedback.title":"Результат совпал с тем, что ты хотел?","feedback.label":"Комментарий необязателен","feedback.placeholder":"Напиши, что сработало или что получилось не так","feedback.up":"Да","feedback.down":"Нет / нужно исправить",
      "survey.title":"Один вопрос о продукте","survey.question":"Если сервис стабильно будет делать нужные тебе персональные моды, ты бы платил за него?","survey.yes":"Да","survey.maybe":"Возможно","survey.no":"Нет",
      "footer":"Закрытая бета · Factorio stable 2.0.x · ZIP выдаётся только после автоматической проверки запуска.",
      "status.queued":"в очереди","status.running":"собирается","status.succeeded":"готово","status.unsupported":"не поддерживается","status.failed":"ошибка",
      "message.queued":"Запрос принят и ждёт свободный worker.","message.running":"Собираем мод и проверяем каждое запрошенное изменение в Factorio…","message.succeeded":"Проверка прошла успешно. ZIP мода готов.","message.unsupportedSuffix":"Попробуй поддерживаемый набор изменений или один из примеров выше.","message.failed":"Не удалось собрать мод.","message.retryable":"Можно запустить новую попытку.",
      "state.example":"Пример загружен. Его можно изменить или сразу отправить.","state.enterToken":"Сначала вставь бета-токен.","state.tokenSaved":"Доступ к бете готов для этой вкладки.","state.tokenCleared":"Бета-токен очищен.","state.describe":"Сначала опиши, что хочешь изменить в Factorio.","state.submitting":"Отправляем запрос…","state.running":"Собираем мод…","state.finished":"Готово.","state.retrying":"Запускаем новую попытку…","state.revisionEmpty":"Опиши, что нужно изменить в этой версии.","state.revisionSubmitting":"Отправляем изменения…","state.revisionRunning":"Собираем новую версию…","state.feedbackSaving":"Сохраняем…","state.feedbackSaved":"Отзыв сохранён. Спасибо.","state.surveySaved":"Ответ сохранён. Спасибо.",
      "error.auth":"Бета-токен отсутствует или неверный.","error.rate":"Слишком много запросов. Попробуй позже.","error.generic":"Ошибка запроса",
      "meta.generation":"Генерация","meta.capability":"Тип","meta.totalTime":"Общее время","meta.factorio":"Проверка Factorio","meta.artifact":"Файл","meta.size":"Размер ZIP",
      "cap.prototype_property":"Параметр машины","cap.recipe_ingredient":"Ингредиент рецепта","cap.recipe_crafting_time":"Время крафта","cap.recipe_result":"Результат рецепта","cap.item_stack_size":"Размер стака","cap.technology_cost":"Стоимость исследования","cap.technology_prerequisite":"Зависимость исследования","cap.new_machine":"Новая машина","cap.new_recipe":"Новый рецепт","cap.new_item":"Новый материал","cap.mixed":"Набор мода",
      "change.ingredient":"ингредиент","change.craftingTime":"время крафта","change.output":"результат","change.stack":"размер стака","change.researchCost":"стоимость исследования","change.prerequisite":"требование","change.newMachine":"создать машину","change.machineSpeed":"скорость","change.energy":"энергия","change.modules":"слоты модулей","change.newRecipe":"создать рецепт","change.newItem":"создать материал","change.stack":"стак","change.seconds":"с","change.unknown":"Неизвестное изменение","diff.added":"добавлено","diff.removed":"убрано","diff.changed":"изменено",
      "operation.add":"добавить","operation.remove":"убрать"
    }
  };

  const names = {
    en: {
      "stone-furnace":"Stone furnace","steel-furnace":"Steel furnace","electric-furnace":"Electric furnace","assembling-machine-1":"Assembling machine 1","assembling-machine-2":"Assembling machine 2","assembling-machine-3":"Assembling machine 3","burner-mining-drill":"Burner mining drill","electric-mining-drill":"Electric mining drill","transport-belt":"Transport belt","fast-transport-belt":"Fast transport belt","express-transport-belt":"Express transport belt","inserter":"Inserter","fast-inserter":"Fast inserter","bulk-inserter":"Bulk inserter","lab":"Lab","iron-gear-wheel":"Iron gear","iron-plate":"Iron plate","copper-plate":"Copper plate","copper-cable":"Copper cable","electronic-circuit":"Electronic circuit","pipe":"Pipe","automation":"Automation","automation-2":"Automation 2","logistics":"Logistics","logistics-2":"Logistics 2","steel-processing":"Steel processing","logistic-science-pack":"Logistic science pack","advanced-material-processing":"Advanced material processing","crafting_speed":"crafting speed","mining_speed":"mining speed","speed":"speed","extension_speed":"extension speed","rotation_speed":"rotation speed","researching_speed":"research speed"
    },
    ru: {
      "stone-furnace":"Каменная печь","steel-furnace":"Стальная печь","electric-furnace":"Электрическая печь","assembling-machine-1":"Сборочный автомат 1","assembling-machine-2":"Сборочный автомат 2","assembling-machine-3":"Сборочный автомат 3","burner-mining-drill":"Твердотопливный бур","electric-mining-drill":"Электрический бур","transport-belt":"Конвейер","fast-transport-belt":"Быстрый конвейер","express-transport-belt":"Экспресс-конвейер","inserter":"Манипулятор","fast-inserter":"Быстрый манипулятор","bulk-inserter":"Пакетный манипулятор","lab":"Лаборатория","iron-gear-wheel":"Железная шестерня","iron-plate":"Железная пластина","copper-plate":"Медная пластина","copper-cable":"Медный кабель","electronic-circuit":"Электронная схема","pipe":"Труба","automation":"Автоматизация","automation-2":"Автоматизация 2","logistics":"Логистика","logistics-2":"Логистика 2","steel-processing":"Обработка стали","logistic-science-pack":"Логистический исследовательский пакет","advanced-material-processing":"Продвинутая обработка материалов","crafting_speed":"скорость крафта","mining_speed":"скорость добычи","speed":"скорость","extension_speed":"скорость выдвижения","rotation_speed":"скорость вращения","researching_speed":"скорость исследований"
    }
  };

  const tokenInput = document.querySelector("#token");
  const saveToken = document.querySelector("#save-token");
  const clearToken = document.querySelector("#clear-token");
  const accessState = document.querySelector("#access-state");
  const form = document.querySelector("#generation-form");
  const promptInput = document.querySelector("#prompt");
  const promptCount = document.querySelector("#prompt-count");
  const generateButton = document.querySelector("#generate");
  const requestState = document.querySelector("#request-state");
  const historyPanel = document.querySelector("#history-panel");
  const historyList = document.querySelector("#history-list");
  const refreshHistory = document.querySelector("#refresh-history");
  const resultPanel = document.querySelector("#result-panel");
  const statusBadge = document.querySelector("#status-badge");
  const resultMeta = document.querySelector("#result-meta");
  const resultMessage = document.querySelector("#result-message");
  const changeSummary = document.querySelector("#change-summary");
  const changeList = document.querySelector("#change-list");
  const revisionDiffSummary = document.querySelector("#revision-diff-summary");
  const revisionDiffList = document.querySelector("#revision-diff-list");
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

  let language = localStorage.getItem(LANGUAGE_KEY) || (navigator.language && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en");
  if (!dictionaries[language]) language = "en";
  let generationId = null;
  let pollTimer = null;
  let currentRecord = null;
  let historyRecords = [];

  function t(key) { return dictionaries[language][key] || dictionaries.en[key] || key; }
  function nameFor(value) {
    return (names[language] && names[language][value]) || names.en[value] || humanize(value);
  }
  function setAccessState(ready) {
    accessState.textContent = ready ? t("access.ready") : t("access.empty");
    accessState.classList.toggle("ready", ready);
  }
  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = t("page.title");
    document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach((element) => { element.innerHTML = t(element.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-lang-select]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.langSelect === language)));
    setAccessState(Boolean(token()));
    if (currentRecord) render(currentRecord);
    if (historyRecords.length) renderHistory(historyRecords);
  }

  document.querySelectorAll("[data-lang-select]").forEach((button) => {
    button.addEventListener("click", () => {
      language = button.dataset.langSelect === "ru" ? "ru" : "en";
      localStorage.setItem(LANGUAGE_KEY, language);
      applyLanguage();
    });
  });

  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) tokenInput.value = stored;

  function updatePromptCount() { promptCount.textContent = String(promptInput.value.length) + " / 4000"; }
  updatePromptCount();
  promptInput.addEventListener("input", updatePromptCount);

  document.querySelectorAll("[data-prompt-en]").forEach((button) => {
    button.addEventListener("click", () => {
      promptInput.value = language === "ru" ? (button.dataset.promptRu || "") : (button.dataset.promptEn || "");
      updatePromptCount(); promptInput.focus(); requestState.textContent = t("state.example");
    });
  });

  function token() { return tokenInput.value.trim() || sessionStorage.getItem(TOKEN_KEY) || ""; }
  function authHeaders(extra = {}) {
    const value = token();
    if (!value) throw new Error("Authentication required");
    return { Authorization: "Bearer " + value, ...extra };
  }
  function friendlyError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Authentication required") return t("error.auth");
    if (message === "Too many requests") return t("error.rate");
    return message;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: authHeaders(options.headers || {}) });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      const message = body && body.error && body.error.message ? body.error.message : t("error.generic") + " (" + response.status + ")";
      throw new Error(message);
    }
    return body;
  }

  function addMeta(label, value) {
    const dt = document.createElement("dt"); const dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = value; resultMeta.append(dt, dd);
  }
  function capabilityLabel(value) { return t("cap." + value) || value; }
  function statusLabel(value) { return t("status." + value) || value; }
  function fileSize(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;
    if (bytes < 1024) return String(bytes) + " B";
    return (bytes / 1024).toFixed(1) + " KiB";
  }
  function humanize(value) {
    const text = String(value || "").replaceAll("-", " ").replaceAll("_", " ");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }
  function operationText(operation) {
    if (!operation) return "";
    if (operation.type === "set") return "= " + String(operation.value);
    if (operation.type === "multiply") return "×" + String(operation.factor);
    if (operation.type === "add") return t("operation.add");
    if (operation.type === "remove") return t("operation.remove");
    return operation.type;
  }
  function describeChange(change) {
    if (!change) return t("change.unknown");
    if (change.type === "prototype_property") return nameFor(change.prototypeName) + " · " + nameFor(change.property) + " " + operationText(change.operation);
    if (change.type === "recipe_ingredient") return nameFor(change.recipeName) + " · " + t("change.ingredient") + " " + nameFor(change.ingredientName) + " " + operationText(change.operation);
    if (change.type === "recipe_crafting_time") return nameFor(change.recipeName) + " · " + t("change.craftingTime") + " " + operationText(change.operation);
    if (change.type === "recipe_result") return nameFor(change.recipeName) + " · " + t("change.output") + " " + nameFor(change.resultName) + " " + operationText(change.operation);
    if (change.type === "item_stack_size") return nameFor(change.itemName) + " · " + t("change.stack") + " " + operationText(change.operation);
    if (change.type === "technology_cost") return nameFor(change.technologyName) + " · " + t("change.researchCost") + " " + operationText(change.operation);
    if (change.type === "technology_prerequisite") return nameFor(change.technologyName) + " · " + t("change.prerequisite") + " " + operationText(change.operation) + " " + nameFor(change.prerequisiteName);
    if (change.type === "new_machine") return t("change.newMachine") + " «" + change.displayName + "» · " + t("change.machineSpeed") + " " + String(change.speed) + " · " + String(change.energyUsageKw) + " kW · " + t("change.modules") + " " + String(change.moduleSlots);
    if (change.type === "new_recipe") {
      const ingredients = (change.ingredients || []).map((ingredient) => String(ingredient.amount) + " " + nameFor(ingredient.itemName)).join(" + ");
      return t("change.newRecipe") + " «" + change.displayName + "»: " + ingredients + " → " + String(change.resultAmount) + " " + nameFor(change.resultItemName) + " · " + String(change.energyRequired) + t("change.seconds");
    }
    if (change.type === "new_item") {
      const ingredients = (change.recipeIngredients || []).map((ingredient) => String(ingredient.amount) + " " + nameFor(ingredient.itemName)).join(" + ");
      return t("change.newItem") + " «" + change.displayName + "» · " + t("change.stack") + " " + String(change.stackSize) + " · " + ingredients + " → " + String(change.recipeResultAmount);
    }
    return humanize(change.type);
  }

  function renderChangeDetails(record) {
    changeList.replaceChildren();
    const changes = record.modSpec && Array.isArray(record.modSpec.changes) ? record.modSpec.changes : [];
    changeSummary.classList.toggle("hidden", changes.length === 0);
    changes.forEach((change) => { const item = document.createElement("li"); item.textContent = describeChange(change); changeList.append(item); });
    revisionDiffList.replaceChildren();
    const diff = Array.isArray(record.revisionDiff) ? record.revisionDiff : [];
    revisionDiffSummary.classList.toggle("hidden", diff.length === 0);
    diff.forEach((entry) => {
      const item = document.createElement("li"); const kind = document.createElement("span");
      kind.className = "diff-kind"; kind.textContent = t("diff." + entry.kind); item.append(kind);
      if (entry.kind === "changed") item.append(document.createTextNode(describeChange(entry.before) + " → " + describeChange(entry.after)));
      else item.append(document.createTextNode(describeChange(entry.after || entry.before)));
      revisionDiffList.append(item);
    });
  }

  function renderProgress(status) {
    const terminal = ["succeeded","failed","unsupported"].includes(status);
    progress.querySelectorAll("span").forEach((item) => item.classList.remove("active","done"));
    const queued = progress.querySelector('[data-phase="queued"]'); const running = progress.querySelector('[data-phase="running"]'); const result = progress.querySelector('[data-phase="terminal"]');
    if (status === "queued") queued.classList.add("active");
    else if (status === "running") { queued.classList.add("done"); running.classList.add("active"); }
    else if (terminal) { queued.classList.add("done"); running.classList.add(status === "succeeded" ? "done" : "active"); result.classList.add(status === "succeeded" ? "done" : "active"); }
  }

  function render(record) {
    currentRecord = record;
    resultPanel.classList.remove("hidden");
    statusBadge.textContent = statusLabel(record.status); statusBadge.className = "badge " + record.status;
    renderProgress(record.status); resultMeta.replaceChildren();
    addMeta(t("meta.generation"), record.id);
    if (record.modSpec && record.modSpec.capability) addMeta(t("meta.capability"), capabilityLabel(record.modSpec.capability));
    if (record.telemetry && typeof record.telemetry.durationMs === "number") addMeta(t("meta.totalTime"), (record.telemetry.durationMs / 1000).toFixed(1) + " s");
    if (record.telemetry && record.telemetry.validation && typeof record.telemetry.validation.finalDurationMs === "number") addMeta(t("meta.factorio"), (record.telemetry.validation.finalDurationMs / 1000).toFixed(1) + " s");
    if (record.artifact && record.artifact.fileName) addMeta(t("meta.artifact"), record.artifact.fileName);
    const size = record.artifact ? fileSize(record.artifact.sizeBytes) : null; if (size) addMeta(t("meta.size"), size);
    renderChangeDetails(record);
    const canDownload = record.status === "succeeded"; const canRetry = record.status === "failed" && record.error && record.error.retryable === true;
    resultActions.classList.toggle("hidden", !canDownload && !canRetry); downloadButton.classList.toggle("hidden", !canDownload); retryButton.classList.toggle("hidden", !canRetry); installNote.classList.toggle("hidden", !canDownload); revision.classList.toggle("hidden", !canDownload);
    const terminal = ["succeeded","failed","unsupported"].includes(record.status); feedback.classList.toggle("hidden", !terminal); survey.classList.toggle("hidden", !canDownload);
    if (record.status === "queued") resultMessage.textContent = t("message.queued");
    else if (record.status === "running") resultMessage.textContent = t("message.running");
    else if (record.status === "succeeded") resultMessage.textContent = t("message.succeeded");
    else if (record.status === "unsupported") resultMessage.textContent = (record.reason || "") + (record.reason ? " " : "") + t("message.unsupportedSuffix");
    else if (record.status === "failed") { const message = record.error && record.error.message ? record.error.message : t("message.failed"); resultMessage.textContent = canRetry ? message + " " + t("message.retryable") : message; }
    return terminal;
  }

  async function poll() {
    if (!generationId) return;
    try {
      const body = await api("/v1/generations/" + encodeURIComponent(generationId));
      const terminal = render(body.generation);
      if (terminal) { generateButton.disabled = false; requestState.textContent = t("state.finished"); pollTimer = null; void loadHistory(); return; }
      pollTimer = window.setTimeout(poll, 1000);
    } catch (error) { requestState.textContent = friendlyError(error); generateButton.disabled = false; pollTimer = null; }
  }

  saveToken.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    if (!value) { setAccessState(false); requestState.textContent = t("state.enterToken"); tokenInput.focus(); return; }
    sessionStorage.setItem(TOKEN_KEY, value); setAccessState(true); requestState.textContent = t("state.tokenSaved"); void loadHistory();
  });
  clearToken.addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY); tokenInput.value = ""; setAccessState(false); requestState.textContent = t("state.tokenCleared"); historyRecords = []; historyPanel.classList.add("hidden"); historyList.replaceChildren(); tokenInput.focus();
  });

  function renderHistory(records) {
    historyRecords = Array.isArray(records) ? records : [];
    historyList.replaceChildren();
    historyPanel.classList.toggle("hidden", historyRecords.length === 0);
    if (historyRecords.length === 0) return;
    historyRecords.forEach((record) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "history-item";
      const prompt = document.createElement("span"); prompt.className = "history-prompt"; prompt.textContent = record.prompt || record.id;
      const meta = document.createElement("span"); meta.className = "history-meta";
      const created = record.createdAt ? new Date(record.createdAt).toLocaleString(language === "ru" ? "ru-RU" : "en-US") : "";
      meta.textContent = statusLabel(record.status) + (created ? " · " + created : ""); button.append(prompt, meta);
      button.addEventListener("click", async () => {
        try {
          const body = await api("/v1/generations/" + encodeURIComponent(record.id)); generationId = body.generation.id;
          const terminal = render(body.generation); resultPanel.scrollIntoView({ behavior:"smooth", block:"start" });
          if (!terminal) { generateButton.disabled = true; if (pollTimer !== null) window.clearTimeout(pollTimer); pollTimer = window.setTimeout(poll, 500); }
        } catch (error) { requestState.textContent = friendlyError(error); }
      });
      historyList.append(button);
    });
  }
  async function loadHistory() {
    if (!token()) { historyPanel.classList.add("hidden"); return; }
    refreshHistory.disabled = true;
    try { const body = await api("/v1/generations?limit=10"); renderHistory(body.generations); }
    catch (error) { historyPanel.classList.remove("hidden"); historyList.replaceChildren(); const message = document.createElement("p"); message.className = "muted"; message.textContent = friendlyError(error); historyList.append(message); }
    finally { refreshHistory.disabled = false; }
  }
  refreshHistory.addEventListener("click", () => void loadHistory());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!token()) { requestState.textContent = t("state.enterToken"); tokenInput.focus(); return; }
    if (!promptInput.value.trim()) { requestState.textContent = t("state.describe"); promptInput.focus(); return; }
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    generationId = null; currentRecord = null; feedbackState.textContent = ""; surveyState.textContent = ""; revisionState.textContent = ""; revisionPrompt.value = ""; feedbackNote.value = ""; resultPanel.classList.add("hidden"); generateButton.disabled = true; requestState.textContent = t("state.submitting");
    try {
      const body = await api("/v1/generations", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ prompt:promptInput.value.trim() }) });
      generationId = body.generation.id; render(body.generation); resultPanel.scrollIntoView({ behavior:"smooth", block:"start" }); requestState.textContent = t("state.running"); pollTimer = window.setTimeout(poll, 500);
    } catch (error) { requestState.textContent = friendlyError(error); generateButton.disabled = false; }
  });

  retryButton.addEventListener("click", async () => {
    if (!generationId) return; retryButton.disabled = true; requestState.textContent = t("state.retrying");
    try { const body = await api("/v1/generations/" + encodeURIComponent(generationId) + "/retry", { method:"POST" }); generationId = body.generation.id; revisionPrompt.value = ""; feedbackState.textContent = ""; surveyState.textContent = ""; render(body.generation); generateButton.disabled = true; requestState.textContent = t("state.running"); pollTimer = window.setTimeout(poll, 500); }
    catch (error) { requestState.textContent = friendlyError(error); }
    finally { retryButton.disabled = false; }
  });

  reviseButton.addEventListener("click", async () => {
    if (!generationId) return; const prompt = revisionPrompt.value.trim();
    if (!prompt) { revisionState.textContent = t("state.revisionEmpty"); revisionPrompt.focus(); return; }
    if (pollTimer !== null) window.clearTimeout(pollTimer); reviseButton.disabled = true; revisionState.textContent = t("state.revisionSubmitting"); requestState.textContent = t("state.revisionRunning");
    try {
      const sourceGenerationId = generationId; const body = await api("/v1/generations/" + encodeURIComponent(sourceGenerationId) + "/revise", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ prompt }) });
      generationId = body.generation.id; revisionPrompt.value = ""; feedbackState.textContent = ""; surveyState.textContent = ""; revisionState.textContent = ""; render(body.generation); generateButton.disabled = true; requestState.textContent = t("state.revisionRunning"); pollTimer = window.setTimeout(poll, 500);
    } catch (error) { revisionState.textContent = friendlyError(error); }
    finally { reviseButton.disabled = false; }
  });

  downloadButton.addEventListener("click", async () => {
    if (!generationId) return; downloadButton.disabled = true; downloadButton.textContent = t("result.preparing");
    try { const body = await api("/v1/generations/" + encodeURIComponent(generationId) + "/download", { headers:{ Accept:"application/json" } }); window.location.assign(body.downloadUrl); }
    catch (error) { resultMessage.textContent = friendlyError(error); }
    finally { downloadButton.disabled = false; downloadButton.textContent = t("result.download"); }
  });

  feedback.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!generationId) return; feedbackState.textContent = t("state.feedbackSaving");
      try { await api("/v1/generations/" + encodeURIComponent(generationId) + "/feedback", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ rating:button.dataset.rating, ...(feedbackNote.value.trim() ? { note:feedbackNote.value.trim() } : {}) }) }); feedbackState.textContent = t("state.feedbackSaved"); }
      catch (error) { feedbackState.textContent = friendlyError(error); }
    });
  });
  survey.querySelectorAll("[data-wtp]").forEach((button) => {
    button.addEventListener("click", async () => {
      surveyState.textContent = t("state.feedbackSaving");
      try { await api("/v1/survey", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ willingnessToPay:button.dataset.wtp }) }); surveyState.textContent = t("state.surveySaved"); }
      catch (error) { surveyState.textContent = friendlyError(error); }
    });
  });

  applyLanguage();
  if (stored) void loadHistory();
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
