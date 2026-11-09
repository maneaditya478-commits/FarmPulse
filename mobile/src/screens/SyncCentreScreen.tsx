import { useFocusEffect } from '@react-navigation/native';
import { CloudOff, RefreshCcw, Trash2, Wifi } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
  StatTile,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  deleteOperation,
  getMeta,
  listPendingOperations,
  listPendingPhotos,
  updateOperation,
} from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import type { PendingOperation } from '../types';

const ENTITY_LABEL: Record<string, string> = {
  animal: 'sync.entity.animal',
  health_observation: 'sync.entity.health_observation',
  vaccination: 'sync.entity.vaccination',
  feed_record: 'sync.entity.feed_record',
  water_record: 'sync.entity.water_record',
  environmental_record: 'sync.entity.environmental_record',
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.warningSoft, fg: colors.warning },
  error: { bg: colors.dangerSoft, fg: colors.danger },
  conflict: { bg: colors.dangerSoft, fg: colors.danger },
};

export function SyncCentreScreen() {
  const { online, pending, syncNow, refreshPending } = useAuth();
  const { t } = useLanguage();
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ops, photos, last] = await Promise.all([
      listPendingOperations(),
      listPendingPhotos(),
      getMeta('last_sync_at'),
    ]);
    setOperations(ops);
    setPhotoCount(photos.length);
    setLastSync(last);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshPending();
    }, [load, refreshPending]),
  );

  const runSync = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const summary = await syncNow();
      setNote(
        t('sync.summary', {
          applied: summary.applied,
          duplicates: summary.duplicates,
          conflicts: summary.conflicts,
          errors: summary.errors,
          photos: summary.photosUploaded,
        }),
      );
    } catch (err) {
      setError(isNetworkError(err) ? t('sync.offline_note') : (err as Error).message);
    } finally {
      await load();
      setBusy(false);
    }
  };

  const discard = (operation: PendingOperation) => {
    Alert.alert(t('sync.discard_title'), t('sync.discard_hint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sync.discard'),
        style: 'destructive',
        onPress: async () => {
          await deleteOperation(operation.id);
          await refreshPending();
          await load();
        },
      },
    ]);
  };

  const retryOne = async (operation: PendingOperation) => {
    await updateOperation(operation.id, 'pending', null);
    await load();
    await runSync();
  };

  return (
    <Screen>
      <PageTitle title={t('sync.title')} subtitle={t('sync.subtitle')} back />

      <View style={styles.statsGrid}>
        <StatTile label={t('sync.pending')} value={pending} />
        <StatTile label={t('sync.photos')} value={photoCount} />
      </View>

      <Card>
        <SectionTitle
          title={t('sync.title')}
          action={
            <Badge
              label={online ? t('sync.online') : t('sync.offline')}
              bg={online ? colors.successSoft : colors.warningSoft}
              fg={online ? colors.success : colors.warning}
            />
          }
        />
        <View style={styles.statusRow}>
          {online ? <Wifi size={16} color={colors.success} /> : <CloudOff size={16} color={colors.warning} />}
          <Text style={ui.mutedText}>
            {lastSync ? t('sync.last', { time: new Date(lastSync).toLocaleString() }) : t('sync.last_never')}
          </Text>
        </View>
        {note ? <GuardrailNote text={note} /> : null}
        {error ? <ErrorNote message={error} onRetry={runSync} /> : null}
        <Button title={t('sync.retry')} onPress={runSync} loading={busy} disabled={!online} />
      </Card>

      <SectionTitle title={t('sync.queued')} />
      {loading ? <Loader label={t('common.loading')} /> : null}
      {!loading && operations.length === 0 ? <EmptyState title={t('sync.empty')} hint={t('sync.empty_hint')} /> : null}

      {operations.map((operation) => {
        const tone = STATUS_TONE[operation.status] ?? STATUS_TONE.pending;
        const entityKey = ENTITY_LABEL[operation.entity_type];
        return (
          <Card key={operation.id} style={styles.opCard}>
            <View style={styles.opHeader}>
              <View style={styles.opTitleRow}>
                <RefreshCcw size={16} color={colors.leaf700} />
                <Text style={styles.opTitle}>
                  {entityKey ? t(entityKey) : operation.entity_type}
                </Text>
              </View>
              <Badge label={operation.status} bg={tone.bg} fg={tone.fg} />
            </View>
            <Text style={ui.mutedText}>
              {new Date(operation.created_at).toLocaleString()} · {t('sync.attempts', { count: operation.attempts })}
            </Text>
            <Text style={ui.mutedText} numberOfLines={2}>
              {operation.entity_id}
            </Text>
            {operation.message ? <Text style={styles.opMessage}>{operation.message}</Text> : null}
            <View style={styles.opActions}>
              {operation.status !== 'pending' ? (
                <Button title={t('common.retry')} variant="secondary" compact onPress={() => retryOne(operation)} />
              ) : null}
              <Pressable onPress={() => discard(operation)} style={styles.discard} hitSlop={8}>
                <Trash2 size={14} color={colors.danger} />
                <Text style={styles.discardText}>{t('sync.discard')}</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}

      <GuardrailNote text={t('sync.guardrail')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  opCard: { gap: 8 },
  opHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  opTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  opTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  opMessage: { fontSize: 12, color: colors.danger, lineHeight: 17 },
  opActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  discard: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  discardText: { fontSize: 12, fontWeight: '700', color: colors.danger },
});
