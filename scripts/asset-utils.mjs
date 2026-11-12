import { CURSOR_TYPES } from '../src/shared/cursor-types.js';

export function parseHotspot(spec) {
  const match = spec.trim().match(/^(\d+)\s+(\d+)$/u);
  if (!match) throw new Error('静态指针 .spec 必须且只能包含两个非负整数热点坐标。');
  return [Number(match[1]), Number(match[2])];
}

export function svgDimensions(svg) {
  const tag = svg.match(/<svg\b[^>]*>/u)?.[0];
  const width = Number(tag?.match(/\swidth\s*=\s*["']([\d.]+)(?:px)?["']/u)?.[1]);
  const height = Number(tag?.match(/\sheight\s*=\s*["']([\d.]+)(?:px)?["']/u)?.[1]);
  // 热点定义在24px画布上。部分 viewBox 存在浮点误差，不能用它缩放整数热点。
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG 根节点必须声明有效的像素宽高。');
  }
  return { width, height };
}

export function resizeSvg(svg, outputSize) {
  svgDimensions(svg);
  if (!Number.isInteger(outputSize) || outputSize < 1 || outputSize > 128) {
    throw new Error('输出尺寸必须为 1 到 128 之间的整数。');
  }
  // 只改 SVG 根节点的显示尺寸，保留 viewBox、路径、滤镜和全部内部坐标。
  return svg.replace(/<svg\b[^>]*>/u, tag => tag.replace(
    /(\s)(width|height)\s*=\s*["'][\d.]+(?:px)?["']/gu,
    (_match, space, name) => `${space}${name}="${outputSize}"`,
  ));
}

export function scaleHotspot(hotspot, dimensions, outputSize) {
  const scale = outputSize / Math.max(dimensions.width, dimensions.height);
  if (!Number.isInteger(outputSize) || outputSize < 1 || outputSize > 128) {
    throw new Error('输出尺寸必须为 1 到 128 之间的整数。');
  }
  return hotspot.map((coordinate, index) => {
    const size = index === 0 ? dimensions.width : dimensions.height;
    if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate >= size) {
      throw new Error('热点必须位于源图范围内。');
    }
    const result = Math.floor(coordinate * scale);
    if (result >= outputSize) throw new Error('缩放后的热点超出输出图片范围。');
    return result;
  });
}

export function validateSourceMap(config) {
  if (Object.keys(config.cursors).length !== CURSOR_TYPES.length
      || CURSOR_TYPES.some(type => typeof config.cursors[type] !== 'string')) {
    throw new Error('源素材清单必须精确包含十种 CSS 指针类型。');
  }
  const names = Object.values(config.cursors);
  if (new Set(names).size !== CURSOR_TYPES.length) {
    throw new Error('每种 CSS 类型必须使用独立的源素材。');
  }
  if (names.some(name => !/^[a-z][a-z-]*$/u.test(name))) {
    throw new Error('源素材名包含不允许的字符。');
  }
}
