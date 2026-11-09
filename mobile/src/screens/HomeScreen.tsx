import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, ChevronRight, HeartPulse, RefreshCcw, Salad, Syringe, UserPlus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../api/client';
import {
  Badge,
  Button,
  Card,
  DemoNote,
  EmptyState,
  ErrorNote,
  Loader,
  OfflineBanner,
  PageTitle,
  Screen,
  SectionTitle,
  StatTile,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMeta, setMeta } from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import type { AnalyticsOverview } from '../types';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user, pending, syncNow, refreshPending } = useAuth();
  const { t } = useLanguage();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(!overview);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<AnalyticsOverview>('/analytics/overview');
      setOverview(data);
      await setMeta('overview_cache', JSON.stringify(data));
    } catch (err) {
      const cached = await getMeta('overview_cache');
      if (cached) setOverview(JSON.parse(cached) as AnalyticsOverview);
      else setError(isNetworkError(err) ? t('common.network') : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshPending();
    }, [load, refreshPending]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } catch {
      // Offline is expected; the sync centre shows the queued records.
    }
    await load();
    setRefreshing(false);
  };

  const quickActions = [
    { label: t('home.report'), icon: HeartPulse, screen: 'Health' },
    { label: t('home.add_animal'), icon: UserPlus, screen: 'AnimalForm' },
    { label: t('home.vaccinations'), icon: Syringe, screen: 'Vaccinations' },
    { label: t('home.nutrition'), icon: Salad, screen: 'Nutrition' },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle
        title={t('home.greeting', { name: user?.full_name?.split(' ')[0] || '' })}
        subtitle={t('home.subtitle')}
      />
      <OfflineBanner />
      <DemoNote />

      {pending > 0 ? (
        <Pressable onPress={() => navigation.navigate('SyncCentre')}>
          <View style={styles.pendingRow}>
            <RefreshCcw size={16} color={colors.warning} />
            <Text style={styles.pendingText}>
              {pending} {t('sync.pending')}
            </Text>
            <ChevronRight size={16} color={colors.warning} />
          </View>
        </Pressable>
      ) : null}

      {loading ? <Loader label={t('common.loading')} /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {overview ? (
        <View style={styles.grid}>
          <StatTile label={t('home.animals')} value={overview.total_animals} />
          <StatTile
            label={t('home.active_cases')}
            value={overview.active_health_cases}
            hint={overview.critical_cases ? `${overview.critical_cases} critical` : undefined}
          />
          <StatTile
            label={t('home.upcoming_vaccinations')}
            value={overview.upcoming_vaccinations}
            hint={overview.overdue_vaccinations ? `${overview.overdue_vaccinations} ${t('vaccinations.overdue')}` : undefined}
          />
          <StatTile label={t('home.milk')} value={`${overview.milk_litres_30d.toFixed(1)} L`} />
        </View>
      ) : null}

      <SectionTitle title={t('home.quick_actions')} />
      <View style={styles.grid}>
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.label}
              onPress={() => navigation.navigate(action.screen)}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.actionIcon}>
                <Icon size={20} color={colors.leaf700} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <SectionTitle title={t('home.alerts')} />
        {overview?.alerts?.length ? (
          overview.alerts.slice(0, 3).map((alert, index) => (
            <View key={`${alert.title ?? 'alert'}-${index}`} style={styles.alertRow}>
              <AlertTriangle size={16} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{alert.title || alert.message || 'Farm alert'}</Text>
                {alert.title && alert.message ? <Text style={ui.mutedText}>{alert.message}</Text> : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={ui.mutedText}>{t('home.no_alerts')}</Text>
        )}
      </Card>

      <Card>
        <SectionTitle title={t('home.sync')} />
        <View style={styles.syncRow}>
          <Badge label={`${t('sync.pending')}: ${pending}`} bg={pending ? colors.warningSoft : colors.leaf50} fg={pending ? colors.warning : colors.leaf700} />
          <Button title={t('sync.retry')} variant="secondary" compact onPress={refresh} />
        </View>
        <Text style={ui.mutedText}>{t('sync.subtitle')}</Text>
      </Card>

      {!overview && !loading && !error ? (
        <EmptyState title={t('common.no_data')} hint={t('home.no_alerts')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 11,
  },
  pendingText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.warning },
  alertRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  alertTitle: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
