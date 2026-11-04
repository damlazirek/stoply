/**
 * Stoply – Yolculuk takip mantığı
 *
 * Saf JavaScript: React Native'e, haritaya ya da konum API'sine bağlı değil.
 * Bu sayede bilgisayarda test edilebilir (bkz. tests/tracker.test.mjs).
 *
 * Kullanım:
 *   const tracker = createTripTracker({ direction, stops, targetIndex, alert: { mode: 'stops', value: 2 } });
 *   const state = tracker.update({ lat, lon, accuracy, timestamp });
 *   if (state.justAlerted) bildirimGönder();
 */
import { cumulative, projectOnSegment, pointAt } from './geo.js';

export const ALERT_MODES = ['stops', 'meters', 'minutes'];

/** Kullanıcı ne ayarlarsa ayarlasın, hedefe bu kadar yaklaşınca mutlaka uyar. */
const SAFETY_METERS = 150;
/** Hedefi bu kadar geçersek "durağı kaçırdın" uyarısı. */
const PASSED_METERS = 80;
/** Konum hat çizgisinden bu kadar uzaksa "hat dışındasın" say. */
const OFF_ROUTE_METERS = 120;
/** GPS titremesine karşı: geriye bu kadardan az gidişleri yok say. */
const JITTER_BACK_METERS = 60;

/**
 * @param {object} opts
 * @param {{ shape: number[][], stops: [string, number, number][] }} opts.direction  şehir verisindeki yön
 * @param {Record<string, [string, number, number]>} opts.stops                    durak sözlüğü
 * @param {number} opts.targetIndex   inilecek durağın direction.stops içindeki sırası
 * @param {{ mode: 'stops'|'meters'|'minutes', value: number }} opts.alert
 */
