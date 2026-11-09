import { useFocusEffect } from '@react-navigation/native';
import { Bell, ShieldCheck, Syringe } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  GuardrailNote,
  Loader,
  PageTitle,
  Screen,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { useLanguage } from '../context/LanguageContext';
import { loadScheduleCache, saveScheduleCache } from '../db/database';
import { scheduleVaccinationReminders } from '../notifications';
import { colors, severityColor } from '../theme';
import type { VaccinationScheduleItem } from '../types';

export function VaccinationsScreen() {
  const { t } = useLanguage();
  const [items, setItems] = useState<VaccinationScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderNote, setReminderNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = await loadScheduleCache();
    if (cached.length) setItems(cached);
    try {
      const data = await apiFetch<VaccinationScheduleItem[]>('/vaccinations/schedule?within_days=60');
      setItems(data);
      await saveScheduleCache(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const enableReminders = async () => {
    setReminderBusy(true);
    setReminderNote(null);
    try {
      const result = await scheduleVaccinationReminders(items);
      if (result.denied) {
        Alert.alert(t('vaccinations.reminders'), t('vaccinations.denied'));
      } else {
        setReminderNote(`${t('vaccinations.enabled')}: ${result.scheduled}`);
      }
    } catch (err) {
      Alert.alert(t('vaccinations.reminders'), (err as Error).message);
    } finally {
      setReminderBusy(false);
    }
  };

  const statusTone = (status: string) =>
    status === 'overdue' ? severityColor('critical') : status === 'due' ? severityColor('medium') : severityColor('low');

  return (
    <Screen>
      <PageTitle title={t('vaccinations.title')} subtitle={t('vaccinations.source')} back />

      <Card>
        <SectionTitle title={t('vaccinations.reminders')} action={<Bell size={18} color={colors.leaf700} />} />
        <Text style={ui.mutedText}>{t('vaccinations.reminders_hint')}</Text>
        <Button
          title={t('vaccinations.enable')}
          variant="secondary"
          onPress={enableReminders}
          loading={reminderBusy}
          disabled={!items.length}
        />
        {reminderNote ? <GuardrailNote text={reminderNote} /> : null}
      </Card>

      {loading ? <Loader label={t('common.loading')} /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {!loading && items.length === 0 ? <EmptyState title={t('vaccinations.empty')} /> : null}

      {items.map((item) => {
        const tone = statusTone(item.status);
        return (
          <Card key={`${item.animal_id}-${item.vaccine_id}-${item.due_on ?? 'na'}`} style={styles.card}>
            <View style={styles.header}>
              <View style={styles.iconBox}>
                <Syringe size={18} color={colors.leaf700} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vaccine}>{item.vaccine_name}</Text>
                <Text style={ui.mutedText}>
                  {item.animal_name} · {item.disease}
                </Text>
              </View>
              <Badge label={item.status} bg={tone.bg} fg={tone.fg} />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.due}>
                {t('vaccinations.due')}: {item.due_on || '—'}
              </Text>
              <Text style={ui.mutedText}>
                {item.days_until === null || item.days_until === undefined
                  ? ''
                  : item.days_until === 0
                    ? t('vaccinations.today')
                    : t('vaccinations.days', { count: Math.abs(item.days_until) })}
              </Text>
            </View>
            <View style={styles.sourceRow}>
              <ShieldCheck size={13} color={colors.muted} />
              <Text style={styles.source}>{item.source_reference}</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaccine: { fontSize: 14, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  due: { fontSize: 12, fontWeight: '700', color: colors.text },
  sourceRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  source: { fontSize: 10, color: colors.muted, flex: 1 },
});
