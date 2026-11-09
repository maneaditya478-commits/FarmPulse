import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronRight, Plus, Search } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch, mediaUrl } from '../api/client';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Input,
  Loader,
  PageTitle,
  Screen,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMeta, loadAnimalCache, saveAnimalCache, setMeta } from '../db/database';
import { colors } from '../theme';
import type { Animal, Page } from '../types';

export function AnimalsScreen() {
  const navigation = useNavigation<any>();
  const { syncNow } = useAuth();
  const { lang, t } = useLanguage();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [offlineIds, setOfflineIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = await loadAnimalCache();
    const stored = await getMeta('offline_animal_ids');
    const localIds: string[] = stored ? JSON.parse(stored) : [];
    setOfflineIds(localIds);
    const locals = cached.filter((animal) => localIds.includes(animal.id));
    if (cached.length) setAnimals([...locals, ...cached.filter((animal) => !localIds.includes(animal.id))]);
    try {
      const data = await apiFetch<Page<Animal>>('/animals?page_size=100');
      const remaining = localIds.filter((id) => !data.items.some((animal) => animal.id === id));
      await setMeta('offline_animal_ids', JSON.stringify(remaining));
      setOfflineIds(remaining);
      await saveAnimalCache(data.items);
      const stillLocal = cached.filter((animal) => remaining.includes(animal.id));
      setAnimals([...stillLocal, ...data.items]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setAnimals(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } catch {
      // Queue remains local and is shown in the sync centre.
    }
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return animals;
    return animals.filter(
      (animal) =>
        animal.name.toLowerCase().includes(needle) || animal.tag_code.toLowerCase().includes(needle),
    );
  }, [animals, query]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <PageTitle title={t('animals.title')} subtitle={t('home.subtitle')} />
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.muted} />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={t('animals.search')}
            style={styles.searchInput}
          />
        </View>
        <Button title={`+ ${t('animals.add')}`} compact onPress={() => navigation.navigate('AnimalForm')} />
      </View>

      {loading ? <Loader label={t('common.loading')} /> : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState title={t('animals.empty')} hint={t('animals.add')} />
      ) : null}

      {filtered.map((animal) => {
        const photo = mediaUrl(animal.photo_url);
        const pendingSync = offlineIds.includes(animal.id);
        const speciesName =
          lang === 'hi' ? animal.species.name_hi : lang === 'mr' ? animal.species.name_mr : animal.species.name_en;
        return (
          <Pressable
            key={animal.id}
            onPress={() => navigation.navigate('AnimalDetail', { animalId: animal.id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{animal.name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.name}>{animal.name}</Text>
              <Text style={ui.mutedText}>
                {animal.tag_code} · {speciesName}
                {animal.breed ? ` · ${animal.breed.name}` : ''}
              </Text>
              <View style={styles.badges}>
                {pendingSync ? <Badge label={t('animals.pending')} bg={colors.warningSoft} fg={colors.warning} /> : null}
                {animal.is_sample ? <Badge label={t('common.sample')} /> : null}
              </View>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => navigation.navigate('AnimalForm')}
        style={({ pressed }) => [styles.addTile, pressed && { opacity: 0.75 }]}
      >
        <Plus size={20} color={colors.leaf700} />
        <Text style={styles.addText}>{t('animals.add')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchInput: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  avatar: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.leaf50 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.leaf100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.leaf800 },
  rowBody: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  badges: { flexDirection: 'row', gap: 6, marginTop: 3 },
  addTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.leaf300,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: colors.leaf50,
  },
  addText: { fontSize: 13, fontWeight: '700', color: colors.leaf800 },
});
