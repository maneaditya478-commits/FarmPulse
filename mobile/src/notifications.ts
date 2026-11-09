import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getMeta, setMeta } from './db/database';
import type { VaccinationScheduleItem } from './types';

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('vaccinations', {
      name: 'Vaccination reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#166534',
      vibrationPattern: [0, 250, 250, 250],
    }).catch(() => undefined);
  }
}

export interface ReminderResult {
  scheduled: number;
  skipped: number;
  denied: boolean;
}

export async function scheduleVaccinationReminders(items: VaccinationScheduleItem[]): Promise<ReminderResult> {
  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return { scheduled: 0, skipped: items.length, denied: true };
  }

  const stored = await getMeta('scheduled_reminders');
  const alreadyScheduled: Record<string, string> = stored ? JSON.parse(stored) : {};
  const now = Date.now();
  let scheduled = 0;
  let skipped = 0;

  for (const item of items) {
    const key = `${item.animal_id}:${item.vaccine_id}:${item.due_on ?? 'none'}`;
    if (!item.due_on || item.status === 'completed') {
      skipped += 1;
      continue;
    }
    if (alreadyScheduled[key]) {
      skipped += 1;
      continue;
    }
    const due = new Date(`${item.due_on}T09:00:00`);
    const trigger = new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000);
    if (trigger.getTime() <= now) {
      skipped += 1;
      continue;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Vaccination due soon',
        body: `${item.animal_name}: ${item.vaccine_name} is due on ${item.due_on}. Source: ${item.source_reference}`,
        data: { animal_id: item.animal_id, vaccine_id: item.vaccine_id, due_on: item.due_on },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'vaccinations',
      },
    });
    alreadyScheduled[key] = new Date().toISOString();
    scheduled += 1;
  }

  await setMeta('scheduled_reminders', JSON.stringify(alreadyScheduled));
  return { scheduled, skipped, denied: false };
}
