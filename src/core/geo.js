// Basit coğrafi yardımcılar (bağımlılık yok)

const R = 6371000; // Dünya yarıçapı (m)
const toRad = (x) => (x * Math.PI) / 180;

/** İki nokta arası mesafe (metre). Noktalar [lat, lon]. */
export function distance(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Küçük alanlar için yerel düzlem (metre) – ref noktası etrafında
function toXY(p, ref) {
  return [toRad(p[1] - ref[1]) * R * Math.cos(toRad(ref[0])), toRad(p[0] - ref[0]) * R];
}

/**
 * p noktasını a-b doğru parçasına izdüşürür.
 * @returns {{ t: number, dist: number }} t: 0..1 parça üzerindeki oran, dist: metre
 */
export function projectOnSegment(p, a, b) {
  const A = toXY(a, p);
  const B = toXY(b, p);
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? (-A[0] * dx - A[1] * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, dist: Math.hypot(A[0] + t * dx, A[1] + t * dy) };
}

/** Hat çizgisi boyunca kümülatif mesafeler (metre). */
export function cumulative(shape) {
  const cum = [0];
  for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + distance(shape[i - 1], shape[i]));
  return cum;
}

/** Hat çizgisi üzerinde, baştan m metre ilerideki nokta. */
export function pointAt(shape, cum, m) {
  if (m <= 0) return shape[0];
  const last = cum.length - 1;
  if (m >= cum[last]) return shape[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  const t = (m - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [shape[lo][0] + t * (shape[hi][0] - shape[lo][0]), shape[lo][1] + t * (shape[hi][1] - shape[lo][1])];
}
