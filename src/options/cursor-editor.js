import map from '../../assets/cursor-map.json';
import { CURSOR_TYPES } from '../shared/cursor-types.js';
import {
  resolveCursorAsset,
  assetImageURL,
  cursorValueForAsset,
} from '../shared/cursor-assets.js';
import { importCursorFile } from '../ui/cursor-files.js';
import { readCursorOverrides, saveCursorAsset, resetCursorAsset } from '../ui/cursor-store.js';
import { errorText, setStatus } from '../ui/settings-ui.js';

const PALETTE_NAMES = { light: 'Light', dark: 'Dark' };
const CURSOR_LABELS = {
  grab: '可抓取', grabbing: '抓取中',
  'zoom-in': '放大', 'zoom-out': '缩小',
  cell: '单元格', 'vertical-text': '竖排文本',
  alias: '快捷方式', copy: '复制',
  'col-resize': '列宽调整', 'row-resize': '行高调整',
};
const getURL = path => chrome.runtime.getURL(path);

export async function initCursorEditor() {
  const root = document.querySelector('#cursor-editor');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const element = id => root.querySelector(`#cursor-${id}`);
  const fields = element('editor-fields');
  const typeSelect = element('type');
  const paletteSelect = element('palette');
  const fileInput = element('file');
  const importButton = element('import');
  const draftState = element('draft-state');
  const backgroundSelect = element('preview-background');
  const image = element('image');
  const frame = element('image-frame');
  const calibrator = element('calibrator');
  const crosshair = element('crosshair');
  const xInput = element('hotspot-x');
  const yInput = element('hotspot-y');
  const trial = element('trial');
  const trialMarker = element('trial-marker');
  const trialResult = element('trial-result');
  const share = element('share-palette');
  const apply = element('apply');
  const reset = element('reset');
  const reload = element('reload');
  const status = element('editor-status');
  const externalNote = element('external-change');
  let selectedType = CURSOR_TYPES[0];
  let selectedPalette = 'light';
  let savedState;
  let draft;
  let ready = false;
  let busy = false;
  let loading = false;
  let dirty = false;
  let invalidHotspot = false;
  let imageReady = false;
  let pointerId = null;
  let readVersion = 0;
  let pendingRefresh = false;
  let readFailure = '';

  for (const type of CURSOR_TYPES) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = `${type}（${CURSOR_LABELS[type]}）`;
    typeSelect.append(option);
  }

  function announce(message, tone = 'info') {
    if (status.textContent !== message || status.dataset.tone !== tone) setStatus(status, message, tone);
  }

  function updateControls() {
    fields.disabled = busy || !ready;
    calibrator.disabled = busy || !ready || !imageReady;
    apply.disabled = busy || !ready || !draft || !dirty || invalidHotspot || !imageReady;
    apply.textContent = busy ? '处理中…' : '应用';
    draftState.hidden = !dirty;
    reload.disabled = busy || loading;
    reload.hidden = !readFailure && externalNote.hidden;
    reload.textContent = readFailure ? '重试' : '载入更新';
    trial.tabIndex = ready && !busy && imageReady ? 0 : -1;
    root.setAttribute('aria-busy', String(busy || loading));
    root.dataset.dirty = String(dirty);
  }

  function stopDrag() {
    const previous = pointerId;
    pointerId = null;
    if (previous !== null && calibrator.hasPointerCapture(previous)) calibrator.releasePointerCapture(previous);
  }

  function setBusy(value) {
    busy = value;
    if (value) {
      stopDrag();
      if (loading) {
        pendingRefresh = true;
        readVersion += 1;
        loading = false;
      }
    }
    updateControls();
  }

  function markDirty() {
    dirty = true;
    if (status.dataset.tone !== 'error') announce('');
    updateControls();
  }

  function renderHotspot() {
    if (!draft) return;
    crosshair.style.left = `${draft.hotspot[0] / draft.sourceSize[0] * 100}%`;
    crosshair.style.top = `${draft.hotspot[1] / draft.sourceSize[1] * 100}%`;
    const origin = element('hotspot-origin');
    origin.hidden = draft.format !== 'cur' || draft.hotspotOrigin !== 'embedded';
    origin.textContent = origin.hidden ? '' : 'CUR 内置 Hotspot';
    trial.style.cursor = cursorValueForAsset(draft, getURL, selectedType);
    trialMarker.hidden = true;
    trialResult.textContent = '';
  }

  function syncCoordinateInputs() {
    [xInput, yInput].forEach((input, index) => {
      input.value = String(draft.hotspot[index]);
      input.max = String(draft.sourceSize[index]);
      input.removeAttribute('aria-invalid');
    });
    invalidHotspot = false;
    element('hotspot-bounds').textContent = '';
  }

  function setDraft(asset, imported = false) {
    stopDrag();
    draft = structuredClone(asset);
    dirty = imported;
    externalNote.hidden = true;
    share.checked = imported;
    imageReady = false;
    crosshair.hidden = true;
    element('resource-name').textContent = draft.name;
    element('resource-kind').textContent = draft.format.toUpperCase();
    element('source-size').textContent = `${draft.sourceSize[0]} × ${draft.sourceSize[1]} px`;
    element('display-size').textContent = `${draft.displaySize[0]} × ${draft.displaySize[1]} px`;
    const otherPalette = selectedPalette === 'light' ? 'dark' : 'light';
    element('share-label').textContent = `本次同时应用到 ${PALETTE_NAMES[otherPalette]}`;
    reset.textContent = `恢复 ${PALETTE_NAMES[selectedPalette]} 默认`;
    syncCoordinateInputs();
    const [width, height] = draft.displaySize;
    frame.style.width = `${256 * width / Math.max(width, height)}px`;
    frame.style.aspectRatio = `${width} / ${height}`;
    image.alt = `放大校准：${draft.name}`;
    image.hidden = false;
    // 内置和文件资源走同一图片与坐标路径，预览放大不写回资源尺寸。
    image.src = assetImageURL(draft, getURL);
    renderHotspot();
    updateControls();
  }

  function loadSelection() {
    setDraft(resolveCursorAsset(selectedType, selectedPalette, map, savedState));
  }

  async function refreshSavedState() {
    const version = ++readVersion;
    loading = true;
    updateControls();
    try {
      const next = await readCursorOverrides();
      if (version !== readVersion) return;
      if (busy) {
        pendingRefresh = true;
        return;
      }
      const changed = savedState && JSON.stringify(resolveCursorAsset(selectedType, selectedPalette, map, savedState))
        !== JSON.stringify(resolveCursorAsset(selectedType, selectedPalette, map, next));
      savedState = next;
      ready = true;
      if (readFailure && status.textContent === readFailure) announce('');
      readFailure = '';
      if (dirty) {
        if (changed) externalNote.hidden = false;
      } else if (changed || !draft) {
        loadSelection();
      }
    } catch (error) {
      if (version === readVersion) {
        readFailure = `读取指针资源失败：${errorText(error)}`;
        announce(readFailure, 'error');
      }
    } finally {
      if (version === readVersion) {
        loading = false;
        updateControls();
      }
    }
  }

  async function finishBusy() {
    setBusy(false);
    if (pendingRefresh) {
      pendingRefresh = false;
      await refreshSavedState();
    }
  }

  function allowDiscard(message) {
    return !dirty || window.confirm(message);
  }

  function changeSelection() {
    if (!allowDiscard('丢弃未应用更改并切换？')) {
      typeSelect.value = selectedType;
      paletteSelect.value = selectedPalette;
      return;
    }
    selectedType = typeSelect.value;
    selectedPalette = paletteSelect.value;
    loadSelection();
    announce('');
  }

  typeSelect.addEventListener('change', changeSelection);
  paletteSelect.addEventListener('change', changeSelection);
  backgroundSelect.addEventListener('change', () => {
    root.dataset.previewBackground = backgroundSelect.value;
  });
  share.addEventListener('change', markDirty);

  image.addEventListener('load', () => {
    imageReady = true;
    crosshair.hidden = false;
    updateControls();
  });
  image.addEventListener('error', () => {
    imageReady = false;
    crosshair.hidden = true;
    updateControls();
    announce('无法显示当前指针图片，请重新选择 SVG / PNG / CUR 文件。', 'error');
  });

  importButton.addEventListener('click', () => {
    if (!busy && ready) fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || busy || !ready) return;
    setBusy(true);
    try {
      const asset = await importCursorFile(file);
      setDraft(asset, true);
      announce('');
    } catch (error) {
      announce(`导入失败：${errorText(error)}`, 'error');
    } finally {
      fileInput.value = '';
      await finishBusy();
    }
  });

  function setHotspot(x, y, syncInputs = true) {
    draft.hotspot = [x, y];
    draft.hotspotOrigin = 'manual';
    if (syncInputs) syncCoordinateInputs();
    renderHotspot();
    markDirty();
  }

  function readCoordinateInputs() {
    if (!draft || busy) return;
    const values = [xInput.valueAsNumber, yInput.valueAsNumber];
    const inputs = [xInput, yInput];
    const invalidIndex = values.findIndex((value, index) => !Number.isFinite(value) || value < 0 || value >= draft.sourceSize[index]);
    inputs.forEach((input, index) => {
      if (!Number.isFinite(values[index]) || values[index] < 0 || values[index] >= draft.sourceSize[index]) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    });
    invalidHotspot = invalidIndex !== -1;
    if (invalidHotspot) {
      element('hotspot-bounds').textContent = `${invalidIndex === 0 ? 'X' : 'Y'} 需大于等于 0 且小于 ${draft.sourceSize[invalidIndex]}。`;
      markDirty();
      return;
    }
    element('hotspot-bounds').textContent = '';
    setHotspot(values[0], values[1], false);
  }
  xInput.addEventListener('input', readCoordinateInputs);
  yInput.addEventListener('input', readCoordinateInputs);

  function boundedCoordinate(value, size) {
    // 留在源画布的半开区间内，避免边缘点击得到恰好等于宽高的无效坐标。
    return Math.min(size - Math.min(0.001, size / 1000), Math.max(0, Number(value.toPrecision(6))));
  }

  function moveFromPointer(event) {
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setHotspot(
      boundedCoordinate((event.clientX - rect.left) / rect.width * draft.sourceSize[0], draft.sourceSize[0]),
      boundedCoordinate((event.clientY - rect.top) / rect.height * draft.sourceSize[1], draft.sourceSize[1]),
    );
  }

  calibrator.addEventListener('pointerdown', event => {
    if (busy || !imageReady || !draft || !event.isPrimary || event.button !== 0) return;
    const rect = image.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    event.preventDefault();
    calibrator.focus({ preventScroll: true });
    pointerId = event.pointerId;
    calibrator.setPointerCapture(pointerId);
    moveFromPointer(event);
  });
  calibrator.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    moveFromPointer(event);
  });
  calibrator.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    moveFromPointer(event);
    stopDrag();
  });
  calibrator.addEventListener('pointercancel', stopDrag);
  calibrator.addEventListener('lostpointercapture', () => { pointerId = null; });
  calibrator.addEventListener('keydown', event => {
    if (!draft || busy || !imageReady || event.altKey || event.ctrlKey || event.metaKey) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    setHotspot(...draft.hotspot.map((value, index) => direction[index]
      ? boundedCoordinate(value + direction[index] * step, draft.sourceSize[index]) : value));
  });

  trial.addEventListener('click', event => {
    if (busy || !imageReady || !draft) return;
    const bounds = trial.getBoundingClientRect();
    const x = Math.max(0, Math.min(trial.clientWidth, event.clientX - bounds.left - trial.clientLeft));
    const y = Math.max(0, Math.min(trial.clientHeight, event.clientY - bounds.top - trial.clientTop));
    trialMarker.style.left = `${x}px`;
    trialMarker.style.top = `${y}px`;
    trialMarker.hidden = false;
    trialResult.textContent = `落点：${Math.round(x)}, ${Math.round(y)}`;
  });

  apply.addEventListener('click', async () => {
    if (busy || !draft || !dirty || invalidHotspot || !imageReady) return;
    const palettes = share.checked ? ['light', 'dark'] : [selectedPalette];
    setBusy(true);
    try {
      savedState = await saveCursorAsset(selectedType, palettes, structuredClone(draft));
      readFailure = '';
      loadSelection();
      announce(`已保存：${selectedType} · ${palettes.map(palette => PALETTE_NAMES[palette]).join(' / ')}`, 'success');
    } catch (error) {
      announce(`保存失败：${errorText(error)}`, 'error');
    } finally {
      await finishBusy();
    }
  });

  reset.addEventListener('click', async () => {
    if (busy || !ready) return;
    if (!allowDiscard(`将 ${selectedType} · ${PALETTE_NAMES[selectedPalette]} 恢复默认并丢弃未应用更改？`)) return;
    setBusy(true);
    try {
      savedState = await resetCursorAsset(selectedType, [selectedPalette]);
      readFailure = '';
      loadSelection();
      announce(`已恢复默认：${selectedType} · ${PALETTE_NAMES[selectedPalette]}`, 'success');
    } catch (error) {
      announce(`恢复失败：${errorText(error)}`, 'error');
    } finally {
      await finishBusy();
    }
  });

  reload.addEventListener('click', async () => {
    if (busy || !allowDiscard('丢弃未应用更改并重新载入？')) return;
    // 读取失败时仍保留草稿，只有成功取得新状态后才替换它。
    const previousDirty = dirty;
    setBusy(true);
    try {
      savedState = await readCursorOverrides();
      ready = true;
      readFailure = '';
      loadSelection();
      announce('');
    } catch (error) {
      dirty = previousDirty;
      readFailure = `读取指针资源失败：${errorText(error)}`;
      announce(readFailure, 'error');
    } finally {
      await finishBusy();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !Object.hasOwn(changes, 'cursorOverrides')) return;
    if (busy) pendingRefresh = true;
    else void refreshSavedState();
  });
  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  await refreshSavedState();
}
