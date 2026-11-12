import { classifyCursor } from '../shared/cursor-types.js';

export const SAMPLE_INTERVAL = 120;

export class CursorController {
  constructor({ document, marker }) {
    this.document = document;
    this.window = document.defaultView;
    this.marker = marker;
    this.running = false;
    this.active = null;
    this.point = null;
    this.capture = null;
    this.frame = null;
    this.timer = null;
    this.roots = new Map();
    this.listeners = [];
    this.trackingListeners = [];
    this.schedule = this.schedule.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.onCapture = this.onCapture.bind(this);
    // 设置停用期间只记录位置，不取样、不改 DOM，重新启用不必等待鼠标移动。
    for (const event of ['pointermove', 'pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel']) {
      this.listen(this.window, event, this.onPointer, this.trackingListeners);
    }
    this.listen(this.window, 'gotpointercapture', this.onCapture, this.trackingListeners);
    this.listen(this.window, 'lostpointercapture', this.onCapture, this.trackingListeners);
    this.listen(this.window, 'blur', () => this.leave(), this.trackingListeners);
    this.listen(this.document, 'visibilitychange', () => {
      if (this.document.hidden) this.leave();
      else this.schedule();
    }, this.trackingListeners);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.observeRoot(this.document);
    for (const event of ['scroll', 'resize', 'focus', 'load', 'animationstart', 'animationend', 'transitionend']) {
      this.listen(this.window, event, this.schedule);
    }
    this.schedule();
  }

  stop() {
    this.running = false;
    this.cancelSampling();
    this.release();
    for (const [target, type, callback] of this.listeners) target.removeEventListener(type, callback, true);
    this.listeners = [];
    for (const observer of this.roots.values()) observer.disconnect();
    this.roots.clear();
  }

  listen(target, type, callback, list = this.listeners) {
    target.addEventListener(type, callback, { capture: true, passive: true });
    list.push([target, type, callback]);
  }

  removeClonedMarkers(node) {
    const clean = element => {
      if (element !== this.active?.element && classifyCursor(element.getAttribute(this.marker) || '')) {
        element.removeAttribute(this.marker);
      }
    };
    if (node instanceof this.window.Element) clean(node);
    for (const element of node.querySelectorAll?.(`[${this.marker}]`) || []) clean(element);
  }

  observeRoot(root) {
    if (this.roots.has(root)) return;
    // 首次进入作用域及新增子树时清除被 cloneNode 复制的扩展标记。
    this.removeClonedMarkers(root);
    const observer = new this.window.MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) this.removeClonedMarkers(node);
        }
      }
      if (records.some(record => record.type !== 'attributes' || record.attributeName !== this.marker)) {
        this.schedule();
      }
    });
    observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
    this.roots.set(root, observer);
  }

  onPointer(event) {
    if (event.pointerType !== 'mouse') return;
    if (event.type === 'pointercancel') {
      this.leave();
      return;
    }
    this.point = { x: event.clientX, y: event.clientY };
    if (event.type === 'pointerout' && event.relatedTarget === null
        && !this.document.elementFromPoint(event.clientX, event.clientY) && !this.capture) {
      this.leave();
      return;
    }
    this.schedule();
  }

  onCapture(event) {
    if (event.pointerType !== 'mouse') return;
    this.capture = event.type === 'gotpointercapture'
      ? { element: event.composedPath().find(node => node instanceof this.window.Element), pointerId: event.pointerId }
      : null;
    this.schedule();
  }

  cancelSampling() {
    if (this.frame !== null) this.window.cancelAnimationFrame(this.frame);
    if (this.timer !== null) this.window.clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
  }

  leave() {
    this.point = null;
    this.capture = null;
    this.cancelSampling();
    this.release();
  }

  schedule() {
    if (!this.running || this.document.hidden || !this.point || this.frame !== null) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = null;
      this.sample();
    });
  }

  targetAtPoint() {
    if (this.capture?.element.isConnected && this.capture.element.hasPointerCapture(this.capture.pointerId)) {
      this.observeRoot(this.capture.element.getRootNode());
      return this.capture.element;
    }
    this.capture = null;
    let root = this.document;
    let target = null;
    const visited = new Set();
    while (root && !visited.has(root)) {
      visited.add(root);
      this.observeRoot(root);
      const hit = root.elementFromPoint(this.point.x, this.point.y);
      if (!(hit instanceof this.window.Element) || hit === target) break;
      target = hit;
      root = hit.shadowRoot;
    }
    return target;
  }

  release() {
    if (!this.active) return;
    const { element, original, value } = this.active;
    // 如果网页期间改了同名属性，保留网页的新值，不用旧快照覆盖它。
    if (element.getAttribute(this.marker) === value) {
      if (original === null) element.removeAttribute(this.marker);
      else element.setAttribute(this.marker, original);
    }
    this.active = null;
  }

  sample() {
    this.release();
    if (!this.running || !this.point || this.document.hidden) return;
    for (const [root, observer] of this.roots) {
      if (root !== this.document && !root.host.isConnected) {
        observer.disconnect();
        this.roots.delete(root);
      }
    }
    const element = this.targetAtPoint();
    if (element?.isConnected) {
      const type = classifyCursor(this.window.getComputedStyle(element).cursor);
      if (type) {
        this.active = { element, original: element.getAttribute(this.marker), value: type };
        element.setAttribute(this.marker, type);
      }
    }
    if (this.timer !== null) this.window.clearTimeout(this.timer);
    this.timer = this.window.setTimeout(() => {
      this.timer = null;
      this.schedule();
    }, SAMPLE_INTERVAL);
  }
}
