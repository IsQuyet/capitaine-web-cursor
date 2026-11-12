export const CURSOR_TYPES = Object.freeze([
  'grab',
  'grabbing',
  'zoom-in',
  'zoom-out',
  'cell',
  'vertical-text',
  'alias',
  'copy',
  'col-resize',
  'row-resize',
]);

const supported = new Set(CURSOR_TYPES);

export function classifyCursor(value) {
  const keyword = value.trim().toLowerCase();
  // 只接受完整关键字，含 url()、image-set() 或其他 fallback 的声明不会命中。
  return supported.has(keyword) ? keyword : null;
}
