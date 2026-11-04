// app.json'daki ayarların üstüne, ortam değişkeninden gelen Google Maps anahtarını ekler.
// Anahtar repoya girmesin diye app.json'a yazılmıyor:
// - Yerel build: proje kökünde .env.local dosyasına GOOGLE_MAPS_API_KEY=... yaz
// - EAS build:   eas env:create --name GOOGLE_MAPS_API_KEY --environment development --visibility sensitive
// Anahtar yoksa uygulama yine derlenir ve çalışır, ama development build'de harita boş (gri) görünür.
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const plugins = [...(config.plugins ?? [])];
  if (apiKey) {
    plugins.push(['react-native-maps', { androidGoogleMapsApiKey: apiKey }]);
  }
  return { ...config, plugins };
};
