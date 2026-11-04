// Konum takibi.
// Önce arka plan modunu dener (ekran kilitliyken de çalışır, Android'de kalıcı bir
// bildirim gösterir). Olmazsa (ör. Expo Go ya da izin verilmedi) ön plan moduna düşer:
// o zaman uygulama açık kalmalı.
//
// ÖNEMLİ (Android 12+): Uygulama arka plandayken foreground service BAŞLATILAMAZ.
// Bu yüzden yolculuk sırasında konum sıklığını değiştirirken servisi asla durdurup
// yeniden başlatmıyoruz. Aynı görev adıyla startLocationUpdatesAsync'i tekrar çağırmak
// ayarları yerinde güncelliyor ve servis çalışmaya devam ediyor
// (expo-task-manager TaskService.registerTask → setOptions).
import { Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { createTripTracker } from '../core/tracker';
import * as store from '../state/tripStore';
import { fireArrivalAlert, firePassedAlert, stopAlerts } from './alerts';
import { prettyName } from '../data/city';
import { startSimulation } from './simulator';

const TASK = 'stoply-location';
const ALARM_REPEAT_MS = 25000;

let mode = null; // 'background' | 'foreground' | 'simulation'
let watchSub = null;
let simulation = null; // { stop, speedup } – simülasyon modunda
let currentInterval = null;

// Expo Go Android'de arka plan / foreground service desteklenmiyor: orada hiç denemeyip
// doğrudan ön plan moduna geçiyoruz (ekran açık kalıyor, bkz. TripScreen useKeepAwake).
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Arka plan görevi: modül yüklenirken tanımlanmalı (App.js bu dosyayı import ediyor)
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  for (const loc of locations) {
    try {
      await handleLocation(loc);
    } catch (e) {
      // Tek bir hatalı konum yüzünden takip durmasın
      console.warn('[stoply] konum işlenemedi', e);
    }
  }
});

async function handleLocation(loc) {
  const trip = store.getTrip();
  if (!trip) return;
  const s = trip.tracker.update({
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 0,
    timestamp: loc.timestamp,
  });
  store.setTripState(s);

  const stopName = prettyName(trip.tracker.targetStop[0]);
  if (s.justAlerted) {
    store.setAlarm({ active: true, acknowledged: false, lastFiredAt: Date.now() });
    await fireArrivalAlert(trip.alertType, stopName, describe(s));
  } else if (s.justPassed) {
    store.setAlarm({ active: true, acknowledged: false, lastFiredAt: Date.now() });
    await firePassedAlert(trip.alertType, stopName);
  } else {
    // Alarm modunda, kullanıcı "Tamam" diyene kadar tekrar et
    const a = store.getAlarm();
    if (trip.alertType === 'alarm' && a.active && !a.acknowledged && Date.now() - a.lastFiredAt > ALARM_REPEAT_MS) {
      store.setAlarm({ lastFiredAt: Date.now() });
      await fireArrivalAlert('alarm', stopName, describe(s));
    }
  }

  // Pil dostu: hedefe yaklaştıkça konum sıklığını artır
  if (s.recommendedIntervalMs !== currentInterval) {
    await restartUpdates(s.recommendedIntervalMs);
  }
}

export function describe(s) {
  if (s.phase === 'passed') return 'Durağı geçtin';
  if (s.remainingStops <= 1) return s.remainingM < 150 ? 'Şimdi in!' : 'Bir sonraki durak';
  const km = s.remainingM >= 1000 ? `${(s.remainingM / 1000).toFixed(1)} km` : `${s.remainingM} m`;
  return `${s.remainingStops} durak · ${km} · ~${Math.max(1, Math.round(s.etaSec / 60))} dk`;
}

function options(interval) {
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: interval,
    distanceInterval: interval <= 3000 ? 10 : 40,
  };
}

function backgroundOptions(interval) {
  return {
    ...options(interval),
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Stoply yolculuğunu takip ediyor 🚌',
      notificationBody: 'Durağına yaklaşınca seni uyaracağım.',
      notificationColor: '#FF6600',
      // Yolculuk durumu bellekte tutuluyor; uygulama tamamen kapatılırsa takip
      // etmeye devam etmenin anlamı yok (boşuna pil harcamasın).
      killServiceOnDestroy: true,
    },
  };
}

