// Simülasyon modu: üretilen sahte yolculuk takip mantığında beklenen sırayla
// "uyar → geldik → geçtin" durumlarını oluşturuyor mu?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTripTracker } from '../src/core/tracker.js';
import { SIM_DEFAULTS, simulationPoints } from '../src/services/simulator.js';

const city = JSON.parse(fs.readFileSync(new URL('../assets/data/gaziantep.json', import.meta.url)));
const b53 = city.routes.find((r) => r.code === 'B53');
const dir = b53.dirs.find((d) => d.d === 0);
const targetIndex = dir.stops.findIndex(([id]) => city.stops[id][0].startsWith('PRİMEMALL'));

function runSim({ direction = dir, target = targetIndex, alert = { mode: 'stops', value: 2 }, ...opts } = {}) {
  const tracker = createTripTracker({ direction, stops: city.stops, targetIndex: target, alert });
  const events = [];
  const phases = [];
  let last = null;
  let count = 0;
  for (const p of simulationPoints({ direction, targetIndex: target, ...opts })) {
    const s = tracker.update({ lat: p.lat, lon: p.lon, accuracy: p.accuracy, timestamp: p.t * 1000 });
    count += 1;
    if (s.justAlerted) events.push({ type: 'alert', trueM: p.trueM, remainingStops: s.remainingStops });
    if (s.justPassed) events.push({ type: 'passed', trueM: p.trueM });
    if (s.offRoute) events.push({ type: 'off', trueM: p.trueM });
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    last = { s, p };
  }
  return { events, phases, last, count, targetM: direction.stops[target][1] };
}

test('simülasyon hedeften önce başlar, hedefi biraz geçip biter', () => {
  const pts = [...simulationPoints({ direction: dir, targetIndex })];
  const startM = dir.stops[targetIndex - SIM_DEFAULTS.stopsBefore][1];
  const targetM = dir.stops[targetIndex][1];
  assert.equal(pts[0].trueM, startM);
  assert.equal(pts[pts.length - 1].trueM, targetM + SIM_DEFAULTS.overshootM);
  // Hep ileri gider (geri gitmez)
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].trueM >= pts[i - 1].trueM);
  // 8x hızda telefonda birkaç dakika sürmeli (demo için makul)
  const realSec = pts[pts.length - 1].t / SIM_DEFAULTS.speedup;
  assert.ok(realSec > 30 && realSec < 600, `gerçek süre ${realSec} sn`);
});

test('simülasyonda uyarı hedeften önce bir kez, sonra "geçtin" bir kez gelir', () => {
  const { events, phases, targetM } = runSim();
  const alerts = events.filter((e) => e.type === 'alert');
  const passed = events.filter((e) => e.type === 'passed');
  assert.equal(alerts.length, 1, JSON.stringify(events));
  assert.ok(alerts[0].trueM < targetM, 'uyarı hedefe varmadan geldi');
  assert.equal(passed.length, 1);
  assert.ok(passed[0].trueM > targetM);
  assert.equal(events.filter((e) => e.type === 'off').length, 0, 'hat dışına düşmedi');
  // Ruh halleri doğru sırayla
  const order = ['alert', 'arrived', 'passed'].map((ph) => phases.indexOf(ph));
  assert.ok(order.every((i) => i >= 0), `fazlar: ${phases.join(' → ')}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, `fazlar: ${phases.join(' → ')}`);
});

test('farklı seed ve uyarı modlarında da uyarı kaçmaz', () => {
  const alerts = [
    { mode: 'stops', value: 1 },
    { mode: 'stops', value: 3 },
    { mode: 'meters', value: 500 },
    { mode: 'minutes', value: 2 },
  ];
  for (const alert of alerts) {
    for (let seed = 1; seed <= 15; seed++) {
      const { events, targetM } = runSim({ alert, seed });
      const a = events.filter((e) => e.type === 'alert');
      assert.equal(a.length, 1, `${JSON.stringify(alert)} seed ${seed}: ${JSON.stringify(events)}`);
      assert.ok(a[0].trueM <= targetM, `${JSON.stringify(alert)} seed ${seed}: geç uyarı`);
    }
  }
});

test('hedef ilk duraklardan biriyse simülasyon baştan başlar', () => {
  for (const t of [0, 1, 2]) {
    const pts = [...simulationPoints({ direction: dir, targetIndex: t })];
    assert.equal(pts[0].trueM, dir.stops[0][1]);
    assert.ok(pts.length > 1);
  }
});

test('bütün B53 duraklarında simülasyon hatasız çalışır ve uyarı verir', () => {
  for (let t = 3; t < dir.stops.length; t++) {
    const { events } = runSim({ target: t });
    assert.ok(events.some((e) => e.type === 'alert'), `durak ${t}: uyarı yok ${JSON.stringify(events)}`);
  }
});