export function createTripTracker({ direction, stops, targetIndex, alert }) {
  if (!ALERT_MODES.includes(alert.mode)) throw new Error(`Bilinmeyen uyarı modu: ${alert.mode}`);
  const shape = direction.shape;
  const cum = cumulative(shape);
  const totalM = cum[cum.length - 1];
  const stopMs = direction.stops.map((s) => s[1]);
  const targetM = stopMs[targetIndex];

  // Hattın ortalama hızı (yedek hız): toplam mesafe / toplam süre
  const lastOffset = Math.max(...direction.stops.map((s) => s[2]));
  const routeSpeed = lastOffset > 0 ? Math.max(3, Math.min(15, totalM / lastOffset)) : 6;

  let lastM = null; // seçili konum (hat başından metre)
  let lastTs = null;
  let speed = null; // m/s
  let history = []; // [ts, m] – hız tahmini için son konumlar
  let alerted = false;
  let passedAlerted = false;

  /**
   * Hat aynı caddeden gidip dönebilir ya da sonu başına yakın geçebilir. Bu yüzden
   * belirsizlik varsa birden çok "olasılık" (hipotez) birlikte takip edilir:
   * her biri kendi konumunu sürekliliğe göre ilerletir, hat çizgisine en iyi uyan kazanır.
   * Otobüs ilerledikçe hareket yönü yanlış olasılıkları eler.
   */
  let hyps = []; // { m, err, dist }
  let updates = 0;
  const MAX_HYPS = 4;

  /** Konumun hat çizgisinin her parçasına izdüşümü */
  function projectAll(p) {
    const out = new Array(shape.length - 1);
    for (let i = 0; i < shape.length - 1; i++) {
      const pr = projectOnSegment(p, shape[i], shape[i + 1]);
      out[i] = { m: cum[i] + pr.t * (cum[i + 1] - cum[i]), dist: pr.dist };
    }
    return out;
  }

  /** Çizgiye yakın geçilen her yer (yerel minimumlar), birbirinden en az 200 m ayrı */
  function passes(cands, slack) {
    const best = cands.reduce((a, b) => (b.dist < a.dist ? b : a));
    const out = [];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c.dist > best.dist + slack) continue;
      const pv = cands[i - 1];
      const nx = cands[i + 1];
      if ((pv && pv.dist < c.dist) || (nx && nx.dist < c.dist)) continue;
      if (out.some((o) => Math.abs(o.m - c.m) < 200)) continue;
      out.push(c);
    }
    return { best, list: out.length ? out : [best] };
  }

  function locate(p, ts) {
    const cands = projectAll(p);
    const { best, list } = passes(cands, 40);

    if (!hyps.length) {
      // İlk konum: tüm geçişler birer olasılık. Kullanıcı hedefinden önce bindiği için
      // hedeften sonraki geçişlere küçük bir ceza.
      hyps = list.map((c) => ({ m: c.m, dist: c.dist, err: c.dist + (c.m > targetM ? 30 : 0) }));
    } else {
      const dt = Math.max(0, (ts - lastTs) / 1000);
      const v = speed ?? routeSpeed;
      const w = dt < 90 ? 0.15 : 0.03; // uzun GPS kesintisinde süreklilik daha az önemli
      for (const h of hyps) {
        const expected = h.m + v * dt;
        let pick = null;
        for (const c of cands) {
          if (c.m < h.m - JITTER_BACK_METERS) continue; // otobüs geri gitmez
          const score = c.dist + w * Math.abs(c.m - expected);
          if (!pick || score < pick.score) pick = { ...c, score };
        }
        if (!pick) pick = { m: h.m, dist: Infinity };
        h.m = Math.max(h.m, pick.m);
        h.dist = pick.dist;
        h.err = h.err * 0.6 + Math.min(pick.dist, 500) * 0.4;
      }
      // Kurtarma: hiçbir olasılığın yakınında olmayan iyi bir geçiş varsa onu da ekle
      for (const c of list) {
        if (hyps.every((h) => Math.abs(h.m - c.m) > 300) && c.dist + 30 < Math.min(...hyps.map((h) => h.dist))) {
          hyps.push({ m: c.m, dist: c.dist, err: c.dist + 40 });
        }
      }
      // Çakışanları birleştir, en iyileri tut
      hyps.sort((a, b) => a.err - b.err);
      hyps = hyps.filter((h, i) => hyps.findIndex((o) => Math.abs(o.m - h.m) < 100) === i).slice(0, MAX_HYPS);
    }

    // Kazanan: en düşük hata; eşitlikte hat üzerinde daha geride olan (hedeften erken uyarmamak için)
    let win = hyps[0];
    for (const h of hyps) {
      if (h.err < win.err - 5 || (Math.abs(h.err - win.err) <= 5 && h.m < win.m)) win = h;
    }
    // Belirsizlik: başka bir olasılık neredeyse aynı derecede iyi mi?
    const rival = hyps.find((h) => h !== win && Math.abs(h.m - win.m) > 300 && h.err - win.err < 25);
    return {
      m: win.m,
      dist: Math.min(win.dist, best.dist + 500),
      switched: lastM !== null && Math.abs(win.m - lastM) > 400,
      ambiguous: Boolean(rival),
    };
  }

  /** Son ~45 sn'lik konumlardan ortalama hız (GPS gürültüsüne dayanıklı) */
  function estimateSpeed(ts, m) {
    history.push([ts, m]);
    while (history.length > 2 && ts - history[0][0] > 45000) history.shift();
    const [t0, m0] = history[0];
    const dt = (ts - t0) / 1000;
    if (dt < 10) return speed; // yeterli veri yok
    const v = Math.max(0, (m - m0) / dt);
    return v < 30 ? v : speed;
  }

  function stopsBetween(fromM, toM) {
    let n = 0;
    for (const m of stopMs) if (m > fromM + 15 && m <= toM + 15) n++;
    return n;
  }

  /**
   * Yeni bir konum geldiğinde çağır.
   * @param {{ lat: number, lon: number, accuracy?: number, timestamp?: number }} pos
   */
  function update(pos) {
    const ts = pos.timestamp ?? Date.now();
    const loc = locate([pos.lat, pos.lon], ts);
    const offRoute = loc.dist > OFF_ROUTE_METERS + (pos.accuracy || 0);

    const m = loc.m;
    if (loc.switched) history = []; // farklı geçişe atladık, hız geçmişini sıfırla
    updates++;
    // Yolculuğun başında hangi geçişte olduğumuz belirsizse, yanlış (erken) uyarı vermemek
    // için birkaç konum bekle. Belirsizlik sürse bile en fazla ~10 konum beklenir.
    const unsure = loc.ambiguous && updates <= 10;
    if (!offRoute) speed = estimateSpeed(ts, m);
    lastM = m;
    lastTs = ts;

    const userM = lastM ?? m;
    const remainingM = Math.max(0, targetM - userM);
    const remainingStops = stopsBetween(userM, targetM);
    // Süre tahmini: duran otobüste (trafik/durak) hız sıfıra düşebilir, alt sınır koy
    const effSpeed = Math.max(speed ?? routeSpeed, 2.5);
    const etaSec = Math.round(remainingM / effSpeed);
    const passed = userM > targetM + PASSED_METERS;

    let userWants = false;
    if (alert.mode === 'stops') userWants = remainingStops <= alert.value;
    else if (alert.mode === 'meters') userWants = remainingM <= alert.value;
    else userWants = etaSec <= alert.value * 60;
    const safety = remainingM <= SAFETY_METERS;

    let justAlerted = false;
    let justPassed = false;
    if (!offRoute && !unsure && !alerted && (userWants || safety || passed)) {
      alerted = true;
      justAlerted = true;
    }
    if (!offRoute && !unsure && passed && !passedAlerted) {
      passedAlerted = true;
      justPassed = true;
    }

    let phase;
    if (passed) phase = 'passed';
    else if (remainingM <= 40 || remainingStops === 0) phase = 'arrived';
    else if (alerted) phase = 'alert';
    else if (remainingM < 2000) phase = 'approaching';
    else phase = 'far';

    // İlk durak → hedef arası ilerleme (karakter animasyonu için)
    const startM = stopMs[0];
    const progress = Math.max(0, Math.min(1, (userM - startM) / Math.max(1, targetM - startM)));

    return {
      userM: Math.round(userM),
      snapped: pointAt(shape, cum, userM), // haritada karakterin duracağı nokta
      distanceFromRoute: Math.round(loc.dist),
      offRoute,
      remainingM: Math.round(remainingM),
      remainingStops,
      nextStopIndex: stopMs.findIndex((sm) => sm > userM + 15),
      etaSec,
      speedKmh: speed === null ? null : Math.round(speed * 3.6),
      progress,
      phase,
      justAlerted,
      justPassed,
      recommendedIntervalMs: recommendedInterval(remainingM, alerted),
    };
  }

  return {
    update,
    targetM,
    targetStop: stops[direction.stops[targetIndex][0]],
    /** Uyarıyı yeniden kur (ör. kullanıcı "ertele" dedi) */
    reset() { alerted = false; passedAlerted = false; },
  };
}

/** Pil dostu: hedefe uzaktayken seyrek, yaklaştıkça sık konum iste. */
export function recommendedInterval(remainingM, alerted) {
  if (alerted || remainingM < 800) return 3000;
  if (remainingM < 2000) return 8000;
  if (remainingM < 5000) return 15000;
  return 30000;
}

/** Kullanıcı konumuna göre hattın hangi yönünde olabileceğini tahmin et (bonus yardımcı). */
export function nearestStopIndex(direction, stops, lat, lon) {
  let best = -1;
  let bestD = Infinity;
  direction.stops.forEach(([id], i) => {
    const s = stops[id];
    const d = (s[1] - lat) ** 2 + ((s[2] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
