import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';

test('Escape keeps results dismissed when the first search response arrives late', async t => {
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const element = () => ({
    dataset: {}, listeners: {}, hidden: true, value: '', innerHTML: '',
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    emit(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); },
    setAttribute() {}, querySelectorAll() { return []; },
  });
  const input = element();
  const results = element();
  const form = element();
  form.querySelector = selector => selector === 'input' ? input : selector === '[data-site-search-results]' ? results : null;
  const header = { querySelector: () => form };
  const document = { ...element(), baseURI: 'http://localhost/', activeElement: input, querySelector: () => header };
  input.focus = () => { document.activeElement = input; };
  globalThis.document = document;
  globalThis.window = { __OFFICIAL_SHOWCASE__: { generationPointerUrl: './data/current.json' } };
  let release;
  let calls = 0;
  const delayed = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async () => {
    calls += 1;
    const data = calls === 1 ? await delayed : calls === 2
      ? { compactSearchIndexUrl: './data/quick-search.json' }
      : { records: [{ type: 'company', stockCode: '2303', companyName: '聯電', url: './company.html?code=2303' }] };
    return { ok: true, json: async () => data };
  };
  await import('../static-showcase/assets/site-search.js?lazy-interaction');
  assert.equal(calls, 0);
  input.emit('focus');
  input.value = '2303';
  input.emit('input');
  assert.equal(results.hidden, false);
  input.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(results.hidden, true);
  release({ runtimeUrl: './data/runtime.json' });
  await setImmediate();
  assert.equal(calls, 3);
  assert.equal(results.hidden, true);
  input.emit('input');
  assert.equal(results.hidden, false);
  assert.match(results.innerHTML, /聯電/);
});
