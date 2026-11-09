import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, WifiOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme';

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
}) {
  const content = <View style={[styles.screenInner, padded && styles.padded]}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.leaf700} />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function PageTitle({ title, subtitle, back }: { title: string; subtitle?: string; back?: boolean }) {
  const navigation = useNavigation();
  return (
    <View style={styles.pageTitle}>
      {back && (
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={12}>
          <ArrowLeft color={colors.leaf700} size={20} />
        </Pressable>
      )}
      <Text style={styles.pageTitleText}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  compact,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  compact?: boolean;
}) {
  const style =
    variant === 'primary'
      ? styles.buttonPrimary
      : variant === 'danger'
        ? styles.buttonDanger
        : variant === 'secondary'
          ? styles.buttonSecondary
          : styles.buttonGhost;
  const textStyle =
    variant === 'primary' || variant === 'danger' ? styles.buttonTextLight : styles.buttonTextDark;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        style,
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.leaf700} />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor="#94a3b8" style={[styles.input, props.style]} {...props} />;
}

export function SelectRow({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.selectRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.selectChip, active && styles.selectChipActive]}
          >
            <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, bg, fg }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? colors.leaf50 }]}>
      <Text style={[styles.badgeText, { color: fg ?? colors.leaf700 }]}>{label}</Text>
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.leaf700} />
      {label ? <Text style={styles.mutedText}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.mutedText}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorNote}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry}>
          <Text style={styles.errorRetry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DemoNote() {
  const { t } = useLanguage();
  return (
    <View style={styles.demoNote}>
      <Text style={styles.demoNoteText}>{t('home.sample_banner')}</Text>
    </View>
  );
}

export function OfflineBanner() {
  const { online } = useAuth();
  const { t } = useLanguage();
  if (online) return null;
  return (
    <View style={styles.offlineBanner}>
      <WifiOff color={colors.warning} size={16} />
      <Text style={styles.offlineText}>{t('home.offline')}</Text>
    </View>
  );
}

export function GuardrailNote({ text }: { text: string }) {
  return (
    <View style={styles.guardrail}>
      <Text style={styles.guardrailText}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 32 },
  screenInner: { gap: 16 },
  padded: { paddingHorizontal: 16, paddingTop: 12 },
  pageTitle: { gap: 4, marginBottom: 4 },
  pageTitleText: { fontSize: 24, fontWeight: '800', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  button: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: 12 },
  buttonPrimary: { backgroundColor: colors.leaf700 },
  buttonSecondary: { backgroundColor: colors.leaf50, borderWidth: 1, borderColor: colors.leaf200 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 14, fontWeight: '700' },
  buttonTextLight: { color: '#ffffff' },
  buttonTextDark: { color: colors.leaf800 },
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  hint: { fontSize: 11, color: colors.muted, lineHeight: 16 },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  selectChipActive: { borderColor: colors.leaf600, backgroundColor: colors.leaf600 },
  selectChipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  selectChipTextActive: { color: '#ffffff' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: colors.leaf600, borderColor: colors.leaf600 },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  chipTextActive: { color: '#ffffff' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  statTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statHint: { fontSize: 11, color: colors.muted },
  loader: { paddingVertical: 28, alignItems: 'center', gap: 10 },
  mutedText: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  empty: {
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  errorNote: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  errorRetry: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  demoNote: {
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 12,
  },
  demoNoteText: { color: colors.warning, fontSize: 11, lineHeight: 17 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
  },
  offlineText: { flex: 1, fontSize: 11, color: colors.warning, lineHeight: 16 },
  guardrail: {
    backgroundColor: colors.infoSoft,
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  guardrailText: { fontSize: 11, lineHeight: 17, color: colors.info },
});
