export function pngDimensions(bytes) {
  if (bytes.length < 33 || bytes.subarray(0, 8).some((value, index) => value !== [137, 80, 78, 71, 13, 10, 26, 10][index])
      || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
    throw new Error('文件不是有效的 PNG。');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = [view.getUint32(16), view.getUint32(20)];
  if (size.some(value => value < 1 || value > 128)) throw new Error('PNG 指针尺寸须在 1 到 128 像素之间，请导出合适尺寸的文件。');
  return size;
}

export function curRuntimeBytes(bytes) {
  const images = curImages(bytes);
  const indices = images.flatMap((image, index) => image.size.every(size => size <= 128) ? [index] : []);
  if (!indices.length) throw new Error('CUR 没有 128×128 以内的可用图像，请导出合适尺寸的版本。');
  if (indices.length === images.length) return bytes;
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = 6 + indices.length * 16 + indices.reduce((sum, index) => sum + input.getUint32(6 + index * 16 + 8, true), 0);
  const result = new Uint8Array(length);
  const output = new DataView(result.buffer);
  output.setUint16(2, 2, true);
  output.setUint16(4, indices.length, true);
  let start = 6 + indices.length * 16;
  indices.forEach((index, position) => {
    const entry = 6 + index * 16;
    const size = input.getUint32(entry + 8, true);
    const offset = input.getUint32(entry + 12, true);
    result.set(bytes.subarray(entry, entry + 16), 6 + position * 16);
    output.setUint32(6 + position * 16 + 12, start, true);
    result.set(bytes.subarray(offset, offset + size), start);
    start += size;
  });
  // 仅为运行时排除浏览器不接受的尺寸，原始 CUR 及各图像字节仍完整保存。
  return result;
}

export function curImages(bytes) {
  if (bytes.length < 6) throw new Error('CUR 文件不完整。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 2) throw new Error('文件不是静态 CUR，暂不支持 ICO 或 ANI。');
  const count = view.getUint16(4, true);
  if (!count || count > 32 || bytes.length < 6 + count * 16) throw new Error('CUR 图像目录无效。');
  const images = [];
  for (let index = 0; index < count; index++) {
    const offset = 6 + index * 16;
    const width = bytes[offset] || 256;
    const height = bytes[offset + 1] || 256;
    const x = view.getUint16(offset + 4, true);
    const y = view.getUint16(offset + 6, true);
    const length = view.getUint32(offset + 8, true);
    const start = view.getUint32(offset + 12, true);
    if (!length || start < 6 + count * 16 || start + length > bytes.length || x >= width || y >= height) {
      throw new Error('CUR 图像数据或内置热点无效。');
    }
    images.push({ size: [width, height], hotspot: [x, y] });
  }
  return images;
}
