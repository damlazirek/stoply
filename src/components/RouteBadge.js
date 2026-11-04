import { Text, View, StyleSheet } from 'react-native';

/** Hat kodu rozeti: "B53" */
export default function RouteBadge({ route, size = 'md' }) {
  const big = size === 'lg';
  return (
    <View style={[styles.badge, { backgroundColor: route.color }, big && styles.big]}>
      <Text style={[styles.text, big && styles.bigText]}>{route.code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, minWidth: 56, alignItems: 'center' },
  text: { color: '#fff', fontWeight: '800', fontSize: 15 },
  big: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  bigText: { fontSize: 20 },
});
