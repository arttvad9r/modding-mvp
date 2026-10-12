import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
// A minimal DOM boundary exercises the actual event handlers without a browser dependency.
class Element extends EventTarget {
  constructor(dataset = {}) {
    super(); this.dataset = dataset; this.value = ''; this.textContent = '';
    this.hidden = false; this.disabled = false; this.open = false; this.children = [];
    this.attributes = new Map(); this.classList = { add() {}, toggle() {} };
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  append(item) { this.children.push(item); }
  replaceChildren() { this.children = []; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
class CustomEvent extends Event {
  constructor(type, options) { super(type, options); this.detail = options.detail; }
}
function setup(savedDraft = '') {
  const window = new EventTarget();
  Object.assign(window, { location: { search: '', hash: '' }, scrollY: 0, innerWidth: 1640,
    matchMedia: () => ({ matches: true }), scrollTo() {} });
  const ids = ['mod-workspace', 'workspace-prompt', 'workspace-form', 'workspace-submit',
    'workspace-message', 'workspace-status', 'workspace-empty', 'workspace-artifact',
    'workspace-mod-title', 'workspace-changes', 'workspace-revision', 'workspace-revision-prompt',
    'workspace-download', 'hero-prompt', 'final-prompt'];
  const elements = new Map(ids.map(id => [`#${id}`, new Element()]));
  elements.set('.workspace-result', new Element());
  elements.set('#workspace-empty h3', new Element());
  elements.set('[data-workspace-close]', new Element());
  const ctas = ['header', 'hero', 'final'].map(source => new Element({ source }));
  const examples = [new Element({ workspaceExample: 'rebalance' })];
  const language = [new Element({ lang: 'ru' }), new Element({ lang: 'en' })];
  const groups = new Map([
    ['[data-i18n]', []], ['[data-i18n-placeholder]', []], ['[data-lang]', language],
    ['[data-action="build-mod"]', ctas], ['[data-workspace-example]', examples]
  ]);
  const document = { documentElement: {}, querySelector: selector => elements.get(selector),
    querySelectorAll: selector => groups.get(selector) || [], createElement: () => new Element() };
  const store = new Map([['mymodz.workspace.draft', savedDraft]]);
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  vm.runInNewContext(app, { document, window, localStorage: storage, sessionStorage: storage,
    navigator: { language: 'en' }, CustomEvent, URLSearchParams, history: { pushState() {} } });
  const el = id => elements.get(`#${id}`);
  const click = element => element.dispatchEvent(new Event('click', { cancelable: true }));
  const submit = element => element.dispatchEvent(new Event('submit', { cancelable: true }));
  const update = detail => window.dispatchEvent(new CustomEvent('mymodz:generation-updated', { detail }));
  return { el, ctas, language, click, submit, update, store, close: elements.get('[data-workspace-close]') };
}

test('all CTAs open one workshop; only submit requests generation', () => {
  const ui = setup(); let calls = 0;
  ui.el('workspace-form').addEventListener('mymodz:build-requested', () => calls++);
  ui.el('hero-prompt').value = '  Faster furnaces  ';
  ui.click(ui.ctas[1]);
  assert.equal(ui.el('mod-workspace').open, true);
  assert.equal(ui.el('workspace-prompt').value, 'Faster furnaces');
  assert.equal(calls, 0);
  ui.click(ui.close);
  ui.el('workspace-prompt').value = 'Edited draft';
  ui.click(ui.ctas[0]);
  assert.equal(ui.el('workspace-prompt').value, 'Edited draft');
  ui.el('final-prompt').value = 'New material';
  ui.click(ui.ctas[2]);
  assert.equal(ui.el('workspace-prompt').value, 'New material');
  ui.submit(ui.el('workspace-form'));
  assert.equal(calls, 1);
});

test('without an adapter no success or ZIP is shown, and the draft survives reload', () => {
  const ui = setup('Retained request');
  assert.equal(ui.el('workspace-prompt').value, 'Retained request');
  ui.submit(ui.el('workspace-form'));
  assert.equal(ui.el('workspace-artifact').hidden, true);
  assert.equal(ui.el('workspace-message').hidden, false);
  assert.equal(ui.el('workspace-submit').disabled, false);
  assert.equal(ui.store.get('mymodz.workspace.draft'), 'Retained request');
});

test('accepted submit keeps the hook payload and prevents duplicate builds', () => {
  const ui = setup(); const received = [];
  ui.click(ui.ctas[1]); ui.el('workspace-prompt').value = '  Speed up the drill  ';
  ui.el('workspace-form').addEventListener('mymodz:build-requested', event => {
    received.push({ ...event.detail }); event.preventDefault();
  });
  ui.submit(ui.el('workspace-form')); ui.submit(ui.el('workspace-form'));
  assert.deepEqual(received, [{ source: 'hero', prompt: 'Speed up the drill' }]);
  assert.equal(ui.el('workspace-submit').disabled, true);
  ui.update({ status: 'running' });
  assert.equal(ui.el('workspace-artifact').hidden, true);
  ui.update({ status: 'failed', message: 'Validation failed' });
  assert.equal(ui.el('workspace-submit').disabled, false);
  assert.equal(ui.el('workspace-message').textContent, 'Validation failed');
});

test('only identified success unlocks the result; labels are rendered as text', () => {
  const ui = setup();
  ui.update({ status: 'succeeded' });
  assert.equal(ui.el('workspace-artifact').hidden, true);
  ui.update({ status: 'succeeded', generationId: 'gen-1', title: '<b>My mod</b>', changes: ['<script>bad</script>', 42] });
  assert.equal(ui.el('workspace-artifact').hidden, false);
  assert.equal(ui.el('workspace-mod-title').textContent, '<b>My mod</b>');
  assert.equal(ui.el('workspace-changes').children.length, 1);
  assert.equal(ui.el('workspace-changes').children[0].textContent, '<script>bad</script>');
});

test('download and revision reference the validated source generation', () => {
  const ui = setup(); const received = [];
  ui.update({ status: 'succeeded', generationId: 'gen-original', changes: [] });
  ui.el('workspace-download').addEventListener('mymodz:download-requested', event => { received.push({ ...event.detail }); event.preventDefault(); });
  ui.el('workspace-revision').addEventListener('mymodz:revision-requested', event => { received.push({ ...event.detail }); event.preventDefault(); });
  ui.click(ui.el('workspace-download'));
  ui.el('workspace-revision-prompt').value = '  Keep everything, increase speed  ';
  ui.submit(ui.el('workspace-revision'));
  assert.deepEqual(received, [{ generationId: 'gen-original' }, { generationId: 'gen-original', prompt: 'Keep everything, increase speed' }]);
  assert.equal(ui.el('workspace-submit').disabled, true);
});

test('language switching preserves draft and translates unavailable state', () => {
  const ui = setup('My idea'); ui.submit(ui.el('workspace-form')); ui.click(ui.language[0]);
  assert.equal(ui.el('workspace-prompt').value, 'My idea');
  assert.match(ui.el('workspace-message').textContent, /Генерация сейчас недоступна/);
  ui.click(ui.language[1]);
  assert.match(ui.el('workspace-message').textContent, /Generation is currently unavailable/);
  ui.update({ status: 'running' });
  assert.equal(ui.el('workspace-status').textContent, 'Building and checking your mod');
});
