// Haritadaki karakter için: yeni konum gelince ışınlanmak yerine oraya süzülerek gitsin.
// Ayrıca otobüsün yüzü gittiği yöne baksın (batıya gidiyorsa çizimi aynala).
import { useEffect, useRef, useState } from 'react';

const DURATION = 900;
// Çok küçük kıpırtılarda (GPS gürültüsü) yön değiştirmesin: ~5 m
const FLIP_THRESHOLD_DEG = 0.00005;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export default function useSmoothCoordinate(target) {
  const [coord, setCoord] = useState(target);
  const [facingLeft, setFacingLeft] = useState(false);
  const current = useRef(target);
  const frame = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    const from = current.current;
    if (!from) {
      current.current = target;
      setCoord(target);
      return undefined;
    }

    const dLon = target.longitude - from.longitude;
    if (Math.abs(dLon) > FLIP_THRESHOLD_DEG) setFacingLeft(dLon < 0);

    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      const k = easeOut(t);
      const next = {
        latitude: from.latitude + (target.latitude - from.latitude) * k,
        longitude: from.longitude + (target.longitude - from.longitude) * k,
      };
      current.current = next;
      setCoord(next);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target?.latitude, target?.longitude]);

  return { coord, facingLeft };
}
