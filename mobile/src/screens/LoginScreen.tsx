import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { Button, Field, Input, styles as ui } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { languageNames } from '../i18n';
import { colors } from '../theme';
import type { Lang } from '../types';

export function LoginScreen() {
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState('ramesh@alg.demo');
  const [password, setPassword] = useState('Demo@1234');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t('login.required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoLeaf}>🌿</Text>
          </View>
          <Text style={styles.brand}>{t('app.name')}</Text>
          <Text style={styles.tagline}>{t('app.tagline')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={ui.mutedText}>{t('login.subtitle')}</Text>

          <View style={ui.selectRow}>
            {(['en', 'hi', 'mr'] as Lang[]).map((code) => (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                style={[ui.selectChip, code === lang && ui.selectChipActive]}
              >
                <Text style={[ui.selectChipText, code === lang && ui.selectChipTextActive]}>
                  {languageNames[code]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Field label={t('login.email')}>
            <Input
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="ramesh@alg.demo"
            />
          </Field>
          <Field label={t('login.password')}>
            <Input secureTextEntry value={password} onChangeText={setPassword} placeholder="Demo@1234" />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title={t('login.submit')} onPress={submit} loading={busy} />
          <Pressable
            onPress={() => {
              setEmail('ramesh@alg.demo');
              setPassword('Demo@1234');
              Alert.alert(t('login.demo'), 'ramesh@alg.demo · Demo@1234');
            }}
          >
            <Text style={styles.demo}>{t('login.use_demo')} · Ramesh (farmer)</Text>
          </Pressable>
          <Text style={styles.note}>{t('login.offline_note')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, justifyContent: 'center', padding: 20, gap: 18 },
  hero: { alignItems: 'center', gap: 6 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.leaf700,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoLeaf: { fontSize: 30 },
  brand: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tagline: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  demo: { color: colors.leaf700, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  note: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
