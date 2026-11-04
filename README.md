# Stoply 🚌🛎️

Otobüste ineceğin durağı kaçırma! Stoply konumunu takip eder, yolculuğunu haritada sevimli bir karakterle gösterir ve durağına yaklaşınca seni **bildirim** ya da **alarm** ile uyarır.

> Durum: **MVP iskeleti**: Gaziantep, hat seç → durak seç → takip + uyarı.

## Kurulum (ilk kez)

Gerekenler: Node.js 22+, Android telefon ve telefonda **Expo Go** uygulaması (Play Store).

```bash
# 1) Boş Expo projesi oluştur
npx create-expo-app@latest stoply --template blank
cd stoply

# 2) Gerekli paketleri kur (expo install, SDK'na uygun sürümleri seçer)
npx expo install expo-location expo-task-manager expo-notifications react-native-maps
```

3) Bu paketteki dosyaları projenin içine kopyala (aynı isimli `App.js`'in üzerine yaz):

```
App.js
src/
assets/data/gaziantep.json
scripts/
tests/
```

4) `app.json` içindeki `"expo"` nesnesine şunları ekle:

```json
"plugins": [
  [
    "expo-location",
    {
      "locationAlwaysAndWhenInUsePermission": "Stoply, ineceğin durağa yaklaştığında seni uyarabilmek için ekran kapalıyken de konumunu kullanır.",
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }
  ],
  "expo-notifications"
],
"android": {
  "package": "com.damla.stoply",
  "permissions": [
    "ACCESS_COARSE_LOCATION",
    "ACCESS_FINE_LOCATION",
    "ACCESS_BACKGROUND_LOCATION",
    "FOREGROUND_SERVICE",
    "FOREGROUND_SERVICE_LOCATION",
    "POST_NOTIFICATIONS",
    "VIBRATE"
  ]
}
```

> `app.json`'da zaten bir `"android"` bölümü varsa (ör. `adaptiveIcon`), içine sadece `package` ve `permissions` satırlarını ekle.

5) `package.json`'daki `"scripts"` bölümüne ekle:

```json
"test": "node --test tests/tracker.test.mjs",
"build-data": "node scripts/build-city-data.mjs"
```

6) Çalıştır:

```bash
npx expo start
```

Telefonda Expo Go ile QR kodu okut. 🎉

## Expo Go ile development build arasındaki fark

| | Expo Go | Development build |
|---|---|---|
| Hat/durak seçimi, harita | ✅ | ✅ |
| Uygulama açıkken takip + uyarı | ✅ | ✅ |
| **Ekran kilitliyken takip** | ❌ (uygulama otomatik ön plan moduna geçer) | ✅ |

İlk testleri Expo Go ile yaparız. Ekran kapalıyken çalışması için sonra bir development build alacağız (`npx expo run:android` ya da EAS Build). O aşamada Google Maps API anahtarı da gerekecek.

## Proje yapısı

```
App.js                      ekran akışı: hat → durak → yolculuk
src/
  core/geo.js               mesafe, izdüşüm gibi coğrafi hesaplar
  core/tracker.js           ❤️ takip mantığı: konum → kalan durak/mesafe/süre → uyarı
  data/city.js              şehir verisi, Türkçe karakterlere duyarsız arama
  services/locationService  konum takibi (arka plan / ön plan), uyarıları tetikler
  services/alerts.js        bildirim ve alarm kanalları
  state/tripStore.js        aktif yolculuğun durumu
  screens/                  RouteSearch, StopPicker, Trip
assets/data/gaziantep.json  164 hat, 3.314 durak (scripts ile üretildi)
scripts/build-city-data.mjs GTFS → uygulama verisi dönüştürücü
tests/tracker.test.mjs      gerçek B53 verisiyle simülasyon testleri
```

## Takip mantığı nasıl çalışıyor?

1. Telefonun GPS konumu, hattın çizgisi üzerine **izdüşürülür** ("hat başından kaç metre ilerideyim?").
2. Bazı hatlar aynı caddeden gidip dönüyor ya da halka şeklinde. Bu yüzden belirsizlik varsa birkaç olasılık birlikte takip edilir ve otobüsün hareket yönü doğruyu ortaya çıkarır.
3. Konum, son ~45 saniyelik hareketten hız tahmini ve GPS titremesine karşı filtre ile birleştirilir.
4. Kullanıcının seçtiği kurala göre uyarı verilir: **durak sayısı**, **mesafe** ya da **süre**.
5. Güvenlik ağı: ayar ne olursa olsun durağa 150 m kala mutlaka uyarılırsın. Durağı geçersen "durağını geçtin" uyarısı gelir.
6. Pil dostu: hedefe uzaktayken 30 sn'de bir, yaklaştıkça 3 sn'de bir konum alınır.

Testler: `npm test`. B53 üzerinde gürültülü GPS ile 9 senaryo var. Ayrıca tüm Gaziantep hatlarında 1.600+ rastgele yolculukla stres testi yapıldı: hiç kaçırılan ya da geç gelen uyarı yok.

## Veriyi güncellemek

Veri her ayın 1'inde güncelleniyor:

```bash
# https://github.com/Egezenn/kk-gtfs/raw/main/data/gaziantep.zip dosyasını indir, gtfs/gaziantep klasörüne aç
npm run build-data -- gtfs/gaziantep gaziantep assets/data/gaziantep.json
```

Aynı kaynakta Antalya, Kocaeli, Adana gibi 27 şehir daha var. Yeni şehir için aynı komutu çalıştırıp `src/data/city.js`'e ekle.

## Veri kaynağı

Hat ve durak verisi KentKart'tan [Egezenn/kk-gtfs](https://github.com/Egezenn/kk-gtfs) projesi aracılığıyla alınmıştır. Verinin hakları KentKart'a ve Gaziantep Büyükşehir Belediyesi'ne aittir. Bu proje kişisel bir portföy çalışmasıdır.
