import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { MapPin, RefreshCcw, Stethoscope } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../api/client';
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
  styles as ui,
} from '../components/ui';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import { useLanguage } from '../context/LanguageContext';
import type { NearbyVet } from '../types';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function NearbyVetsScreen() {
  const { t } = useLanguage();
  const [vets, setVets] = useState<NearbyVet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let coordinates: Coordinates | null = null;
    let denied = false;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
        const position =
          lastKnown ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      } else {
        denied = true;
      }
    } catch {
      denied = true;
    }

    const query = coordinates
      ? `?latitude=${coordinates.latitude.toFixed(5)}&longitude=${coordinates.longitude.toFixed(5)}`
      : '';
    try {
      const data = await apiFetch<NearbyVet[]>(`/veterinarians/nearby${query}`);
      setVets(data);
      setLocationNote(
        coordinates ? t('nearby.sorted_by_distance') : denied ? t('nearby.location_denied') : null,
      );
    } catch (err) {
      setError(isNetworkError(err) ? t('common.network') : err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
  };

  const callVet = (phone?: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => undefined);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle title={t('nearby.title')} subtitle={t('profile.vets_hint')} back />

      {locationNote ? <GuardrailNote text={locationNote} /> : null}
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading ? <Loader label={t('common.loading')} /> : null}

      {!loading && !error && vets.length === 0 ? <EmptyState title={t('nearby.empty')} /> : null}

      {vets.map((vet) => (
        <Card key={vet.vet_id} style={styles.vetCard}>
          <View style={styles.vetHeader}>
            <View style={styles.icon}>
              <Stethoscope size={18} color={colors.leaf700} />
            </View>
            <View style={styles.vetTitle}>
              <Text style={styles.name}>{vet.name || t('nearby.title')}</Text>
              <Text style={ui.mutedText}>{vet.qualification || vet.clinic_name || ''}</Text>
            </View>
            {vet.verified ? (
              <Badge label={t('nearby.verified')} bg={colors.successSoft} fg={colors.success} />
            ) : null}
          </View>

          <View style={styles.metaRow}>
            {vet.clinic_name ? <Text style={ui.mutedText}>{vet.clinic_name}</Text> : null}
            <View style={styles.metaItem}>
              <MapPin size={13} color={colors.muted} />
              <Text style={ui.mutedText}>
                {[vet.district, vet.availability].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            {typeof vet.distance_km === 'number' ? (
              <Badge
                label={t('nearby.km', { count: vet.distance_km.toFixed(1) })}
                bg={colors.leaf50}
                fg={colors.leaf700}
              />
            ) : null}
          </View>

          {vet.phone ? (
            <Button
              title={`${t('nearby.call')} ${vet.phone}`}
              variant="secondary"
              onPress={() => callVet(vet.phone)}
              compact
            />
          ) : (
            <Text style={ui.mutedText}>{t('nearby.no_phone')}</Text>
          )}
        </Card>
      ))}

      <Card>
        <View style={styles.retryRow}>
          <RefreshCcw size={16} color={colors.leaf700} />
          <Text style={styles.retryText}>{t('nearby.refresh_hint')}</Text>
        </View>
        <Button title={t('common.retry')} variant="secondary" onPress={refresh} loading={refreshing} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  vetCard: { gap: 10 },
  vetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vetTitle: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  metaRow: { gap: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 },
});
