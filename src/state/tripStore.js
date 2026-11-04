// Aktif yolculuğun durumu. Hem ekranlar hem arka plan konum görevi bunu kullanır.
// (Kütüphanesiz, küçük bir "store": abone ol → değişince haber al.)

let trip = null; // { tracker, route, direction, targetIndex, alert, alertType, startedAt }
let state = null; // tracker.update() çıktısı
let alarm = { active: false, acknowledged: false, lastFiredAt: 0 };
const listeners = new Set();

function emit() {
  for (const l of listeners) l(snapshot());
}

export function snapshot() {
  return { trip, state, alarm: { ...alarm } };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startTrip(t) {
  trip = { ...t, startedAt: Date.now() };
  state = null;
  alarm = { active: false, acknowledged: false, lastFiredAt: 0 };
  emit();
}

export function setTripState(s) {
  state = s;
  emit();
}

export function setAlarm(patch) {
  alarm = { ...alarm, ...patch };
  emit();
}

export function endTrip() {
  trip = null;
  state = null;
  alarm = { active: false, acknowledged: false, lastFiredAt: 0 };
  emit();
}

export function getTrip() {
  return trip;
}
export function getAlarm() {
  return alarm;
}
