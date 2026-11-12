async function signature(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function replaceCursorStyles(scripting, target, css, previous = []) {
  const key = css === null ? null : await signature(css);
  let current = previous.at(-1);
  if (css !== null && current?.key !== key) {
    // 唯一注释使同一份规则的重试也能精确移除，不会误删刚插入的新实例。
    current = { key, css: `${css}\n/* capitaine: ${crypto.randomUUID()} */` };
    try {
      await scripting.insertCSS({ target, origin: 'USER', css: current.css });
    } catch (error) {
      return { ok: false, sheets: previous, error: error.message };
    }
  } else if (css === null) {
    current = null;
  }
  const retained = [];
  const errors = [];
  for (const sheet of previous) {
    if (sheet === current) continue;
    try {
      await scripting.removeCSS({ target, origin: 'USER', css: sheet.css });
    } catch (error) {
      retained.push(sheet);
      errors.push(error.message);
    }
  }
  if (current) retained.push(current);
  return { ok: errors.length === 0, sheets: retained, ...(errors.length ? { error: errors.join('，') } : {}) };
}
