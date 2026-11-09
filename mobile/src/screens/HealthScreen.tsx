import { useFocusEffect, useRoute } from '@react-navigation/native';
import { AlertTriangle, HeartPulse } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, apiFetch } from '../api/client';
import {
  Badge,
  Button,
  Card,
  Chip,
  DemoNote,
  EmptyState,
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
import {
  enqueueOperation,
  loadAnimalCache,
  loadCaseCache,
  newId,
  saveCaseCache,
} from '../db/database';
import { isNetworkError } from '../offline/sync';
import { colors, severityColor } from '../theme';
import type { Animal, HealthCase, HealthReportResponse, Lang, Page } from '../types';

const SYMPTOMS = [
  'fever',
  'cough',
  'diarrhea',
  'reduced_appetite',
  'reduced_milk',
  'lameness',
  'swelling',
  'bloat',
  'breathing_difficulty',
  'not_drinking',
];

const FALLBACK_WARNING_SIGNS: Record<Lang, string[]> = {
  en: [
    'difficulty breathing',
    'unable to stand',
    'convulsion',
    'severe bleeding',
    'bloat',
    'high fever',
    'not drinking',
    'sudden death',
  ],
  hi: [
    'सांस लेने में तकलीफ',
    'खड़े नहीं हो पा रहे',
    'दौरा या ऐंठन',
    'गंभीर रक्तस्राव',
    'पेट फूलना',
    'तेज़ बुखार',
    'पानी नहीं पी रहे',
    'अचानक मृत्यु',
  ],
  mr: [
    'श्वास घेण्यास त्रास',
    'उभे राहू शकत नाही',
    'पेटके येणे',
    'तीव्र रक्तस्राव',
    'पोट फुगणे',
    'तीव्र ताप',
    'पाणी पीत नाही',
    'अचानक मृत्यू',
  ],
};

export function HealthScreen() {
  const route = useRoute<any>();
  const { online, refreshPending, syncNow } = useAuth();
  const { lang, t } = useLanguage();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalId, setAnimalId] = useState<string>(route.params?.animalId || '');
  const [summary, setSummary] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [appetite, setAppetite] = useState('');
  const [temperature, setTemperature] = useState('');
  const [warningSigns, setWarningSigns] = useState<string[]>(FALLBACK_WARNING_SIGNS[lang]);
  const [cases, setCases] = useState<HealthCase[]>([]);
  const [result, setResult] = useState<HealthReportResponse | null>(null);
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);

  useEffect(() => {
    if (route.params?.animalId) setAnimalId(route.params.animalId);
  }, [route.params?.animalId]);

  useEffect(() => {
    setWarningSigns(FALLBACK_WARNING_SIGNS[lang]);
    apiFetch<{ warning_signs: string[] }>(`/health/warning-signs?language=${lang}`)
      .then((response) => setWarningSigns(response.warning_signs))
      .catch(() => undefined);
  }, [lang]);

  const load = useCallback(async () => {
    const cachedAnimals = await loadAnimalCache();
    if (cachedAnimals.length) setAnimals(cachedAnimals);
    try {
      const data = await apiFetch<Page<Animal>>('/animals?page_size=100');
      setAnimals(data.items);
      if (!animalId && data.items.length) setAnimalId(data.items[0]?.id ?? '');
    } catch {
      if (!animalId && cachedAnimals.length) setAnimalId(cachedAnimals[0]?.id ?? '');
    }

    const cachedCases = await loadCaseCache();
    if (cachedCases.length) setCases(cachedCases);
    try {
      const data = await apiFetch<Page<HealthCase>>('/health/cases?page_size=15');
      setCases(data.items);
      await saveCaseCache(data.items);
      setCasesError(null);
    } catch (err) {
      setCasesError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [animalId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleSymptom = (symptom: string) => {
    setSymptoms((current) =>
      current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom],
    );
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    setQueued(false);
    if (!animalId) {
      setError(t('health.select_required'));
      return;
    }
    if (summary.trim().length < 3) {
      setError(t('health.summary_required'));
      return;
    }
    setBusy(true);
    const observation = {
      symptoms,
      appetite: appetite || undefined,
      temperature_c: temperature ? Number(temperature) : undefined,
      source: 'text',
    };
    try {
      const response = await apiFetch<HealthReportResponse>('/health/cases', {
        method: 'POST',
        body: {
          animal_id: animalId,
          symptom_summary: summary.trim(),
          language: lang,
          observation,
        },
        timeoutMs: 60000,
      });
      setResult(response);
      if (response.case) {
        const updated = [response.case, ...cases.filter((item) => item.id !== response.case?.id)];
        setCases(updated);
        await saveCaseCache(updated);
      }
      setSummary('');
      setSymptoms([]);
      setAppetite('');
      setTemperature('');
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOperation({
          entityType: 'health_observation',
          entityId: newId(),
          payload: {
            animal_id: animalId,
            symptom_summary: summary.trim(),
            language: lang,
            symptoms,
            appetite: appetite || undefined,
            temperature_c: temperature ? Number(temperature) : undefined,
            observed_at: new Date().toISOString(),
            source: 'mobile_offline',
          },
        });
        setQueued(true);
        setSummary('');
        setSymptoms([]);
        setAppetite('');
        setTemperature('');
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
      <PageTitle title={t('health.title')} subtitle={t('health.advisory')} />
      <DemoNote />
      {!online ? <GuardrailNote text={t('home.offline')} /> : null}

      <Card>
        <SectionTitle title={t('home.report')} action={<HeartPulse size={18} color={colors.leaf700} />} />

        <Field label={t('health.animal')}>
          {animals.length ? (
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
          ) : (
            <Text style={ui.mutedText}>{t('animals.empty')}</Text>
          )}
        </Field>

        <Field label={t('health.describe')} hint={t('health.advisory')}>
          <Input
            multiline
            numberOfLines={4}
            value={summary}
            onChangeText={setSummary}
            placeholder={t('health.describe_ph')}
            style={styles.textarea}
          />
        </Field>

        <Field label={t('health.signs')}>
          <View style={ui.selectRow}>
            {SYMPTOMS.map((symptom) => (
              <Chip
                key={symptom}
                label={t(`symptom.${symptom}`)}
                active={symptoms.includes(symptom)}
                onPress={() => toggleSymptom(symptom)}
              />
            ))}
          </View>
        </Field>

        <Field label={t('health.appetite')}>
          <View style={ui.selectRow}>
            <Chip label={t('health.not_recorded')} active={appetite === ''} onPress={() => setAppetite('')} />
            <Chip label={t('health.normal')} active={appetite === 'normal'} onPress={() => setAppetite('normal')} />
            <Chip label={t('health.reduced')} active={appetite === 'reduced'} onPress={() => setAppetite('reduced')} />
            <Chip label={t('health.none')} active={appetite === 'none'} onPress={() => setAppetite('none')} />
          </View>
        </Field>

        <Field label={t('health.temperature')}>
          <Input
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
            placeholder="39.5"
          />
        </Field>

        {error ? <ErrorNote message={error} /> : null}
        {queued ? <GuardrailNote text={t('health.queued')} /> : null}

        <Button title={t('health.submit')} onPress={submit} loading={busy} disabled={!animals.length} />
      </Card>

      {result ? (
        <Card>
          <SectionTitle
            title={t('health.result')}
            action={<Badge label={String(result.triage?.severity || 'unknown')} bg={severityColor(String(result.triage?.severity)).bg} fg={severityColor(String(result.triage?.severity)).fg} />}
          />
          {result.escalated ? (
            <Badge label={t('health.escalated')} bg={colors.dangerSoft} fg={colors.danger} />
          ) : null}
          <Text style={styles.response}>{result.response_text}</Text>
          {Array.isArray(result.triage?.reasons) && result.triage.reasons.length ? (
            <View style={styles.reasonList}>
              {(result.triage.reasons as string[]).map((reason) => (
                <Text key={reason} style={ui.mutedText}>
                  • {reason}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={ui.mutedText}>
            {t('health.agents')}: {result.agents_used.join(', ') || '—'}
          </Text>
          <Text style={ui.mutedText}>{t('health.advisory')}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title={t('health.warning_signs')} action={<AlertTriangle size={18} color={colors.danger} />} />
        <View style={ui.selectRow}>
          {warningSigns.map((sign) => (
            <Chip key={sign} label={sign} />
          ))}
        </View>
        <Text style={ui.mutedText}>{t('health.warning_note')}</Text>
      </Card>

      <SectionTitle title={t('health.recent')} />
      {loading ? <Loader label={t('common.loading')} /> : null}
      {casesError && !cases.length ? <ErrorNote message={casesError} onRetry={load} /> : null}
      {!loading && cases.length === 0 ? <EmptyState title={t('health.no_cases')} /> : null}
      {cases.slice(0, 6).map((item) => {
        const tone = severityColor(item.severity);
        return (
          <Card key={item.id} style={styles.caseCard}>
            <View style={styles.caseHeader}>
              <Text style={styles.caseCode}>{item.case_code}</Text>
              <Badge label={item.severity} bg={tone.bg} fg={tone.fg} />
              <Badge label={item.status} />
            </View>
            <Text style={ui.mutedText} numberOfLines={2}>
              {item.symptom_summary}
            </Text>
            <Text style={ui.mutedText}>
              {item.animal?.name || ''} · {new Date(item.opened_at).toLocaleDateString()}
            </Text>
            {item.vet_diagnosis ? (
              <View style={styles.vetBox}>
                <Text style={styles.vetLabel}>{t('health.result')}</Text>
                <Text style={styles.vetText}>{item.vet_diagnosis}</Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  response: { fontSize: 14, lineHeight: 22, color: colors.text },
  reasonList: { gap: 4 },
  caseCard: { gap: 8 },
  caseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  caseCode: { fontSize: 13, fontWeight: '800', color: colors.text },
  vetBox: { backgroundColor: colors.leaf50, borderRadius: 10, padding: 10, gap: 3 },
  vetLabel: { fontSize: 10, fontWeight: '800', color: colors.leaf800, textTransform: 'uppercase' },
  vetText: { fontSize: 12, color: colors.text, lineHeight: 18 },
});
