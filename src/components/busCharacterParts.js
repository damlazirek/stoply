// Tombul otobüs karakterinin çizimi, saf veri olarak.
// Hem uygulamadaki <BusCharacter> bileşeni hem de önizleme scripti bunu kullanır.
// Koordinatlar 120 x 80'lik bir tuvalde; otobüs sağa bakıyor, yüzü ön tarafta.

export const VIEWBOX = '0 0 120 80';
export const ASPECT = 80 / 120;

const INK = '#2B2118';
const BLUSH = '#FF9E7A';
const BODY = '#FF6600';
const BODY_DARK = '#D95600';
const WINDOW = '#FFE7D1';
const HUB = '#8A7B6E';

const line = { stroke: INK, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

// Gövde: tüm ruh hallerinde aynı
export const BODY_PARTS = [
  { t: 'rect', x: 16, y: 20, width: 88, height: 44, rx: 18, fill: BODY },
  { t: 'rect', x: 20, y: 54, width: 80, height: 4, fill: BODY_DARK },
  { t: 'rect', x: 26, y: 28, width: 14, height: 14, rx: 4, fill: WINDOW },
  { t: 'rect', x: 44, y: 28, width: 14, height: 14, rx: 4, fill: WINDOW },
  { t: 'circle', cx: 36, cy: 64, r: 9, fill: INK },
  { t: 'circle', cx: 84, cy: 64, r: 9, fill: INK },
  { t: 'circle', cx: 36, cy: 64, r: 3.5, fill: HUB },
  { t: 'circle', cx: 84, cy: 64, r: 3.5, fill: HUB },
];

const blush = [
  { t: 'circle', cx: 71, cy: 43, r: 3, fill: BLUSH, opacity: 0.8 },
  { t: 'circle', cx: 97, cy: 43, r: 3, fill: BLUSH, opacity: 0.8 },
];

const dotEyes = (dy = 0) => [
  { t: 'circle', cx: 76, cy: 38 + dy, r: 3.2, fill: INK },
  { t: 'circle', cx: 92, cy: 38 + dy, r: 3.2, fill: INK },
];

const badge = (fill, symbol) => [
  { t: 'circle', cx: 108, cy: 12, r: 9, fill },
  ...symbol,
];

// Ruh halleri: tracker'ın phase değerleri + 'waiting' (konum bekleniyor) ve 'off' (hat dışı)
export const MOOD_PARTS = {
  waiting: [
    { t: 'path', d: 'M72 38 h8 M88 38 h8', ...line },
    { t: 'path', d: 'M80 45 h8', ...line },
  ],
  far: [
    ...blush,
    { t: 'path', d: 'M72 37 q4 4 8 0 M88 37 q4 4 8 0 M79 44 q5 4 10 0', ...line },
  ],
  approaching: [
    ...dotEyes(),
    { t: 'circle', cx: 77, cy: 37, r: 1, fill: '#FFFFFF' },
    { t: 'circle', cx: 93, cy: 37, r: 1, fill: '#FFFFFF' },
    { t: 'ellipse', cx: 84, cy: 46, rx: 2.5, ry: 3, fill: INK },
  ],
  alert: [
    ...dotEyes(1),
    { t: 'path', d: 'M72 32 l7 -2 M89 30 l7 2', ...line, strokeWidth: 2 },
    { t: 'path', d: 'M78 43 q6 8 12 0 z', fill: INK },
    ...badge('#E5484D', [
      { t: 'path', d: 'M108 7 v6', stroke: '#FFFFFF', strokeWidth: 2.5, strokeLinecap: 'round', fill: 'none' },
      { t: 'circle', cx: 108, cy: 17, r: 1.3, fill: '#FFFFFF' },
    ]),
  ],
  arrived: [
    ...blush,
    { t: 'path', d: 'M72 39 l4 -4 l4 4 M88 39 l4 -4 l4 4', ...line },
    { t: 'path', d: 'M77 43 q7 10 14 0 z', fill: INK },
    { t: 'circle', cx: 10, cy: 14, r: 2.5, fill: '#F2A900' },
    { t: 'circle', cx: 112, cy: 10, r: 2.5, fill: '#2E9E6B' },
    { t: 'circle', cx: 5, cy: 40, r: 2.5, fill: '#E5484D' },
    { t: 'circle', cx: 115, cy: 36, r: 2.5, fill: '#6EC1FF' },
    { t: 'circle', cx: 60, cy: 8, r: 2.5, fill: '#F2A900' },
  ],
  passed: [
    { t: 'circle', cx: 76, cy: 37, r: 4.5, fill: '#FFFFFF', stroke: INK, strokeWidth: 1.5 },
    { t: 'circle', cx: 92, cy: 37, r: 4.5, fill: '#FFFFFF', stroke: INK, strokeWidth: 1.5 },
    { t: 'circle', cx: 76, cy: 37, r: 1.8, fill: INK },
    { t: 'circle', cx: 92, cy: 37, r: 1.8, fill: INK },
    { t: 'ellipse', cx: 84, cy: 47, rx: 3, ry: 4, fill: INK },
    { t: 'path', d: 'M102 24 q3 5 0 7 q-3 -2 0 -7 z', fill: '#3B9BE0' },
  ],
  off: [
    ...dotEyes(),
    { t: 'path', d: 'M88 31 l8 -3', ...line, strokeWidth: 2 },
    { t: 'path', d: 'M78 45 q3 -3 6 0 q3 3 6 0', ...line },
    ...badge('#F2A900', [
      { t: 'path', d: 'M105 9 q0 -4 3.5 -4 q3.5 0 3.5 3.5 q0 2.5 -3.5 3.5 v1.5', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round', fill: 'none' },
      { t: 'circle', cx: 108.5, cy: 17, r: 1.3, fill: '#FFFFFF' },
    ]),
  ],
};

export function partsFor(mood) {
  return [...BODY_PARTS, ...(MOOD_PARTS[mood] ?? MOOD_PARTS.far)];
}
