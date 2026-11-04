import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import MapView, { Marker, Polyline } from 'react-native-maps';
import AnimatedBus from '../components/AnimatedBus';
import BusCharacter from '../components/BusCharacter';
import ProgressTrack from '../components/ProgressTrack';
import useSmoothCoordinate from '../hooks/useSmoothCoordinate';
import RouteBadge from '../components/RouteBadge';
import { directionStops, prettyName } from '../data/city';
import { subscribe, snapshot } from '../state/tripStore';
import { acknowledgeAlarm, describe, endTrip, getMode, getSimulationSpeedup } from '../services/locationService';
import { colors, radius } from '../theme';

// Tombul otobüsün ruh hali ve söylediği söz (çizimler: components/busCharacterParts.js)
const MOOD_TEXT = {
  waiting: 'Konumunu arıyorum…',
  far: 'Keyfine bak, ben takip ediyorum',
  approaching: 'Yaklaşıyoruz!',
  alert: 'Hazırlan, inme vakti yaklaştı!',
  arrived: 'Geldik! Şimdi in',
  passed: 'Durağı geçtik! Bir sonrakinde in',
  off: 'Hattın dışında görünüyorsun',
};

function toLatLng([lat, lon]) {
  return { latitude: lat, longitude: lon };
}

/** 3. adım: yolculuk */
export default function TripScreen({ city, route, direction, targetIndex, onEnd }) {
  const [snap, setSnap] = useState(snapshot());
  const mapRef = useRef(null);
  const stops = useMemo(() => directionStops(city, direction), [city, direction]);
  const target = stops[targetIndex];
  const shapeCoords = useMemo(() => direction.shape.map(toLatLng), [direction]);
  const [follow, setFollow] = useState(true);

  // Yolculuk ekranı açıkken telefon kendiliğinden kararıp kilitlenmesin
  useKeepAwake();

  useEffect(() => subscribe(setSnap), []);

  const s = snap.state;
  const mood = !s ? 'waiting' : s.offRoute ? 'off' : MOOD_TEXT[s.phase] ? s.phase : 'far';
  // Haritadaki otobüs yeni konuma süzülerek gitsin ve gittiği yöne baksın
  const { coord: busCoord, facingLeft } = useSmoothCoordinate(s ? toLatLng(s.snapped) : null);

  // Karakteri takip et
  useEffect(() => {
    if (!s || !follow || !mapRef.current) return;
    mapRef.current.animateCamera({ center: toLatLng(s.snapped), zoom: s.phase === 'far' ? 14 : 16 }, { duration: 800 });
  }, [s?.userM, follow]);

  const initialRegion = useMemo(() => {
    const lats = direction.shape.map((p) => p[0]);
    const lons = direction.shape.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: (maxLat - minLat) * 1.3 + 0.01,
      longitudeDelta: (maxLon - minLon) * 1.3 + 0.01,
    };
  }, [direction]);

  const showAlarmBanner = snap.alarm.active && !snap.alarm.acknowledged;

  async function finish() {
    await endTrip();
    onEnd();
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion} onPanDrag={() => setFollow(false)}>
        <Polyline coordinates={shapeCoords} strokeColor={route.color} strokeWidth={6} />
        {stops.map((st) => (
          <Marker key={st.index} coordinate={{ latitude: st.lat, longitude: st.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[styles.stopDot, st.index === targetIndex && styles.targetDot]} />
          </Marker>
        ))}
        <Marker coordinate={{ latitude: target.lat, longitude: target.lon }} title={prettyName(target.name)} anchor={{ x: 0.5, y: 1 }}>
          <Text style={{ fontSize: 30 }}>🛎️</Text>
        </Marker>
        {s && busCoord && (
          // Harita işaretçileri resim olarak çizildiği için burada sallanma animasyonu yok;
          // otobüs konumdan konuma kayıyor ve yönüne dönüyor.
          <Marker coordinate={busCoord} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
            <BusCharacter mood={mood} size={56} style={facingLeft ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Marker>
        )}
      </MapView>

      <View style={styles.topBar}>
        <RouteBadge route={route} />
        <Text style={styles.topText} numberOfLines={1}>➜ {prettyName(target.name)}</Text>
      </View>

      {!follow && (
        <Pressable style={styles.recenter} onPress={() => setFollow(true)}>
          <Text style={{ fontSize: 20 }}>🎯</Text>
        </Pressable>
      )}

      <View style={styles.card}>
        <View style={styles.moodRow}>
          <AnimatedBus mood={mood} size={64} />
          <Text style={styles.moodText}>{MOOD_TEXT[mood]}</Text>
        </View>

        {s && (
          <>
            <Text style={styles.big}>{describe(s)}</Text>
            {/* İlerleme çubuğu: karakter hedefe doğru yürüyor */}
            <ProgressTrack progress={s.progress} color={route.color} mood={mood} />
          </>
        )}

        {getMode() === 'simulation' && (
          <Text style={styles.sim}>🧪 Simülasyon · {getSimulationSpeedup()}x hızlı · sahte konum. Ekranı açık tut.</Text>
        )}

        {getMode() === 'foreground' && (
          <Text style={styles.warn}>💡 Ekran açık kalacak. Uygulamayı açık tut, kilit tuşuna basma.</Text>
        )}

        <Pressable style={styles.endBtn} onPress={finish}>
          <Text style={styles.endTxt}>{s?.phase === 'arrived' || s?.phase === 'passed' ? 'Yolculuğu bitir ✅' : 'Takibi durdur'}</Text>
        </Pressable>
      </View>

      {showAlarmBanner && (
        <View style={styles.alarm}>
          <View style={styles.alarmBus}>
            <AnimatedBus mood={s?.phase === 'passed' ? 'passed' : 'alert'} size={170} />
          </View>
          <Text style={styles.alarmTitle}>{s?.phase === 'passed' ? 'Durağını geçtin!' : 'İnme vakti yaklaştı!'}</Text>
          <Text style={styles.alarmSub}>{prettyName(target.name)}</Text>
          {s && <Text style={styles.alarmSub}>{describe(s)}</Text>}
          <Pressable style={styles.alarmBtn} onPress={acknowledgeAlarm}>
            <Text style={styles.alarmBtnTxt}>Tamam, uyandım 👍</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stopDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.primary },
  targetDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 10,
    elevation: 6,
  },
  topText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  recenter: {
    position: 'absolute',
    right: 16,
    bottom: 250,
    backgroundColor: colors.card,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 18,
    gap: 10,
    elevation: 12,
  },
  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moodText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  big: { fontSize: 22, fontWeight: '800', color: colors.text },
  warn: { fontSize: 12, color: colors.primaryDark },
  sim: { fontSize: 12, color: colors.good, fontWeight: '600' },
  endBtn: { backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  endTxt: { fontSize: 16, fontWeight: '700', color: colors.text },
  alarm: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,102,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  alarmBus: { backgroundColor: '#fff', borderRadius: 200, padding: 22, marginBottom: 8 },
  alarmTitle: { fontSize: 30, fontWeight: '900', color: '#fff', textAlign: 'center' },
  alarmSub: { fontSize: 18, color: '#fff', textAlign: 'center' },
  alarmBtn: { marginTop: 24, backgroundColor: '#fff', borderRadius: 30, paddingVertical: 18, paddingHorizontal: 34 },
  alarmBtnTxt: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
});
