import { useEffect, useState } from 'react';
import { Alert, Platform, StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getCity } from './src/data/city';
import { setupAlerts } from './src/services/alerts';
import { IS_EXPO_GO, startTrip } from './src/services/locationService'; // arka plan görevini de tanımlar
import RouteSearchScreen from './src/screens/RouteSearchScreen';
import StopPickerScreen from './src/screens/StopPickerScreen';
import TripScreen from './src/screens/TripScreen';
import { colors } from './src/theme';

const city = getCity();

export default function App() {
  // Basit ekran akışı: hat → durak → yolculuk (navigasyon kütüphanesine gerek yok)
  const [screen, setScreen] = useState({ name: 'routes' });
  const [lastSettings, setLastSettings] = useState(null);

  useEffect(() => {
    setupAlerts().catch(() => {});
  }, []);

  async function handleStart({ targetIndex, alert, alertType, simulate }) {
    const { route, direction } = screen;
    setLastSettings({ alert, alertType });
    const res = await startTrip({ city, route, direction, targetIndex, alert, alertType, simulate });
    if (!res.ok) {
      Alert.alert('Olmadı 😕', res.reason);
      return;
    }
    // Expo Go'da ön plan modu zaten beklenen durum (ekran açık kalıyor), her seferinde uyarma
    if (res.mode === 'foreground' && !IS_EXPO_GO) {
      Alert.alert(
        'Ön planda takip ediyorum',
        'Arka plan konum izni verilmediği için uygulama açıkken takip edebiliyorum. Ayarlardan "Her zaman izin ver" seçersen ekran kapalıyken de çalışırım.'
      );
    }
    setScreen({ name: 'trip', route, direction, targetIndex });
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {screen.name === 'routes' && (
        <RouteSearchScreen city={city} onPick={(route, direction) => setScreen({ name: 'stops', route, direction })} />
      )}
      {screen.name === 'stops' && (
        <StopPickerScreen
          city={city}
          route={screen.route}
          direction={screen.direction}
          initialSettings={lastSettings}
          onBack={() => setScreen({ name: 'routes' })}
          onStart={handleStart}
        />
      )}
      {screen.name === 'trip' && (
        <TripScreen
          city={city}
          route={screen.route}
          direction={screen.direction}
          targetIndex={screen.targetIndex}
          onEnd={() => setScreen({ name: 'routes' })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 44,
  },
});
