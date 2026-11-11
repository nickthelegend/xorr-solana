import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ACCEPT, REFUSE, PAD_CATEGORY, type PadNotice } from './notificationModel';
export async function preparePadNotifications(requestPermission = false): Promise<void> {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('xorrpad', { name: 'xorrpad trade signals', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationCategoryAsync(PAD_CATEGORY, [
    { identifier: ACCEPT, buttonTitle: 'Accept', options: { opensAppToForeground: true } },
    { identifier: REFUSE, buttonTitle: 'Refuse', options: { opensAppToForeground: true, isDestructive: true } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && requestPermission && !(await Notifications.requestPermissionsAsync()).granted) throw new Error('Setup required: allow notifications for xorr in phone settings');
}
export async function postPadNotice(notice: PadNotice): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) throw new Error('Setup required: allow notifications for xorr in phone settings');
  await preparePadNotifications();
  await Notifications.scheduleNotificationAsync({ identifier: notice.key, content: { title: notice.title, body: notice.body, data: notice.data, categoryIdentifier: notice.categoryIdentifier }, trigger: Platform.OS === 'android' ? { channelId: 'xorrpad' } : null });
}
