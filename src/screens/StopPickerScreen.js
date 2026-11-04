import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import RouteBadge from '../components/RouteBadge';
import { directionStops, normalize, prettyName } from '../data/city';
import { nearestStopIndex } from '../core/tracker';
import { SIM_DEFAULTS } from '../services/simulator';
import { colors, radius } from '../theme';

const MODES = [
  { key: 'stops', label: 'Durak', unit: 'durak kala', step: 1, min: 1, max: 10, def: 2 },
  { key: 'meters', label: 'Mesafe', unit: 'm kala', step: 100, min: 200, max: 3000, def: 500 },
  { key: 'minutes', label: 'Süre', unit: 'dk kala', step: 1, min: 1, max: 20, def: 3 },
];

/** 2. adım: inilecek durağı ve uyarı ayarlarını seç */
export default function StopPickerScreen({ city, route, direction, onBack, onStart, initialSettings }) {
  const stops = useMemo(() => directionStops(city, direction), [city, direction]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [nearIdx, setNearIdx] = useState(-1);
  const [mode, setMode] = useState(initialSettings?.alert.mode ?? 'stops');
  const [value, setValue] = useState(initialSettings?.alert.value ?? 2);
  const [alertType, setAlertType] = useState(initialSettings?.alertType ?? 'notification');
  const [simulate, setSimulate] = useState(false);
  const listRef = useRef(null);

  // Kullanıcının yakınındaki durağı işaretle (bindiği durak büyük ihtimalle bu)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!alive || !pos) return;
      setNearIdx(nearestStopIndex(direction, city.stops, pos.coords.latitude, pos.coords.longitude));
    })();
    return () => {
      alive = false;
    };
  }, [city, direction]);

  const q = normalize(query);
  const visible = q ? stops.filter((s) => normalize(s.name).includes(q)) : stops;
  const m = MODES.find((x) => x.key === mode);

  function chooseMode(key) {
    setMode(key);
    setValue(MODES.find((x) => x.key === key).def);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Geri</Text>
        </Pressable>
        <RouteBadge route={route} />
      </View>
      <Text style={styles.title}>Nerede ineceksin?</Text>
      <Text style={styles.sub}>➜ {direction.headsign}</Text>

      <TextInput
        style={styles.input}
        placeholder="Durak ara"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={visible}
        keyExtractor={(s) => `${s.index}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = target === item.index;
          const before = nearIdx >= 0 && item.index <= nearIdx;
          return (
            <Pressable
              onPress={() => setTarget(item.index)}
              style={[styles.stop, selected && styles.stopSelected, before && !selected && styles.stopBefore]}
            >
              <View style={[styles.dot, selected && { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.stopName, selected && { color: colors.primaryDark }]}>{prettyName(item.name)}</Text>
                {item.index === nearIdx && <Text style={styles.near}>📍 Yakınındaki durak</Text>}
              </View>
              <Text style={styles.stopNo}>{item.index + 1}</Text>
            </Pressable>
          );
        }}
      />

      {target !== null && (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>🛎️ {prettyName(stops[target].name)}</Text>

          <Text style={styles.label}>Ne zaman uyarayım?</Text>
          <View style={styles.segment}>
            {MODES.map((x) => (
              <Pressable key={x.key} onPress={() => chooseMode(x.key)} style={[styles.segBtn, mode === x.key && styles.segOn]}>
                <Text style={[styles.segText, mode === x.key && styles.segTextOn]}>{x.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setValue(Math.max(m.min, value - m.step))}>
              <Text style={styles.stepTxt}>−</Text>
            </Pressable>
            <Text style={styles.stepValue}>
              {value} <Text style={styles.stepUnit}>{m.unit}</Text>
            </Text>
            <Pressable style={styles.stepBtn} onPress={() => setValue(Math.min(m.max, value + m.step))}>
              <Text style={styles.stepTxt}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Nasıl uyarayım?</Text>
          <View style={styles.segment}>
            <Pressable onPress={() => setAlertType('notification')} style={[styles.segBtn, alertType === 'notification' && styles.segOn]}>
              <Text style={[styles.segText, alertType === 'notification' && styles.segTextOn]}>🔔 Bildirim</Text>
            </Pressable>
            <Pressable onPress={() => setAlertType('alarm')} style={[styles.segBtn, alertType === 'alarm' && styles.segOn]}>
              <Text style={[styles.segText, alertType === 'alarm' && styles.segTextOn]}>⏰ Alarm</Text>
            </Pressable>
          </View>
          {alertType === 'alarm' && <Text style={styles.hint}>Uyuyakalırsan diye: sen kapatana kadar çalar ve titrer.</Text>}

          <Pressable style={styles.simRow} onPress={() => setSimulate(!simulate)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.simTitle}>🧪 Evde dene (simülasyon)</Text>
              {simulate && (
                <Text style={styles.hint}>
                  Sahte konumla, hedeften {SIM_DEFAULTS.stopsBefore} durak önce başlar, {SIM_DEFAULTS.speedup}x hızlı gider.
                </Text>
              )}
            </View>
            <Switch
              value={simulate}
              onValueChange={setSimulate}
              trackColor={{ true: colors.good, false: colors.line }}
              thumbColor="#fff"
            />
          </Pressable>

          <Pressable
            style={[styles.start, simulate && { backgroundColor: colors.good }]}
            onPress={() => onStart({ targetIndex: target, alert: { mode, value }, alertType, simulate })}
          >
            <Text style={styles.startTxt}>{simulate ? 'Simülasyonu başlat 🧪' : 'Yolculuğu başlat 🚌'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  back: { fontSize: 17, color: colors.primaryDark, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 10 },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 10 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
  },
  stop: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, gap: 12, borderRadius: radius.sm },
  stopSelected: { backgroundColor: '#FFE7D6' },
  stopBefore: { opacity: 0.45 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.line, borderWidth: 2, borderColor: colors.primary },
  stopName: { fontSize: 15, color: colors.text },
  near: { fontSize: 12, color: colors.good, marginTop: 2 },
  stopNo: { fontSize: 12, color: colors.muted },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 16,
    marginHorizontal: -16,
    gap: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  label: { fontSize: 13, color: colors.muted, marginTop: 4 },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.sm, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segOn: { backgroundColor: colors.primary },
  segText: { fontSize: 14, fontWeight: '600', color: colors.text },
  segTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 24, color: colors.primaryDark, fontWeight: '700' },
  stepValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  stepUnit: { fontSize: 15, fontWeight: '500', color: colors.muted },
  hint: { fontSize: 12, color: colors.muted },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  simTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  start: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  startTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
