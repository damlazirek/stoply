import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import RouteBadge from '../components/RouteBadge';
import { searchRoutes } from '../data/city';
import { colors, radius } from '../theme';

/** 1. adım: hat seç, sonra yön seç */
export default function RouteSearchScreen({ city, onPick }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // yön seçimi açık olan hat
  const results = useMemo(() => searchRoutes(city, query), [city, query]);

  return (
    <View style={styles.container}>
      <Text style={styles.hello}>Merhaba! 👋</Text>
      <Text style={styles.title}>Hangi otobüse biniyorsun?</Text>
      <TextInput
        style={styles.input}
        placeholder="Hat kodu ya da yer ara (B53, Primemall…)"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setOpen(null);
        }}
        autoCorrect={false}
        autoCapitalize="characters"
      />
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Böyle bir hat bulamadım 🤔</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={() => setOpen(open === item.id ? null : item.id)}>
              <RouteBadge route={item} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.agency}>{item.agency}</Text>
              </View>
              <Text style={styles.chev}>{open === item.id ? '▴' : '▾'}</Text>
            </Pressable>
            {open === item.id && (
              <View style={styles.dirs}>
                <Text style={styles.dirLabel}>Hangi yöne?</Text>
                {item.dirs.map((d) => (
                  <Pressable key={d.d} style={styles.dirBtn} onPress={() => onPick(item, d)}>
                    <Text style={styles.dirText}>➜ {d.headsign}</Text>
                    <Text style={styles.dirMeta}>{d.stops.length} durak</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  hello: { fontSize: 16, color: colors.muted, marginTop: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 14 },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  agency: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chev: { fontSize: 18, color: colors.muted },
  dirs: { borderTopWidth: 1, borderTopColor: colors.line, padding: 12, gap: 8 },
  dirLabel: { fontSize: 13, color: colors.muted },
  dirBtn: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: 12 },
  dirText: { fontSize: 15, fontWeight: '600', color: colors.text },
  dirMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
