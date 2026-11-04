// Bildirim ve alarm.
// - "bildirim": normal, yüksek öncelikli bildirim + kısa titreşim
// - "alarm":    alarm kanalı (sessize alınmış telefonda da çalmaya çalışır), uzun titreşim,
//               kullanıcı "Tamam" diyene kadar ~25 sn'de bir tekrar eder
import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_NOTIFY = 'stoply-bildirim';
const CHANNEL_ALARM = 'stoply-alarm';
const ALARM_VIBRATION = [0, 900, 400, 900, 400, 900];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // eski SDK'lar için
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupAlerts() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_NOTIFY, {
      name: 'Durak bildirimleri',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ALARM, {
      name: 'Durak alarmı',
      description: 'Uyuyakalırsan seni uyandırmak için',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: ALARM_VIBRATION,
      sound: 'default',
      bypassDnd: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  }
  return true;
}

async function send(channelId, title, body) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: channelId === CHANNEL_ALARM,
      data: { stoply: true },
    },
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}

/** Durağa yaklaşınca */
export async function fireArrivalAlert(type, stopName, detail) {
  const title = type === 'alarm' ? '⏰ Uyan! Durağın geliyor' : '🛎️ Durağına yaklaşıyorsun';
  const body = `${stopName} · ${detail}`;
  if (type === 'alarm') {
    Vibration.vibrate(ALARM_VIBRATION, true); // uygulama açıksa sürekli titret
    await send(CHANNEL_ALARM, title, body);
  } else {
    Vibration.vibrate([0, 400, 200, 400]);
    await send(CHANNEL_NOTIFY, title, body);
  }
}

/** Durak geçildiyse */
export async function firePassedAlert(type, stopName) {
  if (type === 'alarm') Vibration.vibrate(ALARM_VIBRATION, true);
  await send(type === 'alarm' ? CHANNEL_ALARM : CHANNEL_NOTIFY, '😱 Durağını geçtin!', `${stopName} geride kaldı. Bir sonraki durakta in.`);
}

export async function stopAlerts() {
  Vibration.cancel();
  await Notifications.dismissAllNotificationsAsync();
}
