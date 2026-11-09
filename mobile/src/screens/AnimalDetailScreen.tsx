import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Camera, HeartPulse, IdCard } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { apiFetch, mediaUrl, uploadAnimalPhoto } from '../api/client';
import { PhotoCapture } from '../components/PhotoCapture';
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
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { enqueuePhoto, getMeta, loadAnimalCache } from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors, severityColor } from '../theme';
import type { Animal, QRResponse } from '../types';
import type { RootStackParamList } from '../navigation/types';

export function AnimalDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AnimalDetail'>>();
  const { animalId } = route.params;
  const { online, syncNow } = useAuth();
  const { lang, t } = useLanguage();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [qr, setQr] = useState<QRResponse | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cachedAnimals = await loadAnimalCache();
    const cached = cachedAnimals.find((item) => item.id === animalId);
    if (cached) setAnimal(cached);
    const stored = await getMeta('offline_animal_ids');
    const ids: string[] = stored ? JSON.parse(stored) : [];
    setPendingSync(ids.includes(animalId));
    try {
      const fresh = await apiFetch<Animal>(`/animals/${animalId}`);
      setAnimal(fresh);
      setError(null);
    } catch (err) {
      if (!cached) setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const issueQr = async () => {
    setQrBusy(true);
    try {
      const response = await apiFetch<QRResponse>(`/animals/${animalId}/qr`, { method: 'POST' });
      setQr(response);
    } catch (err) {
      Alert.alert(t('animals.qr'), isNetworkError(err) ? t('animals.qr_pending') : (err as Error).message);
    } finally {
      setQrBusy(false);
    }
  };

  const capturePhoto = async (uri: string) => {
    setPhotoUri(uri);
    if (pendingSync || !online) {
      await enqueuePhoto(animalId, uri);
      Alert.alert(t('animals.photo'), t('nutrition.queued'));
      return;
    }
    try {
      await uploadAnimalPhoto(animalId, uri);
      Alert.alert(t('animals.photo'), t('nutrition.saved'));
      await load();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueuePhoto(animalId, uri);
        syncNow().catch(() => undefined);
        Alert.alert(t('animals.photo'), t('nutrition.queued'));
      } else {
        Alert.alert(t('animals.photo'), (err as Error).message);
      }
    }
  };

  if (loading && !animal) {
    return (
      <Screen>
        <PageTitle title={t('animals.title')} back />
        <Loader label={t('common.loading')} />
      </Screen>
    );
  }

  if (!animal) {
    return (
      <Screen>
        <PageTitle title={t('animals.title')} back />
        {error ? <ErrorNote message={error} onRetry={load} /> : <EmptyState title={t('common.no_data')} />}
      </Screen>
    );
  }

  const photo = photoUri || mediaUrl(animal.photo_url);
  const speciesName =
    lang === 'hi' ? animal.species.name_hi : lang === 'mr' ? animal.species.name_mr : animal.species.name_en;
  const severity = severityColor(undefined);

  return (
    <Screen>
      <PageTitle title={animal.name} subtitle={animal.tag_code} back />

      {pendingSync ? <GuardrailNote text={t('animals.pending')} /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      <View style={styles.hero}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoLetter}>{animal.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.heroBody}>
          <Text style={styles.heroName}>{animal.name}</Text>
          <Text style={ui.mutedText}>
            {animal.tag_code} · {speciesName}
            {animal.breed ? ` · ${animal.breed.name}` : ''}
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={animal.status} bg={severity.bg} fg={severity.fg} />
            {animal.is_sample ? <Badge label={t('common.sample')} /> : null}
            {pendingSync ? <Badge label={t('animals.pending')} bg={colors.warningSoft} fg={colors.warning} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button title={t('animals.photo')} variant="secondary" compact onPress={() => setCameraOpen(true)} />
        <Button
          title={t('home.report')}
          compact
          onPress={() => navigation.navigate('Tabs', { screen: 'Health', params: { animalId } })}
        />
      </View>

      <Card>
        <SectionTitle title={t('animal_form.title')} />
        <Row label={t('animals.species')} value={speciesName} />
        <Row label={t('animal_form.breed')} value={animal.breed?.name || '—'} />
        <Row label={t('animals.sex')} value={animal.sex} />
        <Row label={t('animal_form.birth')} value={animal.birth_date || '—'} />
        <Row label={t('animals.weight')} value={animal.weight_kg ? `${animal.weight_kg} kg` : '—'} />
        <Row label={t('animals.tag')} value={animal.tag_code} />
      </Card>

      <Card>
        <SectionTitle title={t('animals.qr')} action={<IdCard size={18} color={colors.leaf700} />} />
        {qr ? (
          <View style={styles.qrBox}>
            <QRCode value={qr.qr_payload} size={168} color={colors.leaf800} backgroundColor="#ffffff" />
            <Text style={styles.qrValue}>{qr.identifier_value}</Text>
            <Text style={ui.mutedText}>{t('animals.qr_hint')}</Text>
          </View>
        ) : (
          <>
            <Text style={ui.mutedText}>{pendingSync ? t('animals.qr_pending') : t('animals.qr_hint')}</Text>
            <Button
              title={t('animals.qr')}
              variant="secondary"
              onPress={issueQr}
              loading={qrBusy}
              disabled={pendingSync}
            />
          </>
        )}
      </Card>

      <Card>
        <SectionTitle title={t('health.recent')} action={<HeartPulse size={18} color={colors.leaf700} />} />
        <Text style={ui.mutedText}>{t('health.advisory')}</Text>
      </Card>

      <PhotoCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={capturePhoto} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 96, height: 96, borderRadius: 20, backgroundColor: colors.leaf50 },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: colors.leaf100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLetter: { fontSize: 34, fontWeight: '800', color: colors.leaf800 },
  heroBody: { flex: 1, gap: 4 },
  heroName: { fontSize: 20, fontWeight: '800', color: colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 12, color: colors.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  qrBox: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  qrValue: { fontSize: 13, fontWeight: '700', color: colors.leaf800 },
});
