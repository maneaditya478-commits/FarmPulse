import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarClock,
  Camera,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  HeartPulse,
  ImagePlus,
  Leaf,
  MapPin,
  Milk,
  PawPrint,
  QrCode,
  Search,
  Stethoscope,
  Syringe,
  Thermometer,
  TriangleAlert,
  Wheat,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiError, fdate, fdatetime, mediaUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/i18n';
import type {
  AnalyticsOverview,
  AnalyticsTrends,
  Animal,
  Breed,
  HealthCase,
  HealthReportResponse,
  Observation,
  Page,
  ScheduleItem,
  Species,
  Vaccination,
} from '../lib/types';
import {
  Badge,
  DemoBadge,
  EmptyState,
  ErrorAlert,
  Field,
  FormError,
  KeyValue,
  Modal,
  PageHeader,
  SampleBanner,
  Select,
  SeverityBadge,
  Spinner,
  StatCard,
  SubmitButton,
  Tabs,
  TextInput,
  useFetch,
} from '../components/ui';

const chartColors = ['#276223', '#66b75e', '#9ad494', '#d9a441', '#8b5e3c', '#7c9eb2', '#b35c5c', '#7c6b9e'];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AnimalAvatar({ animal, size = 'h-11 w-11' }: { animal: Animal; size?: string }) {
  const photo = mediaUrl(animal.photo_url);
  if (photo) {
    return <img src={photo} alt={animal.name} className={`${size} shrink-0 rounded-xl object-cover`} />;
  }
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-xl bg-leaf-100 text-sm font-bold text-leaf-800`}>
      {initials(animal.name) || <PawPrint className="h-5 w-5" />}
    </span>
  );
}

function animalAge(animal: Animal): string {
  if (animal.age_months != null) {
    if (animal.age_months < 24) return `${animal.age_months} mo`;
    return `${Math.floor(animal.age_months / 12)} yr`;
  }
  if (animal.birth_date) {
    const months = Math.max(
      0,
      Math.floor((Date.now() - new Date(animal.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
    );
    return months < 24 ? `${months} mo` : `${Math.floor(months / 12)} yr`;
  }
  return 'Age unknown';
}

export function AnimalRow({ animal, to }: { animal: Animal; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 transition-colors hover:border-leaf-200 hover:bg-leaf-50/50"
    >
      <AnimalAvatar animal={animal} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
          {animal.name}
          {animal.is_sample && <DemoBadge />}
        </p>
        <p className="text-xs text-slate-500">
          {animal.tag_code} · {animal.species?.name_en} {animal.breed ? `· ${animal.breed.name}` : ''} · {animalAge(animal)}
        </p>
      </div>
      <Badge value={animal.status} />
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

export function FarmerDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const overview = useFetch<AnalyticsOverview>('/analytics/overview');
  const trends = useFetch<AnalyticsTrends>('/analytics/trends?days=30');
  const cases = useFetch<Page<HealthCase>>('/health/cases?page_size=5');
  const schedule = useFetch<ScheduleItem[]>('/vaccinations/schedule?within_days=30');
  const animals = useFetch<Page<Animal>>('/animals?page_size=6');

  const data = overview.data;
  const firstName = user?.full_name.split(' ')[0] || 'Farmer';

  return (
    <div>
      <PageHeader
        title={`Namaste, ${firstName}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {user?.village || 'Village'}, {user?.district || 'District'}
            </span>
            <span>·</span>
            <span>Role-scoped live data from your farms</span>
          </span>
        }
        actions={
          <>
            <Link to="/farmer/health" className="btn-primary">
              <HeartPulse className="h-4 w-4" /> {t('health.report')}
            </Link>
            <Link to="/farmer/assistant" className="btn-secondary">
              <Bot className="h-4 w-4" /> {t('nav.assistant')}
            </Link>
          </>
        }
      />
      <SampleBanner />
      {overview.error && <ErrorAlert message={overview.error} onRetry={overview.reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.animals')}
          value={overview.loading ? '—' : data?.total_animals ?? 0}
          hint="Active animals across your farms"
          icon={<PawPrint className="h-5 w-5" />}
        />
        <StatCard
          label={t('dashboard.active_cases')}
          value={overview.loading ? '—' : data?.active_health_cases ?? 0}
          hint={`${data?.critical_cases ?? 0} high priority`}
          tone={data?.critical_cases ? 'red' : 'leaf'}
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <StatCard
          label={t('dashboard.upcoming_vaccinations')}
          value={overview.loading ? '—' : data?.upcoming_vaccinations ?? 0}
          hint={`${data?.overdue_vaccinations ?? 0} overdue`}
          tone={data?.overdue_vaccinations ? 'amber' : 'sky'}
          icon={<Syringe className="h-5 w-5" />}
        />
        <StatCard
          label={t('dashboard.milk_30d')}
          value={overview.loading ? '—' : `${data?.milk_litres_30d ?? 0} L`}
          hint={`${data?.egg_count_30d ?? 0} eggs · ${data?.upcoming_appointments ?? 0} appointments`}
          icon={<Milk className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.production_trend')}</h2>
              <p className="text-xs text-slate-500">Milk production and recorded health cases over 30 days</p>
            </div>
            <Link to="/farmer/finance" className="text-xs font-semibold text-leaf-700 hover:underline">
              Finance detail
            </Link>
          </div>
          {trends.loading ? (
            <Spinner />
          ) : trends.error ? (
            <ErrorAlert message={trends.error} onRetry={trends.reload} />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.data?.milk || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="milkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#429a3a" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#429a3a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="L" />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="litres" name="Milk (L)" stroke="#276223" strokeWidth={2} fill="url(#milkFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="h-40">
              <p className="mb-1 text-xs font-semibold text-slate-500">Egg collection</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.data?.eggs || []} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" name="Eggs" fill="#d9a441" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-40">
              <p className="mb-1 text-xs font-semibold text-slate-500">Species distribution</p>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.species_distribution || []}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={28}
                    outerRadius={52}
                    paddingAngle={2}
                  >
                    {(data?.species_distribution || []).map((entry, index) => (
                      <Cell key={entry.code} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">{t('dashboard.alerts')}</h2>
            <p className="text-xs text-slate-500">Generated from vaccination, health and environment rules</p>
            <div className="mt-3 space-y-2">
              {overview.loading && <Spinner />}
              {!overview.loading && (data?.alerts || []).length === 0 && (
                <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">No active alerts. Keep recording observations.</p>
              )}
              {(data?.alerts || []).map((alert, index) => (
                <div
                  key={`${alert.type}-${index}`}
                  className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                    alert.severity === 'critical' || alert.severity === 'high'
                      ? 'bg-red-50 text-red-800'
                      : alert.severity === 'medium'
                        ? 'bg-amber-50 text-amber-900'
                        : 'bg-sky-50 text-sky-800'
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold capitalize">{alert.type}:</span> {alert.message}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Upcoming vaccinations</h2>
              <Link to="/farmer/vaccinations" className="text-xs font-semibold text-leaf-700 hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {schedule.loading && <Spinner />}
              {!schedule.loading && (schedule.data || []).length === 0 && (
                <p className="text-sm text-slate-500">No vaccinations due in the next 30 days.</p>
              )}
              {(schedule.data || []).slice(0, 5).map((item) => (
                <div key={`${item.animal_id}-${item.vaccine_id}`} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">{item.vaccine_name}</p>
                    <p className="text-xs text-slate-500">
                      {item.animal_name} · {item.disease}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge value={item.status} />
                    <p className="mt-1 text-[11px] text-slate-500">{fdate(item.due_on)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">{t('dashboard.recent_cases')}</h2>
            <Link to="/farmer/health" className="text-xs font-semibold text-leaf-700 hover:underline">
              Open health centre
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {cases.loading && <Spinner />}
            {!cases.loading && (cases.data?.items || []).length === 0 && (
              <EmptyState title="No health cases yet" note="Report symptoms and the multi-agent workflow will triage them." />
            )}
            {(cases.data?.items || []).map((item) => (
              <Link
                key={item.id}
                to={`/farmer/health/${item.id}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:border-leaf-200 hover:bg-leaf-50/40"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {item.case_code}
                    <SeverityBadge value={item.severity} />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.symptom_summary}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.animal?.name || 'Animal'} · {fdatetime(item.opened_at)}
                  </p>
                </div>
                <Badge value={item.status} />
              </Link>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Your animals</h2>
            <Link to="/farmer/animals" className="text-xs font-semibold text-leaf-700 hover:underline">
              All animals
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {animals.loading && <Spinner />}
            {!animals.loading && (animals.data?.items || []).length === 0 && (
              <EmptyState title="No animals registered" note="Register your first animal to start tracking health and production." />
            )}
            {(animals.data?.items || []).map((animal) => (
              <AnimalRow key={animal.id} animal={animal} to={`/farmer/animals/${animal.id}`} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RegisterAnimalModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const species = useFetch<Species[]>(open ? '/animals/species' : null);
  const [speciesId, setSpeciesId] = useState('');
  const breeds = useFetch<Breed[]>(speciesId ? `/animals/breeds?species_id=${speciesId}` : null, [speciesId]);
  const [form, setForm] = useState({
    name: '',
    tag_code: '',
    sex: 'female',
    birth_date: '',
    weight_kg: '',
    color: '',
    breed_id: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!speciesId) {
      setError('Select a species first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/animals', {
        species_id: speciesId,
        breed_id: form.breed_id || undefined,
        name: form.name,
        tag_code: form.tag_code || undefined,
        sex: form.sex,
        birth_date: form.birth_date || undefined,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
        color: form.color || undefined,
        notes: form.notes || undefined,
      });
      setForm({ name: '', tag_code: '', sex: 'female', birth_date: '', weight_kg: '', color: '', breed_id: '', notes: '' });
      onCreated();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Register a new animal">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Species">
            <Select required value={speciesId} onChange={(event) => { setSpeciesId(event.target.value); setForm((prev) => ({ ...prev, breed_id: '' })); }}>
              <option value="">Select species</option>
              {(species.data || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.icon} {item.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Breed">
            <Select value={form.breed_id} onChange={set('breed_id')} disabled={!speciesId}>
              <option value="">Not recorded</option>
              {(breeds.data || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <TextInput required value={form.name} onChange={set('name')} placeholder="e.g. Gauri" />
          </Field>
          <Field label="Tag code" hint="Leave blank to generate a species-based tag.">
            <TextInput value={form.tag_code} onChange={set('tag_code')} placeholder="Auto-generated" />
          </Field>
          <Field label="Sex">
            <Select value={form.sex} onChange={set('sex')}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
          </Field>
          <Field label="Birth date">
            <TextInput type="date" value={form.birth_date} onChange={set('birth_date')} />
          </Field>
          <Field label="Weight (kg)">
            <TextInput type="number" min="0.1" step="0.1" value={form.weight_kg} onChange={set('weight_kg')} />
          </Field>
          <Field label="Colour">
            <TextInput value={form.color} onChange={set('color')} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={form.notes} onChange={set('notes')} placeholder="Optional husbandry notes" />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton type="submit" loading={busy}>
            <CirclePlus className="h-4 w-4" /> Register animal
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function FarmerAnimals() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const species = useFetch<Species[]>('/animals/species');
  const animals = useFetch<Page<Animal>>(`/animals?page_size=100${query}${speciesId ? `&species_id=${speciesId}` : ''}`, [query, speciesId]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '');
  };

  return (
    <div>
      <PageHeader
        title={t('nav.animals')}
        subtitle="Every animal has a unique tag, QR identifier, health timeline and vaccination schedule."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <CirclePlus className="h-4 w-4" /> Register animal
          </button>
        }
      />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" onSubmit={applySearch}>
        <Field label="Search" className="min-w-52 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or tag code" />
          </div>
        </Field>
        <Field label="Species" className="min-w-44">
          <Select value={speciesId} onChange={(event) => setSpeciesId(event.target.value)}>
            <option value="">All species</option>
            {(species.data || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name_en}
              </option>
            ))}
          </Select>
        </Field>
        <button className="btn-secondary" type="submit">
          Apply filters
        </button>
      </form>

      {animals.error && <ErrorAlert message={animals.error} onRetry={animals.reload} />}
      {animals.loading ? (
        <Spinner />
      ) : (animals.data?.items || []).length === 0 ? (
        <EmptyState
          title="No animals found"
          note="Register your cows, buffaloes, goats, sheep, poultry, dogs, cats or horses to start monitoring them."
          action={
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <CirclePlus className="h-4 w-4" /> Register animal
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(animals.data?.items || []).map((animal) => (
            <Link key={animal.id} to={`/farmer/animals/${animal.id}`} className="card group p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3">
                <AnimalAvatar animal={animal} size="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {animal.name} {animal.is_sample && <DemoBadge />}
                  </p>
                  <p className="text-xs text-slate-500">{animal.tag_code}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {animal.species?.name_en}
                    {animal.breed ? ` · ${animal.breed.name}` : ''}
                  </p>
                </div>
                <Badge value={animal.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-800">{animalAge(animal)}</p>
                  <p className="text-slate-500">Age</p>
                </div>
                <div>
                  <p className="font-bold text-slate-800">{animal.weight_kg ? `${animal.weight_kg} kg` : '—'}</p>
                  <p className="text-slate-500">Weight</p>
                </div>
                <div>
                  <p className="font-bold text-slate-800 uppercase">{animal.sex}</p>
                  <p className="text-slate-500">Sex</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <RegisterAnimalModal open={open} onClose={() => setOpen(false)} onCreated={animals.reload} />
    </div>
  );
}

interface Timeline {
  animal: Animal;
  health_cases: { id: string; case_code: string; severity: string; status: string; symptom_summary: string; opened_at: string; diagnosis_confirmed: boolean }[];
  vaccinations: { id: string; vaccine: string; disease: string; administered_on?: string | null; due_on: string; status: string; source_reference: string }[];
  feed_records: { recorded_at: string; feed_type: string; quantity_kg: number }[];
  water_records: { recorded_at: string; litres?: number | null; source?: string | null }[];
  milk_records: { record_date: string; litres: number; session: string }[];
  breeding_records: { event_type?: string; event_date?: string; notes?: string | null }[];
}

export function AnimalDetailPage() {
  const { animalId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState<'overview' | 'health' | 'vaccinations' | 'nutrition' | 'breeding'>('overview');
  const animal = useFetch<Animal>(animalId ? `/animals/${animalId}` : null, [animalId]);
  const timeline = useFetch<Timeline>(animalId ? `/animals/${animalId}/timeline` : null, [animalId]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  const base = location.pathname.startsWith('/vet')
    ? '/vet'
    : location.pathname.startsWith('/coop')
      ? '/coop'
      : location.pathname.startsWith('/admin')
        ? '/admin'
        : '/farmer';
  const caseBase = base === '/vet' ? '/vet/cases' : base === '/coop' ? '/coop/health' : '/farmer/health';

  const upload = async (file: File) => {
    if (!animalId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post(`/animals/${animalId}/photo`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      animal.reload();
      timeline.reload();
    } catch (error) {
      setUploadError(apiError(error));
    } finally {
      setUploading(false);
    }
  };

  const issueQr = async () => {
    if (!animalId) return;
    setQrBusy(true);
    try {
      await api.post(`/animals/${animalId}/qr`);
      animal.reload();
    } catch (error) {
      setUploadError(apiError(error));
    } finally {
      setQrBusy(false);
    }
  };

  if (animal.loading) return <Spinner />;
  if (animal.error) return <ErrorAlert message={animal.error} onRetry={animal.reload} />;
  if (!animal.data) return <EmptyState title="Animal not found" />;

  const item = animal.data;
  const qrIdentifier = item.identifiers?.find((identifier) => identifier.identifier_type === 'qr' && identifier.is_active);
  const photo = mediaUrl(item.photo_url);

  return (
    <div>
      <Link to={`${base}/animals`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to animals
      </Link>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="flex items-start gap-4">
            {photo ? (
              <img src={photo} alt={item.name} className="h-20 w-20 rounded-2xl object-cover" />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-2xl bg-leaf-100 font-display text-xl font-bold text-leaf-800">
                {initials(item.name)}
              </span>
            )}
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-900">
                {item.name}
                <Badge value={item.status} />
                {item.is_sample && <DemoBadge />}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {item.tag_code} · {item.species?.name_en}
                {item.breed ? ` · ${item.breed.name}` : ''} · {animalAge(item)}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <QrCode className="h-3.5 w-3.5" /> {qrIdentifier?.identifier_value || 'No QR issued yet'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary cursor-pointer">
              <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                  event.target.value = '';
                }}
              />
            </label>
            {!qrIdentifier && (
              <button className="btn-secondary" onClick={issueQr} disabled={qrBusy}>
                <QrCode className="h-4 w-4" /> {qrBusy ? 'Issuing…' : 'Issue QR'}
              </button>
            )}
            {user?.role === 'farmer' && (
              <Link to={`/farmer/health?animal=${item.id}`} className="btn-primary">
                <HeartPulse className="h-4 w-4" /> Report symptoms
              </Link>
            )}
          </div>
        </div>
        {uploadError && <div className="px-5 pt-4"><FormError message={uploadError} /></div>}
        {qrIdentifier?.qr_payload && (
          <div className="mx-5 mt-4 rounded-xl bg-slate-900 px-4 py-3 font-mono text-xs text-leaf-200">
            QR payload: {qrIdentifier.qr_payload}
          </div>
        )}

        <div className="p-5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'health', label: `Health (${timeline.data?.health_cases.length ?? 0})` },
              { key: 'vaccinations', label: `Vaccinations (${timeline.data?.vaccinations.length ?? 0})` },
              { key: 'nutrition', label: 'Nutrition & milk' },
              { key: 'breeding', label: 'Breeding' },
            ]}
          />
          {timeline.loading ? (
            <Spinner />
          ) : timeline.error ? (
            <ErrorAlert message={timeline.error} onRetry={timeline.reload} />
          ) : (
            <>
              {tab === 'overview' && (
                <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                  <KeyValue label="Species">{item.species?.name_en}</KeyValue>
                  <KeyValue label="Breed">{item.breed?.name}</KeyValue>
                  <KeyValue label="Sex">{item.sex}</KeyValue>
                  <KeyValue label="Birth date">{fdate(item.birth_date)}</KeyValue>
                  <KeyValue label="Age">{animalAge(item)}</KeyValue>
                  <KeyValue label="Weight">{item.weight_kg ? `${item.weight_kg} kg` : '—'}</KeyValue>
                  <KeyValue label="Colour">{item.color}</KeyValue>
                  <KeyValue label="Registered">{fdate(item.created_at)}</KeyValue>
                  <KeyValue label="Identifiers">
                    {item.identifiers?.map((identifier) => (
                      <span key={identifier.id} className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                        {identifier.identifier_value}
                      </span>
                    ))}
                  </KeyValue>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <KeyValue label="Notes">{item.notes || 'No notes recorded.'}</KeyValue>
                  </div>
                </div>
              )}

              {tab === 'health' && (
                <div className="space-y-2">
                  {(timeline.data?.health_cases || []).length === 0 && <EmptyState title="No health cases recorded" />}
                  {(timeline.data?.health_cases || []).map((record) => (
                    <Link
                      key={record.id}
                      to={`${caseBase}/${record.id}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 hover:border-leaf-200 hover:bg-leaf-50/40"
                    >
                      <div>
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                          {record.case_code} <SeverityBadge value={record.severity} />
                          {record.diagnosis_confirmed && <Badge value="approved" />}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">{record.symptom_summary}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{fdatetime(record.opened_at)}</p>
                      </div>
                      <Badge value={record.status} />
                    </Link>
                  ))}
                </div>
              )}

              {tab === 'vaccinations' && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="table-th">Vaccine</th>
                        <th className="table-th">Disease</th>
                        <th className="table-th">Given</th>
                        <th className="table-th">Due</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Verified reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(timeline.data?.vaccinations || []).map((record) => (
                        <tr key={record.id}>
                          <td className="table-td font-medium">{record.vaccine}</td>
                          <td className="table-td">{record.disease}</td>
                          <td className="table-td">{fdate(record.administered_on)}</td>
                          <td className="table-td">{fdate(record.due_on)}</td>
                          <td className="table-td"><Badge value={record.status} /></td>
                          <td className="table-td max-w-xs text-xs text-slate-500">{record.source_reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(timeline.data?.vaccinations || []).length === 0 && <EmptyState title="No vaccination schedule yet" />}
                </div>
              )}

              {tab === 'nutrition' && (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Wheat className="h-4 w-4" /> Recent feed
                    </h3>
                    <div className="space-y-2">
                      {(timeline.data?.feed_records || []).length === 0 && <p className="text-sm text-slate-500">No feed records.</p>}
                      {(timeline.data?.feed_records || []).map((record, index) => (
                        <div key={index} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <span>{record.feed_type}</span>
                          <span className="text-slate-500">
                            {record.quantity_kg} kg · {fdate(record.recorded_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Milk className="h-4 w-4" /> Recent milk
                    </h3>
                    <div className="space-y-2">
                      {(timeline.data?.milk_records || []).length === 0 && <p className="text-sm text-slate-500">No milk records.</p>}
                      {(timeline.data?.milk_records || []).slice(0, 8).map((record, index) => (
                        <div key={index} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <span className="capitalize">{record.session}</span>
                          <span className="text-slate-500">
                            {record.litres} L · {fdate(record.record_date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <h3 className="mb-2 mt-5 text-sm font-bold text-slate-800">Water observations</h3>
                    {(timeline.data?.water_records || []).length === 0 && <p className="text-sm text-slate-500">No water records.</p>}
                    {(timeline.data?.water_records || []).map((record, index) => (
                      <div key={index} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                        <span>{record.source || 'Water'}</span>
                        <span className="text-slate-500">
                          {record.litres ?? '—'} L · {fdate(record.recorded_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'breeding' && (
                <div className="space-y-2">
                  {(timeline.data?.breeding_records || []).length === 0 && (
                    <EmptyState title="No breeding records" note="Breeding events recorded by the farmer or field agent appear here." />
                  )}
                  {(timeline.data?.breeding_records || []).map((record, index) => (
                    <div key={index} className="rounded-xl border border-slate-100 px-4 py-3 text-sm">
                      <p className="font-semibold capitalize text-slate-800">{record.event_type || 'Breeding event'}</p>
                      <p className="text-xs text-slate-500">{fdate(record.event_date)}</p>
                      {record.notes && <p className="mt-1 text-xs text-slate-600">{record.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const symptomOptions = [
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

export function FarmerHealth() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [params] = useSearchParams();
  const [animalId, setAnimalId] = useState(params.get('animal') || '');
  const [summary, setSummary] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [appetite, setAppetite] = useState('');
  const [temperature, setTemperature] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [result, setResult] = useState<HealthReportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animals = useFetch<Page<Animal>>('/animals?page_size=100');
  const warnings = useFetch<{ warning_signs: string[]; note: string }>(
    `/health/warning-signs?language=${lang}`,
    [lang],
  );
  const cases = useFetch<Page<HealthCase>>(`/health/cases?page_size=25${statusFilter ? `&status=${statusFilter}` : ''}`, [statusFilter]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!animalId) {
      setError('Select the animal you are reporting on.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<HealthReportResponse>('/health/cases', {
        animal_id: animalId,
        symptom_summary: summary,
        language: lang,
        observation: {
          symptoms: selectedSymptoms,
          appetite: appetite || undefined,
          temperature_c: temperature ? Number(temperature) : undefined,
          source: 'text',
        },
      });
      setResult(data);
      setSummary('');
      setSelectedSymptoms([]);
      setAppetite('');
      setTemperature('');
      cases.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleSymptom = (symptom: string) =>
    setSelectedSymptoms((current) =>
      current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom],
    );

  return (
    <div>
      <PageHeader title={t('nav.health')} subtitle={t('health.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <HeartPulse className="h-5 w-5 text-leaf-700" /> {t('health.report')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t('health.advisory_note')}</p>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <Field label={t('health.animal')}>
              <Select value={animalId} onChange={(event) => setAnimalId(event.target.value)} required>
                <option value="">{t('health.select_animal')}</option>
                {(animals.data?.items || []).map((animal) => (
                  <option key={animal.id} value={animal.id}>
                    {animal.name} ({animal.tag_code}) — {animal.species?.name_en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('health.description')} hint={t('health.hint')}>
              <textarea
                required
                minLength={3}
                className="input min-h-28"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder={t('health.placeholder')}
              />
            </Field>
            <div>
              <p className="label">{t('health.signs')}</p>
              <div className="flex flex-wrap gap-2">
                {symptomOptions.map((symptom) => (
                  <button
                    type="button"
                    key={symptom}
                    onClick={() => toggleSymptom(symptom)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      selectedSymptoms.includes(symptom)
                        ? 'border-leaf-600 bg-leaf-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-leaf-300'
                    }`}
                  >
                    {t(`health.symptom.${symptom}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('health.appetite')}>
                <Select value={appetite} onChange={(event) => setAppetite(event.target.value)}>
                  <option value="">{t('health.not_recorded')}</option>
                  <option value="normal">{t('health.normal')}</option>
                  <option value="reduced">{t('health.reduced')}</option>
                  <option value="none">{t('health.not_eating')}</option>
                </Select>
              </Field>
              <Field label={t('health.temperature')}>
                <div className="relative">
                  <Thermometer className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <TextInput
                    type="number"
                    min="30"
                    max="45"
                    step="0.1"
                    className="pl-9"
                    value={temperature}
                    onChange={(event) => setTemperature(event.target.value)}
                    placeholder={t('health.temperature_ph')}
                  />
                </div>
              </Field>
            </div>
            <FormError message={error} />
            <SubmitButton type="submit" loading={busy} className="w-full">
              <Stethoscope className="h-4 w-4" /> {t('health.submit')}
            </SubmitButton>
          </form>

          {result && (
            <div className="mt-5 rounded-2xl border border-leaf-200 bg-leaf-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {t('health.triage_result')} <SeverityBadge value={String(result.triage?.severity || '')} />
                  {result.escalated && <Badge value="critical" />}
                </p>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  {result.agents_used?.length || 0} {t('health.agents')} · {result.interaction_id.slice(0, 8)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{result.response_text}</p>
              {Array.isArray(result.triage?.reasons) && result.triage.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                  {(result.triage.reasons as string[]).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              {Array.isArray(result.triage?.advice) && result.triage.advice.length > 0 && (
                <div className="mt-3 rounded-xl bg-white/70 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('health.advisory')}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-700">
                    {(result.triage.advice as string[]).map((advice) => (
                      <li key={advice}>{advice}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {result.case && (
                  <Link to={`/farmer/health/${result.case.id}`} className="btn-primary !py-2">
                    {t('health.open_case')} {result.case.case_code}
                  </Link>
                )}
                {result.appointment_id && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-leaf-800">
                    <CalendarClock className="h-4 w-4" /> Veterinary appointment requested
                  </span>
                )}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Agents used: {result.agents_used?.join(', ') || '—'}. {t('health.agents_note')}
              </p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <TriangleAlert className="h-5 w-5 text-red-600" /> {t('health.warning_signs')}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{warnings.data?.note || t('health.contact_vet')}</p>
            {warnings.loading && <Spinner />}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(warnings.data?.warning_signs || []).map((sign) => (
                <span key={sign} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
                  {sign}
                </span>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <ClipboardList className="h-5 w-5 text-leaf-700" /> {t('health.case_history')}
              </h2>
              <Select className="!w-auto !py-1.5 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                <option value="reported">Reported</option>
                <option value="triaged">Triaged</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
            <div className="mt-3 space-y-2">
              {cases.loading && <Spinner />}
              {cases.error && <ErrorAlert message={cases.error} onRetry={cases.reload} />}
              {!cases.loading && (cases.data?.items || []).length === 0 && (
                <EmptyState title="No cases in this view" note={user?.role === 'farmer' ? 'Submit a symptom report to open one.' : 'Cases appear here.'} />
              )}
              {(cases.data?.items || []).map((item) => (
                <Link
                  key={item.id}
                  to={`/farmer/health/${item.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:border-leaf-200 hover:bg-leaf-50/40"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                      {item.case_code} <SeverityBadge value={item.severity} />
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.symptom_summary}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {item.animal?.name} · {fdatetime(item.opened_at)}
                    </p>
                  </div>
                  <Badge value={item.status} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function HealthCaseDetailPage() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [form, setForm] = useState({ vet_diagnosis: '', vet_treatment: '', vet_notes: '', status: '' });
  const [obs, setObs] = useState({ appetite: '', temperature_c: '', notes: '', symptoms: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const caseQuery = useFetch<HealthCase>(caseId ? `/health/cases/${caseId}` : null, [caseId]);

  const isVet = user?.role === 'veterinarian' || user?.role === 'paravet';
  const isAdmin = user?.role === 'admin';
  const listBase = location.pathname.startsWith('/vet')
    ? '/vet/cases'
    : location.pathname.startsWith('/coop')
      ? '/coop/health'
      : '/farmer/health';

  useEffect(() => {
    if (!caseQuery.data) return;
    setForm({
      vet_diagnosis: caseQuery.data.vet_diagnosis || '',
      vet_treatment: caseQuery.data.vet_treatment || '',
      vet_notes: caseQuery.data.vet_notes || '',
      status: '',
    });
  }, [caseQuery.data]);

  if (caseQuery.loading) return <Spinner />;
  if (caseQuery.error) return <ErrorAlert message={caseQuery.error} onRetry={caseQuery.reload} />;
  if (!caseQuery.data) return <EmptyState title="Case not found" />;
  const item = caseQuery.data;

  const triage = (item.triage || {}) as { severity?: string; reasons?: string[]; advice?: string[]; symptoms?: string[]; requires_vet?: boolean };
  const canEditAssessment = (isVet || isAdmin) && (isAdmin || item.assigned_vet_id);

  const saveAssessment = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = { vet_notes: form.vet_notes || undefined };
      if (form.vet_diagnosis || form.vet_treatment) {
        payload.vet_diagnosis = form.vet_diagnosis;
        payload.vet_treatment = form.vet_treatment;
      }
      if (form.status) payload.status = form.status;
      await api.patch(`/health/cases/${item.id}`, payload);
      setSaved(true);
      caseQuery.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const addObservation = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/health/cases/${item.id}/observations`, {
        appetite: obs.appetite || undefined,
        temperature_c: obs.temperature_c ? Number(obs.temperature_c) : undefined,
        notes: obs.notes || undefined,
        symptoms: obs.symptoms ? obs.symptoms.split(',').map((value) => value.trim()).filter(Boolean) : [],
        source: 'text',
      });
      setObs({ appetite: '', temperature_c: '', notes: '', symptoms: '' });
      caseQuery.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to={listBase} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-leaf-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to cases
      </Link>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
                  {item.case_code} <SeverityBadge value={item.severity} /> <Badge value={item.status} />
                  {item.is_sample && <DemoBadge />}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {item.animal?.name} ({item.animal?.tag_code}) · Opened {fdatetime(item.opened_at)}
                </p>
                <p className="text-xs text-slate-500">Reported by {item.farmer?.full_name || 'farmer'}</p>
              </div>
              {item.requires_vet && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Veterinary review required
                </span>
              )}
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reported symptoms</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{item.symptom_summary}</p>
            </div>
            {item.escalation_reason && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span className="font-semibold">Escalation:</span> {item.escalation_reason}
              </div>
            )}
            {item.assigned_vet_id && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-leaf-800">
                <Stethoscope className="h-4 w-4" /> Assigned to a veterinary professional
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Bot className="h-5 w-5 text-leaf-700" /> AI triage trace
            </h2>
            <p className="mt-1 text-xs text-slate-500">Rule-based decision support. Not a diagnosis and not a prescription.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <KeyValue label="Severity">{triage.severity || item.severity}</KeyValue>
              <KeyValue label="Requires veterinarian">{triage.requires_vet ? 'Yes' : 'No'}</KeyValue>
              <div className="sm:col-span-2">
                <KeyValue label="Detected signs">
                  <div className="flex flex-wrap gap-1.5">
                    {(triage.symptoms || []).length === 0
                      ? '—'
                      : (triage.symptoms || []).map((sign) => (
                          <span key={sign} className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize">
                            {sign.replace(/_/g, ' ')}
                          </span>
                        ))}
                  </div>
                </KeyValue>
              </div>
            </div>
            {(triage.reasons || []).length > 0 && (
              <>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Reasons</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(triage.reasons || []).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
            {(triage.advice || []).length > 0 && (
              <>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t('health.advisory')}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(triage.advice || []).map((advice) => (
                    <li key={advice}>{advice}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {(item.vet_diagnosis || item.vet_treatment) && (
            <section className="card border-leaf-200 p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Stethoscope className="h-5 w-5 text-leaf-700" /> Veterinary assessment
                {item.approved_at && <Badge value="approved" />}
              </h2>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('health.diagnosis')}</p>
                  <p className="mt-1 text-sm text-slate-800">{item.vet_diagnosis || 'Not recorded'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('health.treatment')}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{item.vet_treatment || 'Not recorded'}</p>
                </div>
                {item.vet_notes && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</p>
                    <p className="mt-1 text-sm text-slate-800">{item.vet_notes}</p>
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  Confirmed by an authorised professional{item.approved_at ? ` on ${fdatetime(item.approved_at)}` : ''}. AI never
                  writes or confirms this assessment.
                </p>
              </div>
            </section>
          )}

          {canEditAssessment && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Clinical assessment</h2>
              <p className="mt-1 text-xs text-slate-500">
                A diagnosis and treatment plan must both be entered. Saving them records a confirmed professional
                assessment and resolves the safety approval.
              </p>
              <form className="mt-4 space-y-4" onSubmit={saveAssessment}>
                <Field label={t('health.diagnosis')}>
                  <textarea
                    className="input min-h-20"
                    value={form.vet_diagnosis}
                    onChange={(event) => setForm((prev) => ({ ...prev, vet_diagnosis: event.target.value }))}
                    placeholder="Clinical diagnosis after examination"
                  />
                </Field>
                <Field label={t('health.treatment')}>
                  <textarea
                    className="input min-h-24"
                    value={form.vet_treatment}
                    onChange={(event) => setForm((prev) => ({ ...prev, vet_treatment: event.target.value }))}
                    placeholder="Treatment plan, medicines and follow-up — authorised professional only"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Notes">
                    <TextInput value={form.vet_notes} onChange={(event) => setForm((prev) => ({ ...prev, vet_notes: event.target.value }))} />
                  </Field>
                  <Field label="Case status">
                    <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                      <option value="">Leave unchanged</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </Field>
                </div>
                <FormError message={error} />
                {saved && <p className="text-sm font-semibold text-leaf-700">Assessment saved and recorded in the audit log.</p>}
                <SubmitButton type="submit" loading={busy}>
                  Save professional assessment
                </SubmitButton>
              </form>
            </section>
          )}

          {user?.role === 'farmer' && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Add an observation</h2>
              <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={addObservation}>
                <Field label="Appetite">
                  <Select value={obs.appetite} onChange={(event) => setObs((prev) => ({ ...prev, appetite: event.target.value }))}>
                    <option value="">Not recorded</option>
                    <option value="normal">Normal</option>
                    <option value="reduced">Reduced</option>
                    <option value="none">Not eating</option>
                  </Select>
                </Field>
                <Field label="Temperature (°C)">
                  <TextInput
                    type="number"
                    min="30"
                    max="45"
                    step="0.1"
                    value={obs.temperature_c}
                    onChange={(event) => setObs((prev) => ({ ...prev, temperature_c: event.target.value }))}
                  />
                </Field>
                <Field label="New signs" hint="Comma separated">
                  <TextInput
                    value={obs.symptoms}
                    onChange={(event) => setObs((prev) => ({ ...prev, symptoms: event.target.value }))}
                    placeholder="cough, reduced_milk"
                  />
                </Field>
                <Field label="Notes">
                  <TextInput value={obs.notes} onChange={(event) => setObs((prev) => ({ ...prev, notes: event.target.value }))} />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton type="submit" loading={busy}>
                    Add observation
                  </SubmitButton>
                </div>
              </form>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Activity className="h-5 w-5 text-leaf-700" /> Observations
            </h2>
            <div className="mt-3 space-y-3">
              {item.observations.length === 0 && <p className="text-sm text-slate-500">No observations recorded.</p>}
              {item.observations.map((observation: Observation) => (
                <div key={observation.id} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                  <p className="text-xs text-slate-500">{fdatetime(observation.observed_at)} · {observation.source}</p>
                  <p className="mt-1">
                    {observation.appetite && <span className="mr-2 capitalize">Appetite: {observation.appetite}</span>}
                    {observation.temperature_c != null && <span className="mr-2">{observation.temperature_c}°C</span>}
                  </p>
                  {observation.symptoms && observation.symptoms.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600">{observation.symptoms.join(', ')}</p>
                  )}
                  {observation.notes && <p className="mt-1 text-xs text-slate-600">{observation.notes}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <CalendarClock className="h-5 w-5 text-leaf-700" /> Veterinary coordination
            </h2>
            <div className="mt-3 space-y-3">
              {item.visits.length === 0 && <p className="text-sm text-slate-500">No appointment has been requested.</p>}
              {item.visits.map((visit) => (
                <div key={visit.id} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                  <p className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize">{visit.visit_type}</span>
                    <Badge value={visit.status} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Requested {fdatetime(visit.requested_at)}
                    {visit.scheduled_at ? ` · Scheduled ${fdatetime(visit.scheduled_at)}` : ''}
                  </p>
                  {visit.vet?.user && <p className="mt-1 text-xs text-slate-600">Professional: {visit.vet.user.full_name}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
