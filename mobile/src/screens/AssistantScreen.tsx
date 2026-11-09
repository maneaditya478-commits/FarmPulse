import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { Bot, RotateCcw, Send, Square, Sparkles, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../api/client';
import {
  Badge,
  Button,
  Card,
  Chip,
  ErrorNote,
  GuardrailNote,
  Input,
  PageTitle,
  Screen,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getMeta, loadAnimalCache, newId, saveAnimalCache, setMeta } from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors } from '../theme';
import type { AIResponse, Animal, Lang, Page } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: AIResponse;
}

const SPEECH_LANGUAGE: Record<Lang, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

const SUGGESTIONS = [
  'assistant.suggestion.health',
  'assistant.suggestion.vaccination',
  'assistant.suggestion.market',
  'assistant.suggestion.finance',
];

export function AssistantScreen() {
  const { online } = useAuth();
  const { lang, t } = useLanguage();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalId, setAnimalId] = useState('');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | undefined>(undefined);

  useEffect(() => {
    getMeta('assistant_session_id').then((value) => {
      sessionId.current = value ?? undefined;
    });
    return () => {
      Speech.stop();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const cached = await loadAnimalCache();
        if (cached.length) setAnimals(cached);
        try {
          const data = await apiFetch<Page<Animal>>('/animals?page_size=100');
          setAnimals(data.items);
          await saveAnimalCache(data.items);
        } catch {
          // Cached animals keep the picker usable offline.
        }
      })();
    }, []),
  );

  const speak = (message: ChatMessage) => {
    Speech.stop();
    setSpeakingId(message.id);
    Speech.speak(message.text, {
      language: SPEECH_LANGUAGE[lang],
      rate: 0.95,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeakingId(null);
  };

  const resetConversation = async () => {
    setMessages([]);
    setError(null);
    setText('');
    sessionId.current = undefined;
    await setMeta('assistant_session_id', '');
  };

  const ask = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? text).trim();
    if (prompt.length < 2) return;
    if (!online) {
      setError(t('assistant.offline'));
      return;
    }
    setBusy(true);
    setError(null);
    setText('');
    const userMessage: ChatMessage = { id: newId(), role: 'user', text: prompt };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await apiFetch<AIResponse>('/ai/query', {
        method: 'POST',
        body: {
          text: prompt,
          language: lang,
          animal_id: animalId || undefined,
          session_id: sessionId.current,
          input_mode: 'text',
        },
        timeoutMs: 90000,
      });
      sessionId.current = response.session_id;
      await setMeta('assistant_session_id', response.session_id);
      setMessages((current) => [
        ...current,
        { id: response.interaction_id || newId(), role: 'assistant', text: response.response_text, meta: response },
      ]);
    } catch (err) {
      setError(isNetworkError(err) ? t('assistant.offline') : err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageTitle title={t('assistant.title')} subtitle={t('assistant.guardrail')} />
      <GuardrailNote text={t('assistant.guardrail')} />

      <Card>
        <SectionTitle
          title={t('assistant.animal')}
          action={
            messages.length ? (
              <Pressable onPress={resetConversation} style={styles.resetRow} hitSlop={8}>
                <RotateCcw size={14} color={colors.leaf700} />
                <Text style={styles.resetText}>{t('assistant.new')}</Text>
              </Pressable>
            ) : (
              <Sparkles size={18} color={colors.leaf700} />
            )
          }
        />
        <View style={ui.selectRow}>
          <Chip label={t('assistant.no_animal')} active={!animalId} onPress={() => setAnimalId('')} />
          {animals.slice(0, 8).map((animal) => (
            <Chip
              key={animal.id}
              label={animal.name}
              active={animal.id === animalId}
              onPress={() => setAnimalId(animal.id)}
            />
          ))}
        </View>
        <Text style={ui.mutedText}>{t('assistant.voice_hint')}</Text>
      </Card>

      {messages.length === 0 ? (
        <Card>
          <View style={styles.emptyRow}>
            <Bot size={22} color={colors.leaf700} />
            <Text style={styles.emptyText}>{t('assistant.empty')}</Text>
          </View>
          <View style={styles.suggestionList}>
            {SUGGESTIONS.map((key) => (
              <Pressable
                key={key}
                onPress={() => ask(t(key))}
                disabled={busy || !online}
                style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.suggestionText}>{t(key)}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {messages.map((message) =>
        message.role === 'user' ? (
          <View key={message.id} style={styles.userBubble}>
            <Text style={styles.userText}>{message.text}</Text>
          </View>
        ) : (
          <Card key={message.id} style={styles.assistantBubble}>
            <View style={styles.assistantHeader}>
              <View style={styles.assistantIdentity}>
                <Bot size={16} color={colors.leaf700} />
                <Text style={styles.assistantName}>{t('app.name')}</Text>
              </View>
              <Pressable
                onPress={() => (speakingId === message.id ? stopSpeaking() : speak(message))}
                hitSlop={8}
                style={styles.speakButton}
              >
                {speakingId === message.id ? (
                  <Square size={14} color={colors.leaf700} />
                ) : (
                  <Volume2 size={14} color={colors.leaf700} />
                )}
                <Text style={styles.speakText}>
                  {t(speakingId === message.id ? 'assistant.stop' : 'assistant.speak')}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.assistantText}>{message.text}</Text>
            {message.meta ? (
              <View style={styles.meta}>
                <View style={styles.metaRow}>
                  <Badge label={`${t('assistant.intent')}: ${message.meta.intent}`} />
                  {message.meta.escalated ? (
                    <Badge label={t('health.escalated')} bg={colors.dangerSoft} fg={colors.danger} />
                  ) : null}
                </View>
                <Text style={ui.mutedText}>{t('assistant.agents')}: {message.meta.agents_used.join(', ') || '—'}</Text>
                <Text style={ui.mutedText}>{t('assistant.provider')}: {message.meta.llm_provider}</Text>
                <Text style={ui.mutedText}>{t('health.advisory')}</Text>
              </View>
            ) : null}
          </Card>
        ),
      )}

      {busy ? (
        <Card style={styles.thinking}>
          <Bot size={16} color={colors.leaf700} />
          <Text style={styles.thinkingText}>{t('assistant.checking')}</Text>
        </Card>
      ) : null}

      {error ? <ErrorNote message={error} onRetry={() => ask()} /> : null}

      <Card>
        <Input
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={3}
          placeholder={t('assistant.placeholder')}
          style={styles.input}
        />
        <Button title={t('assistant.ask')} onPress={() => ask()} loading={busy} disabled={!text.trim() || !online} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resetText: { fontSize: 12, fontWeight: '700', color: colors.leaf700 },
  emptyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  emptyText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
  suggestionList: { gap: 8 },
  suggestion: {
    backgroundColor: colors.leaf50,
    borderWidth: 1,
    borderColor: colors.leaf200,
    borderRadius: 12,
    padding: 11,
  },
  suggestionText: { fontSize: 13, color: colors.leaf800, fontWeight: '600' },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    backgroundColor: colors.leaf700,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
  assistantBubble: { maxWidth: '94%', borderLeftWidth: 3, borderLeftColor: colors.leaf600 },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  assistantIdentity: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assistantName: { fontSize: 12, fontWeight: '800', color: colors.leaf800 },
  speakButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  speakText: { fontSize: 11, fontWeight: '700', color: colors.leaf700 },
  assistantText: { fontSize: 14, lineHeight: 22, color: colors.text },
  meta: { gap: 5, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontSize: 12, fontWeight: '600', color: colors.leaf700 },
  input: { minHeight: 84, maxHeight: 150, textAlignVertical: 'top' },
});
