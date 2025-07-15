import * as crypto from 'crypto';

/**
 * UUID → 0~999 인덱스로 변환
 */
function uuidToIndex(uuid: string, maxIndex: number = 1000): number {
  const hash = crypto.createHash('md5').update(uuid).digest('hex');
  const hashPrefix = hash.slice(0, 8);
  const numeric = parseInt(hashPrefix, 16);
  return numeric % maxIndex;
}

/**
 * HSL → HEX 변환
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1)))
    );

  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * index → HEX 색상
 */
function generateHexColor(index: number, maxIndex: number): string {
  const hue = Math.floor((360 * index) / maxIndex); // 0 ~ 359
  return hslToHex(hue, 70, 60); // 고정된 채도/명도에서 색상만 변화
}

export function generatorColor(maxIndex: number = 1000) {
  const uuid = crypto.randomUUID(); // UUID 생성
  const index = uuidToIndex(uuid, maxIndex);
  const color = generateHexColor(index, maxIndex);

  return color;
}
