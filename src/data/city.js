// Şehir verisi: scripts/build-city-data.mjs ile üretilen JSON uygulamaya gömülü.
// Yeni şehir eklemek için: JSON'u üret, buraya ekle.
import gaziantep from '../../assets/data/gaziantep.json';

export const CITIES = { gaziantep };
export const DEFAULT_CITY = 'gaziantep';

export function getCity(id = DEFAULT_CITY) {
  return CITIES[id];
}

/** Türkçe karakterlere duyarsız arama için normalize et ("şehir" = "SEHIR") */
export function normalize(text) {
  return (text || '')
    .toLocaleLowerCase('tr')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Durak adlarının normalize hali (aramada her tuşta yeniden hesaplamamak için)
const normCache = new WeakMap();
function normalizedStops(city) {
  if (!normCache.has(city)) {
    const m = {};
    for (const [id, s] of Object.entries(city.stops)) m[id] = normalize(s[0]);
    normCache.set(city, m);
  }
  return normCache.get(city);
}

/** Hat koduna, adına ya da geçtiği durağa göre ara. "b53", "kalyoncu", "primemall" gibi. */
export function searchRoutes(city, query) {
  const q = normalize(query);
  if (!q) return city.routes;
  const qCompact = q.replace(/ /g, '');
  const ns = q.length >= 3 ? normalizedStops(city) : null;
  return city.routes
    .map((r) => {
      const code = normalize(r.code).replace(/ /g, '');
      let score = 0;
      if (code === qCompact) score = 100;
      else if (code.startsWith(qCompact)) score = 50;
      else if (normalize(r.name).includes(q)) score = 20;
      else if (r.dirs.some((d) => normalize(d.headsign).includes(q))) score = 10;
      else if (ns && r.dirs.some((d) => d.stops.some(([id]) => ns[id].includes(q)))) score = 5;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Bir yönün duraklarını ekranda gösterilecek biçime çevir */
export function directionStops(city, direction) {
  return direction.stops.map(([id, m], index) => {
    const [name, lat, lon] = city.stops[id];
    return { id, index, name, lat, lon, m };
  });
}

/** "ŞEHİR HASTANESİ" → "Şehir Hastanesi" (veri karışık büyük/küçük harfli) */
export function prettyName(name) {
  return name
    .toLocaleLowerCase('tr')
    .split(' ')
    .map((w) => (w.length > 3 || /^[a-zçğıöşü]/.test(w) ? w.charAt(0).toLocaleUpperCase('tr') + w.slice(1) : w))
    .join(' ');
}
