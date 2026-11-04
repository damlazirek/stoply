#!/usr/bin/env node
/**
 * Stoply – GTFS → uygulama verisi dönüştürücü
 *
 * Kullanım:
 *   node scripts/build-city-data.mjs <gtfs-klasörü> <şehir-adı> [çıktı.json]
 *   örn: node scripts/build-city-data.mjs ./gtfs/gaziantep gaziantep assets/data/gaziantep.json
 *
 * Ne üretir?
 *  - stops:  { [stopId]: [ad, lat, lon] }  (sadece hatlarda kullanılan duraklar)
 *  - routes: [{ id, code, name, color, agency, dirs: [{ d, headsign, shape, stops }] }]
 *      shape: [[lat, lon], ...]          sadeleştirilmiş hat çizgisi
 *      stops: [[stopId, metre, saniye]]  sıralı duraklar; metre = hat başından mesafe,
 *                                        saniye = ilk duraktan itibaren ortalama süre (medyan)
 *
 * Bağımlılık yok, sadece Node.js (v18+).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [, , gtfsDir, cityName, outArg] = process.argv;
if (!gtfsDir || !cityName) {
  console.error('Kullanım: node scripts/build-city-data.mjs <gtfs-klasörü> <şehir-adı> [çıktı.json]');
  process.exit(1);
}
const outFile = outArg || path.join('assets', 'data', `${cityName}.json`);

// ---------- CSV yardımcıları ----------
function parseLine(line) {
  // GTFS CSV: tırnaklı alanları da destekleyen basit ayrıştırıcı
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(gtfsDir, file), 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (let line of rl) {
    if (!line) continue;
    if (!header) { header = parseLine(line.replace(/^﻿/, '')); continue; }
    const v = parseLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = v[i]; });
    onRow(row);
  }
}

// ---------- Geometri ----------
const R = 6371000;
const toRad = (x) => (x * Math.PI) / 180;
function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// Küçük alanlar için yerel düzlem (metre) projeksiyonu
function toXY(p, ref) {
  return [toRad(p[1] - ref[1]) * R * Math.cos(toRad(ref[0])), toRad(p[0] - ref[0]) * R];
}
function projectOnSegment(p, a, b, ref) {
  const P = toXY(p, ref), A = toXY(a, ref), B = toXY(b, ref);
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const X = A[0] + t * dx, Y = A[1] + t * dy;
  return { t, dist: Math.hypot(P[0] - X, P[1] - Y) };
}
// Douglas–Peucker sadeleştirme (tolerans metre)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const ref = pts[0];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = projectOnSegment(pts[i], pts[s], pts[e], ref).dist;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Durakları sırayla hat çizgisine yerleştir; her durağın hat başından mesafesini döndür
function stopsAlongShape(shape, stopPts) {
  const cum = [0];
  for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + haversine(shape[i - 1], shape[i]));
  // 1) Her durak için aday konumlar: hat çizgisine yakın geçtiği her "yerel minimum".
  //    (Hat aynı caddeden gidip dönebildiği için bir durak çizgiye birden çok yerde yakın olabilir.)
  const candidates = stopPts.map((sp) => {
    const segs = [];
    for (let i = 0; i < shape.length - 1; i++) {
      const pr = projectOnSegment(sp, shape[i], shape[i + 1], sp);
      segs.push({ d: pr.dist, m: cum[i] + pr.t * (cum[i + 1] - cum[i]) });
    }
    const best = segs.reduce((a, b) => (b.d < a.d ? b : a));
    const limit = Math.max(80, best.d + 40);
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      const c = segs[i];
      if (c.d > limit) continue;
      const prev = segs[i - 1], next = segs[i + 1];
      if ((!prev || prev.d >= c.d) && (!next || next.d >= c.d)) out.push(c);
    }
    return out.length ? out : [best];
  });

  // 2) Dinamik programlama: durak sırası boyunca ileri giden ve çizgiye en yakın kalan
  //    aday zincirini seç. Geriye gitmek ağır cezalı.
  const BACK_PENALTY = 5;
  const n = stopPts.length;
  const cost = candidates.map((c) => c.map(() => Infinity));
  const from = candidates.map((c) => c.map(() => -1));
  candidates[0].forEach((c, j) => { cost[0][j] = c.d + c.m * 0.01; }); // ilk durak hat başına yakın olmalı
  for (let i = 1; i < n; i++) {
    candidates[i].forEach((c, j) => {
      candidates[i - 1].forEach((p, k) => {
        const back = Math.max(0, p.m - c.m - 30);
        const v = cost[i - 1][k] + c.d + back * BACK_PENALTY;
        if (v < cost[i][j]) { cost[i][j] = v; from[i][j] = k; }
      });
    });
  }
  let j = cost[n - 1].indexOf(Math.min(...cost[n - 1]));
  const result = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const c = candidates[i][j];
    result[i] = { m: Math.round(c.m), off: Math.round(c.d) };
    j = from[i][j];
  }
  return result;
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const toSec = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
const r5 = (x) => Math.round(x * 1e5) / 1e5;

// ---------- Ana akış ----------
console.time('toplam');
const agencies = {};
await eachRow('agency.txt', (r) => { agencies[r.agency_id] = r.agency_name; });

const routes = {};
await eachRow('routes.txt', (r) => {
  routes[r.route_id] = {
    id: r.route_id,
    code: r.route_short_name,
    name: r.route_long_name,
    color: r.route_color ? `#${r.route_color}` : '#FF6600',
    agency: agencies[r.agency_id] || '',
    type: Number(r.route_type || 3),
  };
});

const trips = {};
await eachRow('trips.txt', (r) => {
  trips[r.trip_id] = { route: r.route_id, dir: r.direction_id || '0', headsign: r.trip_headsign, shape: r.shape_id };
});

const allStops = {};
await eachRow('stops.txt', (r) => { allStops[r.stop_id] = [r.stop_name.trim(), Number(r.stop_lat), Number(r.stop_lon)]; });

const shapes = {};
await eachRow('shapes.txt', (r) => {
  (shapes[r.shape_id] ||= []).push([Number(r.shape_pt_sequence), Number(r.shape_pt_lat), Number(r.shape_pt_lon)]);
});
for (const k in shapes) shapes[k] = shapes[k].sort((a, b) => a[0] - b[0]).map(([, la, lo]) => [la, lo]);

console.log('stop_times okunuyor (büyük dosya)...');
const tripStops = {};
await eachRow('stop_times.txt', (r) => {
  (tripStops[r.trip_id] ||= []).push([Number(r.stop_sequence), r.stop_id, toSec(r.arrival_time)]);
});

// route+yön bazında en sık görülen durak dizisini (pattern) seç
const patterns = {}; // key -> { seqKey -> { count, stops, offsets[][] , headsign, shape } }
for (const [tid, list] of Object.entries(tripStops)) {
  const t = trips[tid];
  if (!t) continue;
  list.sort((a, b) => a[0] - b[0]);
  const key = `${t.route}|${t.dir}`;
  const seqKey = list.map((x) => x[1]).join(',');
  const bucket = ((patterns[key] ||= {})[seqKey] ||= { count: 0, stops: list.map((x) => x[1]), offsets: [], headsign: t.headsign, shape: t.shape });
  bucket.count++;
  const t0 = list[0][2];
  bucket.offsets.push(list.map((x) => x[2] - t0));
}

const usedStops = new Set();
const outRoutes = [];
let warnFar = 0;
for (const r of Object.values(routes)) {
  const dirs = [];
  for (const d of ['0', '1']) {
    const pats = patterns[`${r.id}|${d}`];
    if (!pats) continue;
    const best = Object.values(pats).sort((a, b) => b.count - a.count)[0];
    const rawShape = shapes[best.shape] || best.stops.map((s) => allStops[s].slice(1));
    const along = stopsAlongShape(rawShape, best.stops.map((s) => allStops[s].slice(1)));
    const offs = best.stops.map((_, i) => median(best.offsets.map((o) => o[i])));
    along.forEach((a) => { if (a.off > 150) warnFar++; });
    best.stops.forEach((s) => usedStops.add(s));
    // Kaynak veride bazı durakların sırası karışık olabiliyor. Takip için doğruyu
    // harita söyler: durakları hat çizgisi üzerindeki konumlarına (metre) göre sırala.
    const ordered = best.stops
      .map((s, i) => [s, along[i].m, offs[i]])
      .sort((a, b) => a[1] - b[1]);
    dirs.push({
      d: Number(d),
      headsign: best.headsign,
      shape: simplify(rawShape, 4).map(([la, lo]) => [r5(la), r5(lo)]),
      stops: ordered,
    });
  }
  if (dirs.length) outRoutes.push({ ...r, dirs });
}

const natural = (a, b) => a.code.localeCompare(b.code, 'tr', { numeric: true });
outRoutes.sort(natural);

const outStops = {};
for (const s of usedStops) { const [n, la, lo] = allStops[s]; outStops[s] = [n, r5(la), r5(lo)]; }

const output = {
  city: cityName,
  generatedAt: new Date().toISOString(),
  source: 'KentKart verisi, Egezenn/kk-gtfs aracılığıyla (https://github.com/Egezenn/kk-gtfs)',
  stops: outStops,
  routes: outRoutes,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(output));
const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`✔ ${outRoutes.length} hat, ${usedStops.size} durak → ${outFile} (${kb} KB)`);
if (warnFar) console.log(`⚠ ${warnFar} durak hat çizgisine 150 m'den uzak (veri kaynaklı olabilir)`);
console.timeEnd('toplam');
