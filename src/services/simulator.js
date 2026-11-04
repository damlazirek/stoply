// Simülasyon modu: evde test ve demo videosu için sahte GPS.
//
// Seçilen hatta, hedef duraktan birkaç durak önce "biner", otobüs hızıyla ilerler,
// her durakta kısa bir süre bekler, hedefi biraz geçip durur (böylece "geldik" ve
// "durağı geçtin" durumları da görülebilir). Konumlara gerçekçi GPS gürültüsü eklenir.
// Her şey hızlandırılmış oynatılır (varsayılan 8x).
//
// simulationPoints() saf JS'tir (React Native'e bağlı değil), Node'da test edilir.
// startSimulation() onu zamanlayıcıyla oynatır.
import { cumulative, pointAt } from '../core/geo.js';

export const SIM_DEFAULTS = {
  stopsBefore: 6, // hedeften kaç durak önce başlasın
  overshootM: 250, // hedefi kaç metre geçip dursun
  speedMps: 8, // ~29 km/s, şehir içi otobüs
  dwellSec: 15, // her durakta bekleme
  stepSec: 3, // iki konum arası (simülasyon zamanı)
  noiseM: 12, // GPS gürültüsü
  speedup: 8, // gerçek zamana göre kaç kat hızlı
  seed: 7,
};

// Tekrarlanabilir rastgele sayı (seed'li)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Simülasyon konumlarını üretir.
 * @returns {Generator<{ lat: number, lon: number, accuracy: number, t: number, trueM: number }>}
 *   t: başlangıçtan beri geçen simülasyon süresi (sn)
 */
export function* simulationPoints({ direction, targetIndex, ...opts }) {
  const o = { ...SIM_DEFAULTS, ...opts };
  const shape = direction.shape;
  const cum = cumulative(shape);
  const totalM = cum[cum.length - 1];
  const stopMs = direction.stops.map((s) => s[1]);

  const startIndex = Math.max(0, targetIndex - o.stopsBefore);
  const startM = stopMs[startIndex];
  const endM = Math.min(totalM, stopMs[targetIndex] + o.overshootM);
  const rand = rng(o.seed);

  // Yol üstündeki duraklar (başlangıç durağı hariç): orada biraz bekle
  const upcoming = stopMs.filter((m) => m > startM && m <= endM);
  let nextStop = 0;
  let dwellLeft = 0;

  let m = startM;
  let t = 0;
  while (true) {
    const [lat, lon] = pointAt(shape, cum, m);
    const nLat = ((rand() - 0.5) * 2 * o.noiseM) / 111320;
    const nLon = ((rand() - 0.5) * 2 * o.noiseM) / (111320 * Math.cos((lat * Math.PI) / 180));
    yield { lat: lat + nLat, lon: lon + nLon, accuracy: o.noiseM, t, trueM: m };

    if (m >= endM) return;
    t += o.stepSec;

    if (dwellLeft > 0) {
      dwellLeft -= o.stepSec;
      continue;
    }
    // Biraz hız dalgalanması (±25%)
    const step = o.speedMps * o.stepSec * (0.75 + rand() * 0.5);
    const stopAt = upcoming[nextStop];
    if (stopAt !== undefined && m + step >= stopAt) {
      m = stopAt;
      nextStop += 1;
      dwellLeft = o.dwellSec;
    } else {
      m = Math.min(endM, m + step);
    }
  }
}

/**
 * Simülasyonu gerçek zamanlı (hızlandırılmış) oynatır.
 * @param {object} opts  simulationPoints seçenekleri + onLocation(expoBenzeriKonum) + onEnd()
 * @returns {{ stop: () => void, speedup: number }}
 */
export function startSimulation({ onLocation, onEnd, ...opts }) {
  const o = { ...SIM_DEFAULTS, ...opts };
  const points = simulationPoints(o);
  const startedAt = Date.now();
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const { value, done } = points.next();
    if (done) {
      stop();
      onEnd?.();
      return;
    }
    // expo-location'ın LocationObject biçiminde; zaman damgası simülasyon saatine göre
    // (böylece takipteki hız ve kalan süre gerçek bir yolculuktaki gibi hesaplanır)
    onLocation({
      coords: { latitude: value.lat, longitude: value.lon, accuracy: value.accuracy },
      timestamp: startedAt + value.t * 1000,
      simulated: true,
    });
  };

  const timer = setInterval(tick, (o.stepSec * 1000) / o.speedup);
  tick(); // ilk konumu bekletmeden ver

  function stop() {
    stopped = true;
    clearInterval(timer);
  }
  return { stop, speedup: o.speedup };
}