async function startUpdates(interval) {
  currentInterval = interval;
  if (mode === 'simulation') {
    const trip = store.getTrip();
    simulation = startSimulation({
      direction: trip.direction,
      targetIndex: trip.targetIndex,
      onLocation: (loc) => handleLocation(loc).catch((e) => console.warn('[stoply] simülasyon', e)),
    });
  } else if (mode === 'background') {
    await Location.startLocationUpdatesAsync(TASK, backgroundOptions(interval));
  } else {
    watchSub = await Location.watchPositionAsync(options(interval), (loc) => {
      handleLocation(loc);
    });
  }
}

async function stopUpdates() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  if (watchSub) {
    watchSub.remove();
    watchSub = null;
  }
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

async function restartUpdates(interval) {
  if (!store.getTrip()) return;
  currentInterval = interval; // tekrar tekrar yeniden başlatmayı önle
  if (mode === 'simulation') return; // simülasyonun kendi temposu var
  if (mode === 'background') {
    // Durdurmadan, yerinde güncelle (bkz. dosyanın başındaki not)
    await Location.startLocationUpdatesAsync(TASK, backgroundOptions(interval));
    return;
  }
  if (watchSub) {
    watchSub.remove();
    watchSub = null;
  }
  await startUpdates(interval);
}

/** Android 11+ arka plan iznini sistem ayarları sayfasında istiyor; önce ne olacağını anlat. */
function explainBackgroundPermission() {
  return new Promise((resolve) => {
    Alert.alert(
      'Ekran kapalıyken de takip edeyim mi?',
      'Uyuyakalsan bile seni uyarabilmem için açılacak sayfada konum iznini "Her zaman izin ver" yapman gerekiyor.',
      [
        { text: 'Şimdi değil', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ayarlara git', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

async function ensureBackgroundPermission() {
  if (IS_EXPO_GO) return false;
  try {
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!current.canAskAgain) return false;
    if (!(await explainBackgroundPermission())) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch {
    // Expo Go vb. ortamlarda desteklenmeyebilir
    return false;
  }
}

/**
 * Yolculuğu başlat.
 * @returns {Promise<{ ok: boolean, mode?: string, reason?: string }>}
 */
export async function startTrip({ city, route, direction, targetIndex, alert, alertType, simulate = false }) {
  if (simulate) {
    // Evde test: gerçek konum ve izin gerekmiyor
    await stopUpdates().catch(() => {});
    const tracker = createTripTracker({ direction, stops: city.stops, targetIndex, alert });
    store.startTrip({ tracker, route, direction, targetIndex, alert, alertType, simulated: true });
    mode = 'simulation';
    await startUpdates(0);
    return { ok: true, mode };
  }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'Konum izni olmadan durağını takip edemem 🥲' };

  // Arka plan izni ("Her zaman izin ver") – vermezse ön planda devam
  const bgGranted = await ensureBackgroundPermission();

  // Önceki bir yolculuktan kalmış takip varsa temizle
  await stopUpdates().catch(() => {});

  const tracker = createTripTracker({ direction, stops: city.stops, targetIndex, alert });
  store.startTrip({ tracker, route, direction, targetIndex, alert, alertType });

  mode = bgGranted ? 'background' : 'foreground';
  try {
    await startUpdates(30000);
  } catch (e) {
    // Expo Go arka plan konumunu desteklemeyebilir → ön plana düş
    mode = 'foreground';
    await startUpdates(30000);
  }

  // İlk konumu hemen al (bekletmeden ekranda gösterelim)
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then(handleLocation)
    .catch(() => {});

  return { ok: true, mode };
}

/** Kullanıcı alarmı kapattı */
export async function acknowledgeAlarm() {
  store.setAlarm({ acknowledged: true });
  await stopAlerts();
}

export async function endTrip() {
  await stopUpdates();
  await stopAlerts();
  store.endTrip();
  mode = null;
  currentInterval = null;
}

export function getMode() {
  return mode;
}

/** Simülasyon kaç kat hızlı oynuyor (simülasyon yoksa null) */
export function getSimulationSpeedup() {
  return simulation?.speedup ?? null;
}
