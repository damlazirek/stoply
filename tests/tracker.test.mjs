// Çalıştır: node --test tests/
// Gerçek B53 verisiyle simüle edilmiş yolculuklar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTripTracker } from '../src/core/tracker.js';
import { cumulative, pointAt, distance } from '../src/core/geo.js';

const city = JSON.parse(fs.readFileSync(new URL('../assets/data/gaziantep.json', import.meta.url)));
const b53 = city.routes.find((r) => r.code === 'B53');
const dir = b53.dirs.find((d) => d.d === 0); // H.KALYONCU ÜNV. → ÖNDERBİRLİK
const targetIndex = dir.stops.findIndex(([id]) => city.stops[id][0].startsWith('PRİMEMALL'));

// Tekrarlanabilir rastgele sayı (seed'li)
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Hat boyunca startM'den endM'ye, saniyede `speed` metre giden ve GPS gürültüsü ekleyen yolculuk */
function* ride({ startM = 0, endM, speed = 8, stepSec = 3, noiseM = 20, seed = 1 }) {
  const cum = cumulative(dir.shape);
  const rand = rng(seed);
  let t = 0;
  for (let m = startM; m <= endM; m += speed * stepSec, t += stepSec) {
    const [lat, lon] = pointAt(dir.shape, cum, m);
    const nLat = ((rand() - 0.5) * 2 * noiseM) / 111320;
    const nLon = ((rand() - 0.5) * 2 * noiseM) / (111320 * Math.cos((lat * Math.PI) / 180));
    yield { trueM: m, pos: { lat: lat + nLat, lon: lon + nLon, accuracy: noiseM, timestamp: t * 1000 } };
  }
}

function make(alert) {
  return createTripTracker({ direction: dir, stops: city.stops, targetIndex, alert });
}

test('B53 verisi ve hedef durak bulundu', () => {
  assert.ok(b53, 'B53 hattı var');
  assert.ok(targetIndex > 0, 'PRİMEMALL AVM durağı var');
  assert.equal(dir.stops.length, 61);
});

test('"2 durak kala" uyarısı tam bir kez ve hedeften önce gelir', () => {
  const tr = make({ mode: 'stops', value: 2 });
  const alerts = [];
  for (const { trueM, pos } of ride({ endM: tr.targetM + 300 })) {
    const s = tr.update(pos);
    if (s.justAlerted) alerts.push({ trueM, s });
  }
  assert.equal(alerts.length, 1);
  const { trueM, s } = alerts[0];
  assert.ok(trueM < tr.targetM, 'hedefe varmadan uyarıldı');
  assert.ok(s.remainingStops <= 2 && s.remainingStops >= 1, `kalan durak: ${s.remainingStops}`);
  // 2 durak kala tetiklendiyse, gerçekte 3. duraktan önce olmamalı
  const stopMs = dir.stops.map((x) => x[1]);
  const twoBefore = stopMs[targetIndex - 2];
  assert.ok(trueM >= twoBefore - 60, 'çok erken uyarmadı');
});

test('"500 m kala" uyarısı ~500 m kala gelir', () => {
  const tr = make({ mode: 'meters', value: 500 });
  let at = null;
  for (const { trueM, pos } of ride({ endM: tr.targetM })) {
    if (tr.update(pos).justAlerted) { at = tr.targetM - trueM; break; }
  }
  assert.ok(at !== null);
  assert.ok(at <= 560 && at >= 380, `uyarı ${Math.round(at)} m kala geldi`);
});

test('"3 dakika kala" uyarısı hıza göre doğru zamanda gelir', () => {
  const speed = 7; // ~25 km/s
  const tr = make({ mode: 'minutes', value: 3 });
  let at = null;
  for (const { trueM, pos } of ride({ endM: tr.targetM, speed })) {
    if (tr.update(pos).justAlerted) { at = (tr.targetM - trueM) / speed; break; }
  }
  assert.ok(at !== null);
  assert.ok(at >= 150 && at <= 200, `uyarı ${Math.round(at)} sn kala geldi`);
});

test('GPS gürültüsünde ilerleme hep ileri gider ve hat dışı sanılmaz', () => {
  const tr = make({ mode: 'stops', value: 1 });
  let prev = -1;
  let offCount = 0;
  for (const { trueM, pos } of ride({ endM: tr.targetM, noiseM: 25, seed: 7 })) {
    const s = tr.update(pos);
    if (s.offRoute) offCount++;
    assert.ok(s.userM >= prev, 'geri gitmedi');
    assert.ok(Math.abs(s.userM - trueM) < 200, `konum sapması: ${Math.abs(s.userM - trueM)} m @${trueM}`);
    prev = s.userM;
  }
  assert.equal(offCount, 0);
});

test('Uyarı kaçırılırsa (ör. GPS kesintisi) durağı geçince "kaçırdın" uyarısı gelir', () => {
  const tr = make({ mode: 'stops', value: 1 });
  // Hedeften 2 km önce bir konum, sonra GPS kesintisi, sonra hedefin 300 m ötesi
  const cum = cumulative(dir.shape);
  const at = (m, t) => { const [lat, lon] = pointAt(dir.shape, cum, m); return { lat, lon, timestamp: t }; };
  assert.equal(tr.update(at(tr.targetM - 2000, 0)).justAlerted, false);
  const s = tr.update(at(tr.targetM + 300, 240000));
  assert.equal(s.justAlerted, true);
  assert.equal(s.justPassed, true);
  assert.equal(s.phase, 'passed');
});

test('Hattan 1 km uzaktaki konum "hat dışı" sayılır ve uyarı tetiklemez', () => {
  const tr = make({ mode: 'meters', value: 99999 });
  const stop = city.stops[dir.stops[5][0]];
  const s = tr.update({ lat: stop[1] + 0.009, lon: stop[2] + 0.009, accuracy: 10, timestamp: 0 });
  assert.equal(s.offRoute, true);
  assert.equal(s.justAlerted, false);
});

test('Gidiş-dönüş yapılan cadde (hat başı) karışmaz', () => {
  // B53'te üniversite çıkışında hat aynı bölgeden iki kez geçiyor
  const tr = make({ mode: 'stops', value: 1 });
  let prev = 0;
  for (const { trueM, pos } of ride({ endM: 8000, noiseM: 10, seed: 3 })) {
    const s = tr.update(pos);
    assert.ok(Math.abs(s.userM - trueM) < 150, `@${Math.round(trueM)} m, tahmin ${s.userM} m`);
    assert.ok(s.userM >= prev);
    prev = s.userM;
  }
});

test('Haritadaki karakter noktası hat üzerinde', () => {
  const tr = make({ mode: 'stops', value: 1 });
  const stop = city.stops[dir.stops[10][0]];
  const s = tr.update({ lat: stop[1], lon: stop[2], timestamp: 0 });
  assert.ok(distance(s.snapped, [stop[1], stop[2]]) < 80);
  assert.ok(s.progress > 0 && s.progress < 1);
});
