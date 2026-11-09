import { useNavigation } from '@react-navigation/native';
import { Camera } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch, uploadAnimalPhoto } from '../api/client';
import { PhotoCapture } from '../components/PhotoCapture';
import {
  Button,
  Chip,
  DemoNote,
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
import {
  enqueueOperation,
  enqueuePhoto,
  getMeta,
  newId,
  saveAnimalCache,
  setMeta,
} from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import type { Animal, Breed, Species } from '../types';

interface CachedCatalog {
  species: Species[];
  breeds: Breed[];
}

export function AnimalFormScreen() {
  const navigation = useNavigation<any>();
  const { online, syncNow } = useAuth();
  const { lang, t } = useLanguage();
  const [catalog, setCatalog] = useState<CachedCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [breedId, setBreedId] = useState('');
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [tagCode, setTagCode] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [weight, setWeight] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const cached = await getMeta('catalog_cache');
      if (cached) setCatalog(JSON.parse(cached) as CachedCatalog);
      try {
        const [species, breeds] = await Promise.all([
          apiFetch<Species[]>('/animals/species'),
          apiFetch<Breed[]>('/animals/breeds'),
        ]);
        const fresh = { species, breeds };
        setCatalog(fresh);
        await setMeta('catalog_cache', JSON.stringify(fresh));
        if (!speciesId && species.length) setSpeciesId(species[0]?.id ?? '');
      } catch (err) {
        if (!cached) setCatalogError(isNetworkError(err) ? t('common.network') : (err as Error).message);
      }
    })();
    // The catalog is fetched once when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const breeds = useMemo(
    () => (catalog?.breeds || []).filter((breed) => breed.species_id === speciesId),
    [catalog, speciesId],
  );

  const speciesLabel = (species: Species) =>
    lang === 'hi' ? species.name_hi : lang === 'mr' ? species.name_mr : species.name_en;

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t('animal_form.name'));
      return;
    }
    if (!speciesId) {
      setError(t('animal_form.species'));
      return;
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
      setError(t('animal_form.birth'));
      return;
    }
    setBusy(true);
    const payload = {
      species_id: speciesId,
      breed_id: breedId || null,
      name: name.trim(),
      sex,
      tag_code: tagCode.trim() || null,
      birth_date: birthDate.trim() || null,
      weight_kg: weight ? Number(weight) : null,
    };
    try {
      const animal = await apiFetch<Animal>('/animals', { method: 'POST', body: payload });
      if (photoUri) {
        try {
          await uploadAnimalPhoto(animal.id, photoUri);
        } catch {
          await enqueuePhoto(animal.id, photoUri);
        }
      }
      await saveAnimalCache([animal]);
      Alert.alert(t('animal_form.title'), t('animal_form.saved_online'));
      navigation.goBack();
    } catch (err) {
      if (isNetworkError(err)) {
        const localId = newId();
        const species = catalog?.species.find((item) => item.id === speciesId);
        const localAnimal: Animal = {
          id: localId,
          farm_id: '',
          name: name.trim(),
          tag_code: tagCode.trim() || `PENDING-${localId.slice(0, 6).toUpperCase()}`,
          sex,
          birth_date: birthDate.trim() || null,
          weight_kg: weight ? Number(weight) : null,
          status: 'active',
          is_sample: false,
          created_at: new Date().toISOString(),
          species:
            species ||
            ({
              id: speciesId,
              code: 'unknown',
              name_en: 'Animal',
              name_hi: 'पशु',
              name_mr: 'प्राणी',
              icon: '',
            } as Species),
          breed: breeds.find((item) => item.id === breedId) || null,
          identifiers: [],
        };
        await enqueueOperation({ entityType: 'animal', entityId: localId, payload });
        if (photoUri) await enqueuePhoto(localId, photoUri);
        await saveAnimalCache([localAnimal]);
        const stored = await getMeta('offline_animal_ids');
        const ids: string[] = stored ? JSON.parse(stored) : [];
        ids.push(localId);
        await setMeta('offline_animal_ids', JSON.stringify(ids));
        Alert.alert(t('animal_form.title'), t('animal_form.saved_offline'));
        syncNow().catch(() => undefined);
        navigation.goBack();
      } else {
        setError(err instanceof ApiError ? err.message : t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageTitle title={t('animal_form.title')} back />
      <DemoNote />
      {!online ? <GuardrailNote text={t('common.network')} /> : null}

      {!catalog ? (
        catalogError ? (
          <GuardrailNote text={catalogError} />
        ) : (
          <Loader label={t('common.loading')} />
        )
      ) : (
        <>
          <SectionTitle title={t('animal_form.photo')} />
          <View style={styles.photoRow}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Camera size={26} color={colors.leaf700} />
              </View>
            )}
            <Button
              title={photoUri ? t('animal_form.retake') : t('animal_form.photo')}
              variant="secondary"
              compact
              onPress={() => setCameraOpen(true)}
            />
          </View>

          <Field label={t('animal_form.name')}>
            <Input value={name} onChangeText={setName} placeholder="Ganga" />
          </Field>

          <Field label={t('animal_form.species')}>
            <View style={ui.selectRow}>
              {catalog.species.map((species) => (
                <Chip
                  key={species.id}
                  label={speciesLabel(species)}
                  active={species.id === speciesId}
                  onPress={() => {
                    setSpeciesId(species.id);
                    setBreedId('');
                  }}
                />
              ))}
            </View>
          </Field>

          {breeds.length ? (
            <Field label={t('animal_form.breed')}>
              <View style={ui.selectRow}>
                {breeds.map((breed) => (
                  <Chip
                    key={breed.id}
                    label={breed.name}
                    active={breed.id === breedId}
                    onPress={() => setBreedId(breed.id === breedId ? '' : breed.id)}
                  />
                ))}
              </View>
            </Field>
          ) : null}

          <Field label={t('animal_form.sex')}>
            <View style={ui.selectRow}>
              <Chip label={t('animal_form.female')} active={sex === 'female'} onPress={() => setSex('female')} />
              <Chip label={t('animal_form.male')} active={sex === 'male'} onPress={() => setSex('male')} />
            </View>
          </Field>

          <Field label={`${t('animal_form.tag')} (${t('common.optional')})`}>
            <Input value={tagCode} onChangeText={setTagCode} autoCapitalize="characters" placeholder="DEMO-C4" />
          </Field>
          <Field label={`${t('animal_form.birth')} (${t('common.optional')})`}>
            <Input value={birthDate} onChangeText={setBirthDate} placeholder="2022-06-15" />
          </Field>
          <Field label={`${t('animal_form.weight')} (${t('common.optional')})`}>
            <Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="380" />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={t('animal_form.save')} onPress={submit} loading={busy} />
        </>
      )}

      <PhotoCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={setPhotoUri} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 92, height: 92, borderRadius: 16, backgroundColor: colors.leaf50 },
  photoPlaceholder: {
    width: 92,
    height: 92,
    borderRadius: 16,
    backgroundColor: colors.leaf50,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.leaf300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
