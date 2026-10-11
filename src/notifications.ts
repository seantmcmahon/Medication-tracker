import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { planNotifications } from './logic';
import type { DoseRecord, Medication, Settings } from './types';

// Channel settings can't be changed after creation on Android, so bump the id if they ever need to.
const REMINDER_CHANNEL = 'reminders-v1';
const ALARM_CHANNEL = 'alarms-v1';
const ALARM_SOUND = 'alarm.wav';
const TEST_ID = 'test-alarm';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  // The web build is only used to preview the screens; it has no phone notifications to set up.
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Can take now',
      description: 'Lets you know when enough time has passed to take the next dose.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Medication overdue alarm',
      description: 'Loud alarm when a dose has been missed.',
      importance: Notifications.AndroidImportance.MAX,
      sound: ALARM_SOUND,
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return requested.granted;
}

/**
 * Throws away every scheduled notification and schedules a fresh set from the current data.
 * Called after anything changes, so the phone's schedule always matches what the app shows.
 */
export async function rescheduleAll(
  meds: Medication[],
  doses: DoseRecord[],
  settings: Settings,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier !== TEST_ID)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const plan = planNotifications(meds, doses, settings, Date.now());
  // iOS only keeps the first 64 pending notifications; the plan is sorted soonest-first.
  for (const n of plan.slice(0, 60)) {
    const alarm = n.kind === 'overdue';
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: {
        title: n.title,
        body: n.body,
        data: { medId: n.medId, kind: n.kind },
        sound: alarm ? ALARM_SOUND : 'default',
        priority: alarm
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        interruptionLevel: alarm ? 'timeSensitive' : 'active',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.at,
        channelId: alarm ? ALARM_CHANNEL : REMINDER_CHANNEL,
      },
    });
  }
}

/** Lets him hear what the overdue alarm sounds like. */
export async function scheduleTestAlarm(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_ID,
    content: {
      title: '⏰ Test alarm',
      body: 'This is what the overdue alarm sounds like.',
      sound: ALARM_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: ALARM_CHANNEL,
    },
  });
}
