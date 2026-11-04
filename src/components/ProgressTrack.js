// İlerleme çubuğu: tombul otobüs hedef zile doğru yumuşakça kayıyor.
// Konum birkaç saniyede bir geldiği için otobüs zıplamasın diye yeni değere süzülerek gider.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import AnimatedBus from './AnimatedBus';

const BUS_SIZE = 40;
const BUS_H = BUS_SIZE * (80 / 120);
const FLAG_W = 26;

export default function ProgressTrack({ progress, color, mood }) {
  const [width, setWidth] = useState(0);
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // çubuğun genişliği de animasyonlu, native driver width'i desteklemiyor
    }).start();
  }, [progress]);

  const usable = Math.max(0, width - BUS_SIZE - FLAG_W);
  const busLeft = anim.interpolate({ inputRange: [0, 1], outputRange: [0, usable], extrapolate: 'clamp' });
  const fillWidth = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, usable + BUS_SIZE / 2],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.rail} />
      <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: color }]} />
      <Animated.View style={[styles.bus, { left: busLeft }]}>
        <AnimatedBus mood={mood} size={BUS_SIZE} />
      </Animated.View>
      <Text style={styles.flag}>🛎️</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: BUS_H + 10, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: FLAG_W / 2, height: 8, borderRadius: 4, backgroundColor: '#EFE3D6' },
  fill: { position: 'absolute', left: 0, height: 8, borderRadius: 4 },
  bus: { position: 'absolute', top: 0 },
  flag: { position: 'absolute', right: 0, fontSize: 20 },
});
