import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceCursorStyles } from '../../src/background/style-manager.js';

function environment() {
  const active = new Set();
  const calls = [];
  const failures = new Set();
  let failInsert = false;
  return {
    active, calls, failures,
    set failInsert(value) { failInsert = value; },
    api: {
      async insertCSS({ css, origin }) {
        assert.equal(origin, 'USER');
        if (failInsert) throw new Error('insert failed');
        active.add(css); calls.push(['insert', css]);
      },
      async removeCSS({ css, origin }) {
        assert.equal(origin, 'USER');
        if (failures.has(css)) throw new Error('remove failed');
        active.delete(css); calls.push(['remove', css]);
      },
    },
  };
}

const target = { tabId: 1, documentIds: ['document'] };

test('资源变化时先插新再精确删除旧原文，不重算旧配置', async () => {
  const env = environment();
  const first = await replaceCursorStyles(env.api, target, 'cursor: old', []);
  const second = await replaceCursorStyles(env.api, target, 'cursor: new', first.sheets);
  assert.equal(second.ok, true);
  assert.equal(env.active.size, 1);
  assert.ok([...env.active][0].startsWith('cursor: new'));
  assert.equal(env.calls[1][0], 'insert');
  assert.deepEqual(env.calls[2], ['remove', first.sheets[0].css]);
  const unchanged = await replaceCursorStyles(env.api, target, 'cursor: new', second.sheets);
  assert.equal(env.calls.length, 3);
  assert.deepEqual(unchanged.sheets, second.sheets);
});

test('删除失败时保留每份已注入规则的记录，下一次可以完整清理', async () => {
  const env = environment();
  const first = await replaceCursorStyles(env.api, target, 'old', []);
  env.failures.add(first.sheets[0].css);
  const second = await replaceCursorStyles(env.api, target, 'new', first.sheets);
  assert.equal(second.ok, false);
  assert.equal(second.sheets.length, 2);
  assert.equal(env.active.size, 2);
  env.failures.clear();
  const retry = await replaceCursorStyles(env.api, target, 'new', second.sheets);
  assert.equal(retry.ok, true);
  assert.equal(retry.sheets.length, 1);
  const disabled = await replaceCursorStyles(env.api, target, null, retry.sheets);
  assert.equal(disabled.ok, true);
  assert.deepEqual(disabled.sheets, []);
  assert.equal(env.active.size, 0);
});

test('插入失败不丢失旧规则记录，不会先删掉旧样式', async () => {
  const env = environment();
  const first = await replaceCursorStyles(env.api, target, 'old', []);
  env.failInsert = true;
  const second = await replaceCursorStyles(env.api, target, 'new', first.sheets);
  assert.equal(second.ok, false);
  assert.deepEqual(second.sheets, first.sheets);
  assert.equal(env.active.size, 1);
  assert.equal(env.calls.length, 1);
});
