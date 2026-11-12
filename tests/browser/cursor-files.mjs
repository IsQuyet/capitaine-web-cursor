import { bytesToDataURL } from '../../src/shared/cursor-assets.js';

export function svgFile(color = '#e65b46', width = 24, height = 24) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="${color}" d="M2 2L20 12L12 14L8 22Z"/></svg>`);
}

export async function pngFile(page, width = 32, height = 32) {
  const base64 = await page.evaluate(([width, height]) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#167d97';
    context.fillRect(2, 2, Math.max(1, width - 4), Math.max(1, height - 4));
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  return Buffer.from(base64, 'base64');
}

export function multiCurFile(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(2, 2); header.writeUInt16LE(images.length, 4);
  let start = header.length;
  images.forEach(({ png, hotspot, size }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size[0] === 256 ? 0 : size[0];
    header[entry + 1] = size[1] === 256 ? 0 : size[1];
    header.writeUInt16LE(hotspot[0], entry + 4); header.writeUInt16LE(hotspot[1], entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(start, entry + 12);
    start += png.length;
  });
  return Buffer.concat([header, ...images.map(image => image.png)]);
}

export function curFile(png, hotspot = [7, 9], size = [32, 32]) {
  return multiCurFile([{ png, hotspot, size }]);
}

export function fileAsset(bytes, format = 'svg', options = {}) {
  const size = options.sourceSize || (format === 'svg' ? [24, 24] : [32, 32]);
  const mime = { svg: 'image/svg+xml', png: 'image/png', cur: 'image/x-icon' }[format];
  return {
    id: 'test-custom', name: `测试.${format}`, format,
    source: { kind: 'file', dataUrl: bytesToDataURL(bytes, mime) },
    sourceSize: size,
    displaySize: options.displaySize || (format === 'svg' ? [32, 32] : size),
    hotspot: options.hotspot || (format === 'cur' ? [7, 9] : [3, 6]),
    hotspotOrigin: options.hotspotOrigin || (format === 'cur' ? 'embedded' : 'manual'),
  };
}

export async function setAsset(extension, asset, palettes = ['light', 'dark'], type = 'grab') {
  await extension.worker.evaluate(async ({ asset, palettes, type }) => {
    const state = { assets: { [asset.id]: asset }, bindings: { light: {}, dark: {} } };
    for (const palette of palettes) state.bindings[palette][type] = asset.id;
    await chrome.storage.local.set({ cursorOverrides: state });
  }, { asset, palettes, type });
}
