import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCursor, CURSOR_TYPES } from '../../src/shared/cursor-types.js';

for (const type of CURSOR_TYPES) {
  test(`精确识别 ${type}`, () => {
    assert.equal(classifyCursor(type), type);
    assert.equal(classifyCursor(` ${type.toUpperCase()} `), type);
  });
}

for (const value of [
  'auto', 'default', 'none', 'pointer', 'text', 'move', 'not-allowed', '',
  'url("custom.svg") 4 4, grab',
  'url("grab.png"), grabbing',
  'url("a,b.svg"), zoom-in',
  'image-set(url("custom.png") 1x), copy',
  'grab, grabbing',
]) {
  test(`不替换 ${value || '空值'}`, () => {
    assert.equal(classifyCursor(value), null);
  });
}
