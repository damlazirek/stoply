// Ruh haline göre hareket eden tombul otobüs.
// <AnimatedBus mood="approaching" size={64} />
//
// Her ruh halinin kendi hareketi var:
//   waiting     → yavaşça nefes alıyor
//   far         → sakin sakin yolda sallanıyor
//   approaching → daha hızlı, heyecanlı sallanıyor
//   alert       → "hey!" diye titriyor
//   arrived     → sevinçten zıplıyor
//   passed      → panikle sağa sola sarsılıyor
//   off         → kafası karışık, yana yatıyor
// Ruh hali değişince bir kez "pıt" diye büyüyüp küçülür.
// Telefonda "hareketi azalt" açıksa sadece sabit çizim gösterilir.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import BusCharacter from './BusCharacter';

const ease = Easing.inOut(Easing.sin);

function seq(...steps) {
  return Animated.sequence(steps);
}
function to(value, toValue, duration, easing = ease) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}
function wait(ms) {
  return Animated.delay(ms);
}

// Her ruh hali için: hangi değerleri nasıl oynatacağımız
function loopFor(mood, v) {
  switch (mood) {
    case 'waiting':
      return seq(to(v.scale, 1.04, 1400), to(v.scale, 1, 1400));
    case 'far':
      return seq(to(v.y, -2, 700), to(v.y, 0, 700));
    case 'approaching':
      return seq(to(v.y, -3.5, 320), to(v.y, 0, 320));
    case 'alert':
      return seq(
        to(v.rot, -5, 70), to(v.rot, 5, 110), to(v.rot, -5, 110), to(v.rot, 5, 110), to(v.rot, 0, 70),
        wait(650)
      );
    case 'arrived':
      return seq(
        to(v.scaleY, 0.9, 120), // çömel
        Animated.parallel([to(v.y, -14, 260, Easing.out(Easing.quad)), to(v.scaleY, 1.06, 260)]),
        Animated.parallel([to(v.y, 0, 260, Easing.in(Easing.quad)), to(v.scaleY, 1, 260)]),
        to(v.scaleY, 0.94, 90), to(v.scaleY, 1, 120),
        wait(500)
      );
    case 'passed':
      return seq(
        to(v.x, -4, 50), to(v.x, 4, 80), to(v.x, -4, 80), to(v.x, 4, 80), to(v.x, 0, 50),
        wait(400)
      );
    case 'off':
      return seq(to(v.rot, 8, 900), wait(300), to(v.rot, 0, 900), wait(600));
    default:
      return null;
  }
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub?.remove?.();
  }, []);
  return reduce;
}

export default function AnimatedBus({ mood = 'far', size = 64, flip = false, animate = true, style }) {
  const v = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    rot: new Animated.Value(0),
    scale: new Animated.Value(1),
    scaleY: new Animated.Value(1),
    pop: new Animated.Value(1),
  }).current;
  const reduceMotion = useReduceMotion();
  const first = useRef(true);

  useEffect(() => {
    if (!animate || reduceMotion) return undefined;

    // Ruh hali değişti: önceki hareketin izini sil, bir kez "pıt" yap
    v.x.setValue(0); v.y.setValue(0); v.rot.setValue(0); v.scale.setValue(1); v.scaleY.setValue(1);
    if (!first.current) {
      v.pop.setValue(1.18);
      Animated.spring(v.pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
    first.current = false;

    const anim = loopFor(mood, v);
    if (!anim) return undefined;
    const loop = Animated.loop(anim);
    loop.start();
    return () => loop.stop();
  }, [mood, animate, reduceMotion]);

  const rotate = v.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateX: v.x },
            { translateY: v.y },
            { rotate },
            { scale: Animated.multiply(v.scale, v.pop) },
            { scaleY: v.scaleY },
            { scaleX: flip ? -1 : 1 },
          ],
        },
      ]}
    >
      <BusCharacter mood={mood} size={size} />
    </Animated.View>
  );
}
