import { useFocusEffect } from '@react-navigation/native';
import { Droplets, Leaf } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../api/client';
import {
  Button,
  Chip,
  DemoNote,
  ErrorNote,
  Field,
  GuardrailNote,
  Input,
  Loader,
  PageTitle,
  Screen,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { enqueueOperation, loadAnimalCache, newId } from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import type { Animal, Page } from '../types';

const FEED_TYPES = [
  { value: 'green_fodder', en: 'Green fodder', hi: 'हरा चारा', mr: 'हिरवा चारा' },
  { value: 'dry_fodder', en: 'Dry fodder', hi: 'सूखा चारा', mr: 'कोरडा चारा' },
  { value: 'concentrate', en: 'Concentrate', hi: 'दाना', mr: 'दाणा' },
  { value: 'mineral_mixture', en: 'Mineral mixture', hi: 'खनिज मिश्रण', mr: 'खनिज मिश्रण' },
];

export function NutritionScreen() {
  const { online, refreshPending, syncNow } = useAuth();
  const { lang, t } = useLanguage();
  const [tab, setTab] = useState<'feed' | 'water'>('feed');
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalId, setAnimalId] = useState('');
  const [feedType, setFeedType] = useState('green_fodder');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [mineral, setMineral] = useState('');
  const [litres, setLitres] = useState('');
  const [waterSource, setWaterSource] = useState('Borewell');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = await loadAnimalCache();
    if (cached.length) {
      setAnimals(cached);
      if (!animalId) setAnimalId(cached[0]?.id ?? '');
    }
    try {
      const data = await apiFetch<Page<Animal>>('/animals?page_size=100');
      setAnimals(data.items);
      if (!animalId && data.items.length) setAnimalId(data.items[0]?.id ?? '');
    } catch {
      // Cached animals keep offline nutrition entry available.
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const feedLabel = (type: (typeof FEED_TYPES)[number]) =>
    lang === 'hi' ? type.hi : lang === 'mr' ? type.mr : type.en;

  const save = async () => {
    setError(null);
    setNotice(null);
    if (!animalId) {
      setError(t('health.select_required'));
      return;
    }
    if (tab === 'feed' && (!feedType || Number(quantity) <= 0)) {
      setError(t('nutrition.quantity'));
      return;
    }
    setBusy(true);
    const payload =
      tab === 'feed'
        ? {
            animal_id: animalId,
            feed_type: feedType,
            quantity_kg: Number(quantity),
            cost: cost ? Number(cost) : undefined,
            mineral_supplement: mineral.trim() || undefined,
            notes: notes.trim() || undefined,
            recorded_at: new Date().toISOString(),
          }
        : {
            animal_id: animalId,
            litres: litres ? Number(litres) : undefined,
            source: waterSource.trim() || undefined,
            quality_note: notes.trim() || undefined,
            recorded_at: new Date().toISOString(),
          };

    try {
      await apiFetch(tab === 'feed' ? '/nutrition/feed' : '/nutrition/water', { method: 'POST', body: payload });
      setNotice(t('nutrition.saved'));
      setQuantity('');
      setCost('');
      setMineral('');
      setLitres('');
      setNotes('');
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOperation({
          entityType: tab === 'feed' ? 'feed_record' : 'water_record',
          entityId: newId(),
          payload,
        });
        setNotice(t('nutrition.queued'));
        setQuantity('');
        setCost('');
        setMineral('');
        setLitres('');
        setNotes('');
        await refreshPending();
        syncNow().catch(() => undefined);
      } else {
        setError(err instanceof ApiError ? err.message : t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageTitle title={t('nutrition.title')} back />
      <DemoNote />
      {!online ? <GuardrailNote text={t('home.offline')} /> : null}

      <View style={ui.selectRow}>
        <Chip label={t('nutrition.feed_tab')} active={tab === 'feed'} onPress={() => setTab('feed')} />
        <Chip label={t('nutrition.water_tab')} active={tab === 'water'} onPress={() => setTab('water')} />
      </View>

      {loading ? <Loader label={t('common.loading')} /> : null}

      <Field label={t('nutrition.animal')}>
        <View style={ui.selectRow}>
          {animals.slice(0, 12).map((animal) => (
            <Chip
              key={animal.id}
              label={`${animal.name} · ${animal.tag_code}`}
              active={animal.id === animalId}
              onPress={() => setAnimalId(animal.id)}
            />
          ))}
        </View>
      </Field>

      {tab === 'feed' ? (
        <>
          <SectionTitle title={t('nutrition.feed_tab')} action={<Leaf size={18} color={colors.leaf700} />} />
          <Field label={t('nutrition.feed_type')}>
            <View style={ui.selectRow}>
              {FEED_TYPES.map((type) => (
                <Chip
                  key={type.value}
                  label={feedLabel(type)}
                  active={feedType === type.value}
                  onPress={() => setFeedType(type.value)}
                />
              ))}
            </View>
          </Field>
          <Field label={t('nutrition.quantity')}>
            <Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="6" />
          </Field>
          <Field label={t('nutrition.cost')}>
            <Input value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="180" />
          </Field>
          <Field label={t('nutrition.mineral')}>
            <Input value={mineral} onChangeText={setMineral} placeholder="Calcium mix" />
          </Field>
        </>
      ) : (
        <>
          <SectionTitle title={t('nutrition.water_tab')} action={<Droplets size={18} color={colors.leaf700} />} />
          <Field label={t('nutrition.water_litres')}>
            <Input value={litres} onChangeText={setLitres} keyboardType="decimal-pad" placeholder="40" />
          </Field>
          <Field label={t('nutrition.water_source')}>
            <Input value={waterSource} onChangeText={setWaterSource} placeholder="Borewell" />
          </Field>
        </>
      )}

      <Field label={t('nutrition.notes')}>
        <Input value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      </Field>

      {error ? <ErrorNote message={error} /> : null}
      {notice ? <GuardrailNote text={notice} /> : null}

      <Button
        title={tab === 'feed' ? t('nutrition.save_feed') : t('nutrition.save_water')}
        onPress={save}
        loading={busy}
        disabled={!animals.length}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notes: { minHeight: 70, textAlignVertical: 'top' },
});
