import { bytesToDataURL, MAX_CURSOR_FILE_BYTES, validateCursorAsset } from '../shared/cursor-assets.js';
import { curImages, curRuntimeBytes, pngDimensions } from '../shared/cursor-file-metadata.js';
import map from '../../assets/cursor-map.json';

function sourceSVG(text) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new Error('SVG 不支持文档类型或实体声明。');
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
    throw new Error('SVG 文件无法解析。');
  }
  for (const element of document.querySelectorAll('*')) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard'].includes(element.localName.toLowerCase())) {
      throw new Error('只支持自包含的静态 SVG，不支持脚本、动画或嵌入网页。');
    }
    for (const attribute of element.attributes) {
      if (/^on/iu.test(attribute.localName)) throw new Error('SVG 不能包含事件处理代码。');
      if (attribute.localName === 'href' && !/^(?:#|data:image\/(?:png|jpeg|webp);base64,)/iu.test(attribute.value.trim())) {
        throw new Error('SVG 不能引用外部文件，请先嵌入图片或转为路径。');
      }
      checkSVGStyle(attribute.value);
    }
    if (element.localName === 'style') checkSVGStyle(element.textContent);
  }
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/u).map(Number);
  const dimension = name => {
    const value = root.getAttribute(name)?.trim();
    return value && /^\d+(?:\.\d+)?(?:px)?$/u.test(value) ? Number.parseFloat(value) : null;
  };
  let width = dimension('width');
  let height = dimension('height');
  if (box?.length === 4) {
    if (width === null && height === null) [width, height] = [box[2], box[3]];
    else if (width === null) width = height * box[2] / box[3];
    else if (height === null) height = width * box[3] / box[2];
  }
  const size = [width, height];
  if (size.some(value => !Number.isFinite(value) || value <= 0 || value > 4096)
      || (box && (box.length !== 4 || box.some(value => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0))) {
    throw new Error('SVG 必须提供有效的宽高或 viewBox，源画布最大 4096×4096。');
  }
  root.setAttribute('width', String(size[0]));
  root.setAttribute('height', String(size[1]));
  if (!box) root.setAttribute('viewBox', `0 0 ${size.join(' ')}`);
  return { text: new XMLSerializer().serializeToString(root), size };
}

function checkSVGStyle(text) {
  if (/@import/iu.test(text)) throw new Error('SVG 不支持导入外部样式。');
  for (const match of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/giu)) {
    if (!/^(?:#|data:image\/(?:png|jpeg|webp);base64,)/iu.test(match[1])) {
      throw new Error('SVG 不支持外部图片、滤镜或字体资源。');
    }
  }
}

async function imageSize(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('Chrome 无法解码此指针文件，请检查文件格式。');
  }
  return [image.naturalWidth, image.naturalHeight];
}

export async function importCursorFile(file) {
  if (!file || file.size === 0 || file.size > MAX_CURSOR_FILE_BYTES) throw new Error('请选择不超过 256 KiB 的 SVG、PNG 或 CUR 文件。');
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (!['svg', 'png', 'cur'].includes(extension)) throw new Error('只支持 SVG、PNG 和静态 CUR，暂不支持 ANI。');
  let bytes = new Uint8Array(await file.arrayBuffer());
  let sourceSize;
  let hotspot = [0, 0];
  let hotspotOrigin = 'manual';
  let images;
  if (extension === 'svg') {
    let decoded;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('SVG 请使用 UTF-8 编码。');
    }
    const parsed = sourceSVG(decoded);
    sourceSize = parsed.size;
    bytes = new TextEncoder().encode(parsed.text);
  } else if (extension === 'png') {
    sourceSize = pngDimensions(bytes);
  } else {
    images = curImages(bytes);
    hotspotOrigin = 'embedded';
  }
  const mime = { svg: 'image/svg+xml', png: 'image/png', cur: 'image/x-icon' }[extension];
  const dataUrl = bytesToDataURL(bytes, mime);
  const decodedSize = await imageSize(extension === 'cur' ? bytesToDataURL(curRuntimeBytes(bytes), mime) : dataUrl);
  if (extension === 'cur') {
    const selected = images.find(image => image.size.every((value, index) => value === decodedSize[index]));
    if (!selected || decodedSize.some(value => value > 128)) throw new Error('Chrome 选择的 CUR 图像超过 128×128 或缺少对应热点，请导出合适尺寸版本。');
    sourceSize = [...selected.size];
    hotspot = [...selected.hotspot];
  }
  if (extension === 'png' && sourceSize.some((value, index) => value !== decodedSize[index])) throw new Error('PNG 尺寸与解码结果不一致。');
  const scale = extension === 'svg' ? 32 / Math.max(...sourceSize) : 1;
  const displaySize = sourceSize.map(value => Math.max(1, Math.round(value * scale)));
  return validateCursorAsset({
    id: crypto.randomUUID(), name: file.name.slice(0, 200), format: extension,
    source: { kind: 'file', dataUrl }, sourceSize, displaySize, hotspot, hotspotOrigin,
  }, map);
}
