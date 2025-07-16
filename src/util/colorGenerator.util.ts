import * as crypto from 'crypto';

//구분 잘 가는 HEX 팔레트 (검은색 제외, 30개)
const HEX_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
  '#000075', '#808080', '#a9a9a9', '#ffd700', '#00ff00', '#00ced1',
  '#ff1493', '#7cfc00', '#ff4500', '#4682b4', '#dda0dd', '#bdb76b',
  '#ff6347', // ... 필요시 더 추가
].filter(c => c.toLowerCase() !== '#000000'); // 검은색 배제

// HSL의 Hue, Saturation, Lightness 조합
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

function getDistinctColorIndex(max: number): number {
  // 골고루 섞인 인덱스(0, max/2, max/4, 3*max/4, ...)
  // Van der Corput sequence 등도 가능하지만, 간단히 섞음
  const idx = Math.floor(Math.random() * max);
  return ((idx * 37) % max); // 37은 200 이하에서 최대한 골고루 분포
}

export function generatorColor(user_id: number, canvas_id: string, maxPeople: number = 1000): string {
  // user_id와 canvas_id 조합을 해시해서 골고루 분산
  const hash = crypto.createHash('md5').update(`${user_id}_${canvas_id}`).digest('hex');
  const hashIndex = parseInt(hash.slice(0, 8), 16) % maxPeople;
  
  // 1. HEX 팔레트 우선 배정
  if (hashIndex < HEX_PALETTE.length) {
    return HEX_PALETTE[hashIndex];
  }
  // 2. 부족하면 HSL 조합으로 생성 (검은색만 배제)
  const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const sats = [40, 60, 80, 100, 85];
  const lights = [35, 50, 65, 80, 90];
  const total = hues.length * sats.length * lights.length;
  if (hashIndex < HEX_PALETTE.length + total) {
    const hIdx = Math.floor((hashIndex - HEX_PALETTE.length) / (sats.length * lights.length)) % hues.length;
    const sIdx = Math.floor((hashIndex - HEX_PALETTE.length) / lights.length) % sats.length;
    const lIdx = (hashIndex - HEX_PALETTE.length) % lights.length;
    const h = hues[hIdx];
    const s = sats[sIdx];
    const l = lights[lIdx];
    const color = hslToHex(h, s, l);
    if (color.toLowerCase() === '#000000') return '#0074d9';
    return color;
  }
  // 3. 1000명까지: 기존 색상에서 약간씩 변형 (중복 최소화)
  // 기존 HSL 조합을 재활용하되, hashIndex에 따라 H/S/L을 소폭 변화
  const baseIdx = (hashIndex - HEX_PALETTE.length - total) % total;
  const hIdx = Math.floor(baseIdx / (sats.length * lights.length)) % hues.length;
  const sIdx = Math.floor(baseIdx / lights.length) % sats.length;
  const lIdx = baseIdx % lights.length;
  // hashIndex에 따라 약간의 변화(최대 10도, 5%, 5%)
  const h = (hues[hIdx] + ((hashIndex % 10) * 3)) % 360;
  const s = Math.min(100, sats[sIdx] + (hashIndex % 5));
  const l = Math.min(95, lights[lIdx] + (hashIndex % 5));
  const color = hslToHex(h, s, l);
  if (color.toLowerCase() === '#000000') return '#ffffff';
  return color;
}
