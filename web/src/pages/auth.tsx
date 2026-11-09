import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Bot,
  Globe2,
  HeartPulse,
  Leaf,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sprout,
  UserPlus,
} from 'lucide-react';
import { roleHome, useAuth } from '../lib/auth';
import { languageNames, useLanguage, type Lang } from '../lib/i18n';
import { Field, FormError, Select, SubmitButton, TextInput } from '../components/ui';

const demoAccounts = [
  { label: 'Ramesh — Farmer', email: 'ramesh@alg.demo', kind: '3 cows · 2 buffaloes · 5 goats · 10 chickens' },
  { label: 'Dr. Aarti — Veterinarian', email: 'dr.aarti@alg.demo', kind: 'Verified vet · Pune district' },
  { label: 'Pune Cooperative', email: 'coop.pune@alg.demo', kind: 'Linked farmer members' },
  { label: 'Administrator', email: 'admin@alg.demo', kind: 'Platform governance' },
];

function AuthHero() {
  const { t } = useLanguage();
  return (
    <div className="relative hidden overflow-hidden bg-leaf-800 lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-leaf-600/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-leaf-500/20 blur-3xl" />
      <div className="relative z-10 p-10">
        <div className="flex items-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <Leaf className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-tight">{t('app.name')}</p>
            <p className="text-xs text-leaf-100">{t('app.tagline')}</p>
          </div>
        </div>
        <h1 className="mt-14 max-w-lg font-display text-4xl font-bold leading-tight text-white">
          One connected workflow from the field to the veterinarian.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-leaf-100">
          Report symptoms in Marathi, Hindi or English. Eleven coordinated AI agents triage, retrieve records, check live
          weather, coordinate veterinary help and schedule follow-ups — with human approval enforced at every medical
          decision.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            { icon: HeartPulse, title: 'Health triage', text: 'Urgent signs trigger escalation, never a diagnosis.' },
            { icon: Sprout, title: 'Nutrition & environment', text: 'Verified guidance and live Open-Meteo weather.' },
            { icon: BadgeCheck, title: 'Vet coordination', text: 'Verified professionals confirm diagnosis and treatment.' },
            { icon: Bot, title: '11 specialised agents', text: 'LangGraph workflow with an explicit audit trail.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <item.icon className="h-5 w-5 text-leaf-200" />
              <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-leaf-100">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative z-10 border-t border-white/10 p-6 text-[11px] leading-relaxed text-leaf-100">
        AI cannot diagnose, prescribe medicine or replace veterinarians. Demonstration records are labelled as sample data.
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={roleHome[user.role]} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await login(email.trim(), password);
      navigate(roleHome[next.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quickFill = (account: string) => {
    setEmail(account);
    setPassword('Demo@1234');
    setError(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <AuthHero />
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf-700 text-white">
                <Leaf className="h-5 w-5" />
              </span>
              <span className="font-display text-base font-bold text-slate-900">{t('app.name')}</span>
            </div>
            <select
              aria-label={t('common.language')}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
              value={lang}
              onChange={(event) => setLang(event.target.value as Lang)}
            >
              {(Object.keys(languageNames) as Lang[]).map((code) => (
                <option key={code} value={code}>
                  {languageNames[code]}
                </option>
              ))}
            </select>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">{t('auth.login')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Access your role-specific portal. Sessions are secured with a signed JWT.
          </p>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            <Field label={t('auth.email')}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <TextInput
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ramesh@alg.demo"
                  className="pl-9"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>
            <Field label={t('auth.password')}>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <TextInput
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Demo@1234"
                  className="pl-9"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </Field>
            <FormError message={error} />
            <SubmitButton type="submit" loading={busy} className="w-full">
              {t('auth.login')}
            </SubmitButton>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> {t('auth.demo_accounts')}
            </p>
            <div className="mt-3 grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => quickFill(account.email)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-left transition-colors hover:border-leaf-200 hover:bg-leaf-50"
                >
                  <span>
                    <span className="block text-xs font-semibold text-slate-800">{account.label}</span>
                    <span className="block text-[11px] text-slate-500">{account.kind}</span>
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-leaf-700">Use</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              All demo accounts use password <code className="rounded bg-slate-100 px-1">Demo@1234</code>. Data is clearly
              labelled sample data.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="inline-flex items-center gap-1 font-semibold text-leaf-700 hover:underline">
              <UserPlus className="h-4 w-4" /> {t('auth.register')}
            </Link>
          </p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Globe2 className="h-3.5 w-3.5" /> English · हिन्दी · मराठी
          </p>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'farmer' as 'farmer' | 'veterinarian',
    language: 'en',
    village: '',
    district: '',
    state: 'Maharashtra',
    farm_name: '',
    registration_no: '',
    qualification: '',
    clinic_name: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={roleHome[user.role]} replace />;

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        phone: form.phone || undefined,
        village: form.village || undefined,
        district: form.district || undefined,
        farm_name: form.role === 'farmer' ? form.farm_name || undefined : undefined,
        registration_no: form.role === 'veterinarian' ? form.registration_no || undefined : undefined,
        qualification: form.role === 'veterinarian' ? form.qualification || undefined : undefined,
        clinic_name: form.role === 'veterinarian' ? form.clinic_name || undefined : undefined,
      };
      const next = await register(payload);
      navigate(roleHome[next.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <AuthHero />
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-slate-900">{t('auth.register')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Farmers receive a farm automatically. Veterinarians are created unverified until an administrator reviews
            their registration number.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <Field label={t('auth.role')}>
              <Select value={form.role} onChange={set('role')}>
                <option value="farmer">{t('auth.farmer')}</option>
                <option value="veterinarian">{t('auth.veterinarian')}</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('auth.full_name')}>
                <TextInput required minLength={2} value={form.full_name} onChange={set('full_name')} />
              </Field>
              <Field label={t('auth.phone')}>
                <TextInput value={form.phone} onChange={set('phone')} placeholder="Optional" />
              </Field>
            </div>
            <Field label={t('auth.email')}>
              <TextInput type="email" required value={form.email} onChange={set('email')} />
            </Field>
            <Field label={t('auth.password')} hint="Minimum 8 characters.">
              <TextInput type="password" required minLength={8} value={form.password} onChange={set('password')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.language')}>
                <Select value={form.language} onChange={set('language')}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="mr">मराठी</option>
                </Select>
              </Field>
              <Field label={t('auth.village')}>
                <TextInput value={form.village} onChange={set('village')} />
              </Field>
              <Field label={t('auth.district')}>
                <TextInput value={form.district} onChange={set('district')} />
              </Field>
              <Field label={t('auth.state')}>
                <TextInput value={form.state} onChange={set('state')} />
              </Field>
            </div>
            {form.role === 'farmer' ? (
              <Field label={t('auth.farm_name')}>
                <TextInput value={form.farm_name} onChange={set('farm_name')} placeholder="Optional" />
              </Field>
            ) : (
              <>
                <Field label="Veterinary registration number" hint="Required. Reviewed by an administrator before verification.">
                  <TextInput required value={form.registration_no} onChange={set('registration_no')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Qualification">
                    <TextInput value={form.qualification} onChange={set('qualification')} placeholder="B.V.Sc. & A.H." />
                  </Field>
                  <Field label="Clinic">
                    <TextInput value={form.clinic_name} onChange={set('clinic_name')} placeholder="Optional" />
                  </Field>
                </div>
              </>
            )}
            <FormError message={error} />
            <SubmitButton type="submit" loading={busy} className="w-full">
              {t('auth.register')}
            </SubmitButton>
          </form>
          <p className="mt-5 text-center text-sm text-slate-600">
            {t('auth.have_account')}{' '}
            <Link to="/login" className="font-semibold text-leaf-700 hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
