import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, LogOut, MapPin, RefreshCcw, ShieldCheck, Stethoscope } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../api/client';
import {
  Badge,
  Button,
  Card,
  DemoNote,
  GuardrailNote,
  PageTitle,
  Screen,
  SectionTitle,
  SelectRow,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { languageNames } from '../i18n';
import { colors } from '../theme';
import type { Lang, User } from '../types';

const ROLE_LABEL: Record<string, string> = {
  farmer: 'Farmer',
  veterinarian: 'Veterinarian',
  paravet: 'Para-vet',
  cooperative: 'Cooperative',
  admin: 'Administrator',
};

export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, pending, logout, refreshUser } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [languageNote, setLanguageNote] = useState<string | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);

  const initials =
    user?.full_name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'AL';

  const changeLanguage = async (next: Lang) => {
    if (next === lang) return;
    setSavingLanguage(true);
    setLanguageNote(null);
    await setLang(next);
    try {
      await apiFetch<User>('/users/me', { method: 'PATCH', body: { language: next } });
      await refreshUser();
    } catch {
      setLanguageNote(t('profile.language_offline'));
    } finally {
      setSavingLanguage(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(t('profile.signout'), t('profile.signout_hint'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signout'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  const location = [user?.village, user?.district, user?.state].filter(Boolean).join(', ');

  return (
    <Screen>
      <PageTitle title={t('profile.title')} subtitle={t('app.tagline')} />
      <DemoNote />

      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name}>{user?.full_name || '—'}</Text>
            <Text style={ui.mutedText}>{user?.email || '—'}</Text>
            <View style={styles.badges}>
              <Badge label={ROLE_LABEL[user?.role ?? ''] ?? user?.role ?? '—'} />
              {user?.is_sample ? (
                <Badge label={t('profile.sample')} bg={colors.warningSoft} fg={colors.warning} />
              ) : null}
            </View>
          </View>
        </View>
        {location ? (
          <View style={styles.locationRow}>
            <MapPin size={14} color={colors.muted} />
            <Text style={ui.mutedText}>{location}</Text>
          </View>
        ) : null}
        {user?.phone ? <Text style={ui.mutedText}>{user.phone}</Text> : null}
      </Card>

      <Card>
        <SectionTitle title={t('profile.language')} />
        <SelectRow
          options={(Object.keys(languageNames) as Lang[]).map((code) => ({
            label: languageNames[code],
            value: code,
          }))}
          value={lang}
          onChange={(value) => changeLanguage(value as Lang)}
        />
        {savingLanguage ? <Text style={ui.mutedText}>{t('common.loading')}</Text> : null}
        {languageNote ? <Text style={ui.mutedText}>{languageNote}</Text> : null}
      </Card>

      <Card>
        <Pressable onPress={() => navigation.navigate('NearbyVets')} style={styles.linkRow}>
          <View style={styles.linkIcon}>
            <Stethoscope size={18} color={colors.leaf700} />
          </View>
          <View style={styles.linkText}>
            <Text style={styles.linkTitle}>{t('profile.vets')}</Text>
            <Text style={ui.mutedText}>{t('profile.vets_hint')}</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('SyncCentre')} style={styles.linkRow}>
          <View style={styles.linkIcon}>
            <RefreshCcw size={18} color={colors.leaf700} />
          </View>
          <View style={styles.linkText}>
            <Text style={styles.linkTitle}>{t('profile.sync')}</Text>
            <Text style={ui.mutedText}>{t('sync.subtitle')}</Text>
          </View>
          <Badge label={String(pending)} bg={pending ? colors.warningSoft : colors.leaf50} fg={pending ? colors.warning : colors.leaf700} />
        </Pressable>
      </Card>

      <GuardrailNote text={t('profile.guardrail')} />

      <Card>
        <View style={styles.linkRow}>
          <View style={styles.linkIcon}>
            <ShieldCheck size={18} color={colors.leaf700} />
          </View>
          <View style={styles.linkText}>
            <Text style={styles.linkTitle}>{t('app.name')}</Text>
            <Text style={ui.mutedText}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </View>
        </View>
      </Card>

      <Button title={t('profile.signout')} variant="danger" onPress={confirmSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.leaf700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 19, fontWeight: '800' },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { flex: 1, gap: 3 },
  linkTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
});
