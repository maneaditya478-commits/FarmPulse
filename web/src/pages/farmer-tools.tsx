import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Coins,
  ExternalLink,
  Info,
  Leaf,
  LineChart as LineChartIcon,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Milk,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiError, fdate, fdatetime, money, TOKEN_KEY } from '../lib/api';
import { roleHome, useAuth } from '../lib/auth';
import { languageNames, useLanguage, type Lang } from '../lib/i18n';
import type {
  AIResponse,
  Animal,
  EggRecord,
  Farm,
  FinanceSummary,
  FinancialRecord,
  MarketPrice,
  MarketSource,
  MarketTrend,
  MilkRecord,
  Page,
  VetProfile,
} from '../lib/types';
import {
  Badge,
  DemoBadge,
  EmptyState,
  ErrorAlert,
  Field,
  FormError,
  KeyValue,
  PageHeader,
  SampleBanner,
  Select,
  Spinner,
  StatCard,
  SubmitButton,
  Tabs,
  TextInput,
  useFetch,
} from '../components/ui';

export function MarketPage() {
  const { user } = useAuth();
  const [district, setDistrict] = useState(user?.district || 'Pune');
  const [category, setCategory] = useState('');
  const [days, setDays] = useState('90');
  const categories = useFetch<{ category: string; unit: string; species_code?: string | null }[]>('/market/categories');
  const prices = useFetch<MarketPrice[]>(
    `/market/prices?days=${days}${district ? `&district=${encodeURIComponent(district)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`,
    [district, category, days],
  );
  const sources = useFetch<{ sources: MarketSource[]; note: string }>('/market/sources');
  const trends = useFetch<MarketTrend>(
    district && category ? `/market/trends?district=${encodeURIComponent(district)}&category=${encodeURIComponent(category)}&days=${days}` : null,
    [district, category, days],
  );

  useEffect(() => {
    if (!category && categories.data?.length) setCategory(categories.data[0].category);
  }, [categories.data, category]);

  const demoCount = (prices.data || []).filter((row) => row.is_demo).length;

  return (
    <div>
      <PageHeader
        title="Market intelligence"
        subtitle="District prices include their source, unit and observation date. Demonstration rows are explicitly flagged and never presented as live mandi feeds."
      />
      <SampleBanner />
      {demoCount > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {demoCount} of {prices.data?.length} displayed price rows are demonstration records. Verify against Agmarknet or
            MSAMB before a commercial transaction.
          </span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="District" className="min-w-40">
              <TextInput value={district} onChange={(event) => setDistrict(event.target.value)} />
            </Field>
            <Field label="Category" className="min-w-44">
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                {(categories.data || []).map((item) => (
                  <option key={item.category} value={item.category}>
                    {item.category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Window">
              <Select value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </Select>
            </Field>
          </div>

          <div className="h-64">
            {trends.loading && <Spinner />}
            {!trends.loading && (trends.data?.series || []).length === 0 && (
              <EmptyState title="No trend data for this district and category" note="Try another district or category." />
            )}
            {!trends.loading && (trends.data?.series || []).length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends.data?.series || []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Line type="monotone" dataKey="price_per_unit" name={trends.data?.category || 'Price'} stroke="#276223" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          {trends.data && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                {trends.data.category} · {trends.data.district}
              </p>
              <p className="mt-1">{trends.data.disclaimer}</p>
              <p className="mt-1">Sources: {trends.data.sources.join('; ') || '—'}</p>
              {trends.data.demo_data && <p className="mt-1 font-semibold text-amber-700">Includes demonstration rows.</p>}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-leaf-700" /> Source register
          </h2>
          <p className="mt-1 text-xs text-slate-500">{sources.data?.note || 'Every price row carries its own source and observation date.'}</p>
          <div className="mt-3 space-y-2">
            {sources.loading && <Spinner />}
            {(sources.data?.sources || []).map((source) => (
              <div key={source.source} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{source.source}</p>
                  {source.is_demo ? <DemoBadge /> : <Badge value="active" />}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Latest observation {fdate(source.latest_observed_on)} · {source.districts.join(', ')}
                </p>
                {source.source_url && (
                  <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-leaf-700 hover:underline">
                    Open source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <ShoppingBasket className="h-5 w-5 text-leaf-700" /> Price records
        </h2>
        <div className="mt-3 overflow-x-auto">
          {prices.loading ? (
            <Spinner />
          ) : prices.error ? (
            <ErrorAlert message={prices.error} onRetry={prices.reload} />
          ) : (prices.data || []).length === 0 ? (
            <EmptyState title="No price records" />
          ) : (
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">Category</th>
                  <th className="table-th">Breed / market</th>
                  <th className="table-th">District</th>
                  <th className="table-th">Price</th>
                  <th className="table-th">Observed</th>
                  <th className="table-th">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(prices.data || []).map((row) => (
                  <tr key={row.id}>
                    <td className="table-td">
                      <span className="font-medium capitalize">{row.category}</span>
                      {row.is_demo && <span className="ml-2"><DemoBadge /></span>}
                    </td>
                    <td className="table-td">{row.breed || row.market_name || '—'}</td>
                    <td className="table-td">{row.district}, {row.state}</td>
                    <td className="table-td font-semibold">{money(row.price_per_unit)} <span className="text-xs font-normal text-slate-500">/{row.unit}</span></td>
                    <td className="table-td">{fdate(row.observed_on)}</td>
                    <td className="table-td max-w-56 text-xs text-slate-500">
                      {row.source_url ? (
                        <a href={row.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                          {row.source} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : row.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Prices are informational. The platform does not execute sales or guarantee a price.
        </p>
      </section>
    </div>
  );
}

export function FinancePage() {
  const summary = useFetch<FinanceSummary>('/finance/summary?days=30');
  const records = useFetch<FinancialRecord[]>('/finance/records?days=90');
  const milk = useFetch<MilkRecord[]>('/finance/milk?days=30');
  const eggs = useFetch<EggRecord[]>('/finance/eggs?days=30');
  const animals = useFetch<Page<Animal>>('/animals?page_size=100');
  const [tab, setTab] = useState<'overview' | 'record' | 'production'>('overview');
  const [form, setForm] = useState({
    record_type: 'expense',
    category: 'feed',
    amount: '',
    record_date: new Date().toISOString().slice(0, 10),
    description: '',
  });
  const [milkForm, setMilkForm] = useState({ animal_id: '', record_date: new Date().toISOString().slice(0, 10), session: 'morning', litres: '', fat_pct: '', price_per_litre: '' });
  const [eggForm, setEggForm] = useState({ record_date: new Date().toISOString().slice(0, 10), eggs_count: '', broken_count: '', price_per_egg: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const refresh = () => {
    summary.reload();
    records.reload();
    milk.reload();
    eggs.reload();
  };

  const submitRecord = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post('/finance/records', {
        record_type: form.record_type,
        category: form.category,
        amount: Number(form.amount),
        record_date: form.record_date,
        description: form.description || undefined,
      });
      setSaved('Financial record saved.');
      setForm({ ...form, amount: '', description: '' });
      refresh();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitMilk = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post('/finance/milk', {
        animal_id: milkForm.animal_id,
        record_date: milkForm.record_date,
        session: milkForm.session,
        litres: Number(milkForm.litres),
        fat_pct: milkForm.fat_pct ? Number(milkForm.fat_pct) : undefined,
        price_per_litre: milkForm.price_per_litre ? Number(milkForm.price_per_litre) : undefined,
      });
      setSaved('Milk production recorded.');
      setMilkForm({ ...milkForm, litres: '', fat_pct: '' });
      refresh();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitEggs = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post('/finance/eggs', {
        record_date: eggForm.record_date,
        eggs_count: Number(eggForm.eggs_count),
        broken_count: eggForm.broken_count ? Number(eggForm.broken_count) : 0,
        price_per_egg: eggForm.price_per_egg ? Number(eggForm.price_per_egg) : undefined,
      });
      setSaved('Egg production recorded.');
      setEggForm({ ...eggForm, eggs_count: '', broken_count: '' });
      refresh();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const series = summary.data?.daily_series || [];

  return (
    <div>
      <PageHeader
        title="Financial impact"
        subtitle="Revenue and expenditure derived from recorded production and costs. Every estimate exposes its assumptions."
      />
      <SampleBanner />
      {summary.error && <ErrorAlert message={summary.error} onRetry={summary.reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Milk revenue" value={money(summary.data?.milk_revenue)} hint="Last 30 days" icon={<Milk className="h-5 w-5" />} />
        <StatCard label="Egg revenue" value={money(summary.data?.egg_revenue)} tone="amber" icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Expenditure" value={money((summary.data?.feed_expense || 0) + (summary.data?.vet_expense || 0) + (summary.data?.other_expense || 0))} tone="red" icon={<ArrowDownRight className="h-5 w-5" />} />
        <StatCard label="Net position" value={money(summary.data?.net)} tone={(summary.data?.net || 0) >= 0 ? 'leaf' : 'red'} icon={(summary.data?.net || 0) >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Income vs expenditure</h2>
          <p className="text-xs text-slate-500">Recorded financial entries over the last 30 days</p>
          <div className="mt-3 h-72">
            {summary.loading ? (
              <Spinner />
            ) : series.length === 0 ? (
              <EmptyState title="No financial activity in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#429a3a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#429a3a" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => money(value)} />
                  <Area type="monotone" dataKey="income" name="Income" stroke="#276223" fill="url(#incomeFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" name="Expense" stroke="#dc2626" fill="url(#expenseFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
              <Info className="h-3.5 w-3.5" /> Assumptions
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
              {(summary.data?.assumptions || []).length === 0 && <li>No estimate assumptions are active; figures derive from recorded entries.</li>}
              {(summary.data?.assumptions || []).map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
            {summary.data?.attribution && <p className="mt-1 text-[11px] text-amber-800">{summary.data.attribution}</p>}
          </div>
        </section>

        <section className="card p-5">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'overview', label: 'Breakdown' },
              { key: 'record', label: 'Add entry' },
              { key: 'production', label: 'Production' },
            ]}
          />
          {tab === 'overview' && (
            <div>
              <KeyValue label="Milk revenue">{money(summary.data?.milk_revenue)}</KeyValue>
              <KeyValue label="Egg revenue">{money(summary.data?.egg_revenue)}</KeyValue>
              <KeyValue label="Other income">{money(summary.data?.other_income)}</KeyValue>
              <KeyValue label="Feed expense">{money(summary.data?.feed_expense)}</KeyValue>
              <KeyValue label="Veterinary expense">{money(summary.data?.vet_expense)}</KeyValue>
              <KeyValue label="Other expense">{money(summary.data?.other_expense)}</KeyValue>
              <KeyValue label="Estimated loss">{money(summary.data?.estimated_loss)}</KeyValue>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent entries</p>
                <div className="mt-2 space-y-2">
                  {records.loading && <Spinner />}
                  {(records.data || []).slice(0, 6).map((record) => (
                    <div key={record.id} className="flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium capitalize text-slate-800">{record.category.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">{fdate(record.record_date)}{record.is_estimate ? ' · estimate' : ''}</p>
                      </div>
                      <span className={`font-semibold ${record.record_type === 'income' ? 'text-leaf-700' : 'text-red-600'}`}>
                        {record.record_type === 'income' ? '+' : '−'}{money(record.amount)}
                      </span>
                    </div>
                  ))}
                  {(records.data || []).length === 0 && !records.loading && <EmptyState title="No entries yet" />}
                </div>
              </div>
            </div>
          )}

          {tab === 'record' && (
            <form className="space-y-4" onSubmit={submitRecord}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <Select value={form.record_type} onChange={(event) => setForm((prev) => ({ ...prev, record_type: event.target.value }))}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="estimate">Estimate</option>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                    <option value="feed">Feed</option>
                    <option value="veterinary">Veterinary</option>
                    <option value="medicine">Medicine</option>
                    <option value="labour">Labour</option>
                    <option value="milk">Milk</option>
                    <option value="egg">Egg</option>
                    <option value="animal_sale">Animal sale</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </div>
              <Field label="Amount (₹)">
                <TextInput required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} />
              </Field>
              <Field label="Date">
                <TextInput type="date" value={form.record_date} onChange={(event) => setForm((prev) => ({ ...prev, record_date: event.target.value }))} />
              </Field>
              <Field label="Description">
                <TextInput value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              <FormError message={error} />
              <SubmitButton type="submit" loading={busy}>Save entry</SubmitButton>
            </form>
          )}

          {tab === 'production' && (
            <div className="space-y-5">
              <form className="space-y-3 rounded-xl border border-slate-100 p-3" onSubmit={submitMilk}>
                <p className="text-sm font-bold text-slate-800">Milk record</p>
                <Select required value={milkForm.animal_id} onChange={(event) => setMilkForm((prev) => ({ ...prev, animal_id: event.target.value }))}>
                  <option value="">Select animal</option>
                  {(animals.data?.items || []).map((animal) => (
                    <option key={animal.id} value={animal.id}>{animal.name} ({animal.tag_code})</option>
                  ))}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <TextInput type="date" value={milkForm.record_date} onChange={(event) => setMilkForm((prev) => ({ ...prev, record_date: event.target.value }))} />
                  <Select value={milkForm.session} onChange={(event) => setMilkForm((prev) => ({ ...prev, session: event.target.value }))}>
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                  </Select>
                  <TextInput required type="number" min="0.01" step="0.01" placeholder="Litres" value={milkForm.litres} onChange={(event) => setMilkForm((prev) => ({ ...prev, litres: event.target.value }))} />
                  <TextInput type="number" min="0" step="0.01" placeholder="Price/L" value={milkForm.price_per_litre} onChange={(event) => setMilkForm((prev) => ({ ...prev, price_per_litre: event.target.value }))} />
                </div>
                <SubmitButton type="submit" loading={busy} className="w-full !py-2">Save milk</SubmitButton>
              </form>

              <form className="space-y-3 rounded-xl border border-slate-100 p-3" onSubmit={submitEggs}>
                <p className="text-sm font-bold text-slate-800">Egg record</p>
                <div className="grid grid-cols-2 gap-2">
                  <TextInput type="date" value={eggForm.record_date} onChange={(event) => setEggForm((prev) => ({ ...prev, record_date: event.target.value }))} />
                  <TextInput required type="number" min="0" placeholder="Eggs collected" value={eggForm.eggs_count} onChange={(event) => setEggForm((prev) => ({ ...prev, eggs_count: event.target.value }))} />
                  <TextInput type="number" min="0" placeholder="Broken" value={eggForm.broken_count} onChange={(event) => setEggForm((prev) => ({ ...prev, broken_count: event.target.value }))} />
                  <TextInput type="number" min="0" step="0.01" placeholder="Price/egg" value={eggForm.price_per_egg} onChange={(event) => setEggForm((prev) => ({ ...prev, price_per_egg: event.target.value }))} />
                </div>
                <SubmitButton type="submit" loading={busy} className="w-full !py-2">Save eggs</SubmitButton>
              </form>
              {saved && <p className="text-sm font-semibold text-leaf-700">{saved}</p>}
              <FormError message={error} />
            </div>
          )}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-base font-bold text-slate-900">Recorded production</h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Milk — last 30 days</p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {milk.loading && <Spinner />}
              {(milk.data || []).length === 0 && !milk.loading && <p className="text-sm text-slate-500">No milk records.</p>}
              {(milk.data || []).slice(0, 15).map((record) => (
                <div key={record.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="capitalize">{record.session} · {fdate(record.record_date)}</span>
                  <span className="font-semibold">{record.litres} L</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Eggs — last 30 days</p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {eggs.loading && <Spinner />}
              {(eggs.data || []).length === 0 && !eggs.loading && <p className="text-sm text-slate-500">No egg records.</p>}
              {(eggs.data || []).slice(0, 15).map((record) => (
                <div key={record.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span>{fdate(record.record_date)}</span>
                  <span className="font-semibold">{record.eggs_count} eggs {record.broken_count ? `· ${record.broken_count} broken` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  meta?: {
    intent?: string;
    agents?: string[];
    escalated?: boolean;
    provider?: string;
    latency?: number;
    caseId?: string | null;
    appointmentId?: string | null;
    trace?: { agent?: string; status?: string; note?: string }[];
  };
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

export function AssistantPage() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text:
        'Namaste. I coordinate specialised livestock agents for health triage, vaccination schedules, nutrition, environment, market prices and financial impact. I can flag urgency and connect you to a veterinarian — I cannot diagnose, prescribe medicine or replace a professional. Ask in Marathi, Hindi or English.',
    },
  ]);
  const [text, setText] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem('alg_ai_session'));
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animals = useFetch<Page<Animal>>('/animals?page_size=100');
  const agents = useFetch<{ orchestration: string; agents: { key: string; name: string; responsibility: string; status: string }[] }>('/ai/agents');
  const status = useFetch<{ provider: string; gemini_configured: boolean; model?: string | null; fallback: string; guardrails: string[] }>('/ai/status');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (question: string, mode: 'text' | 'voice' = 'text') => {
    const value = question.trim();
    if (!value) return;
    setMessages((current) => [...current, { role: 'user', text: value }]);
    setText('');
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<AIResponse>('/ai/query', {
        text: value,
        animal_id: animalId || undefined,
        session_id: sessionId || undefined,
        language: lang,
        input_mode: mode,
      });
      setSessionId(data.session_id);
      localStorage.setItem('alg_ai_session', data.session_id);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: data.response_text,
          meta: {
            intent: data.intent,
            agents: data.agents_used,
            escalated: data.escalated,
            provider: data.llm_provider,
            latency: data.latency_ms,
            caseId: data.case_id,
            appointmentId: data.appointment_id,
            trace: data.trace,
          },
        },
      ]);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    setVoiceError(null);
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceError('This browser does not expose speech recognition. Use Chrome or Edge, or type your question.');
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      if (transcript) ask(transcript, 'voice');
    };
    recognition.onerror = () => {
      setVoiceError('Speech recognition could not capture audio. Check microphone permission or type your question.');
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const prompts = [
    'गाईला दोन दिवसांपासून ताप आहे आणि दूध कमी झाले आहे',
    'Which vaccinations are due for my animals?',
    'What is the current goat price in Pune?',
    'Show my feed cost and net income this month',
    'Is the hot weather a risk for my poultry?',
  ];
  const caseBase =
    user?.role === 'veterinarian' || user?.role === 'paravet'
      ? '/vet/cases'
      : user?.role === 'cooperative'
        ? '/coop/health'
        : '/farmer/health';

  return (
    <div>
      <PageHeader
        title={t('nav.assistant')}
        subtitle={`${agents.data?.orchestration || 'LangGraph'} workflow · provider: ${status.data?.provider || '…'}${status.data?.gemini_configured ? ' (Gemini configured)' : ' (deterministic fallback)'}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card flex min-h-[620px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf-700 text-white"><Bot className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-bold text-slate-900">Livestock Guardian orchestrator</p>
                <p className="text-[11px] text-slate-500">Session {sessionId ? sessionId.slice(0, 8) : 'new'} · {languageNames[lang as Lang]}</p>
              </div>
            </div>
            <Select className="!w-auto !py-1.5 text-xs" value={animalId} onChange={(event) => setAnimalId(event.target.value)}>
              <option value="">No specific animal</option>
              {(animals.data?.items || []).map((animal) => (
                <option key={animal.id} value={animal.id}>{animal.name} ({animal.tag_code})</option>
              ))}
            </Select>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-leaf-100 text-leaf-800">
                    <Sparkles className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  message.role === 'user' ? 'bg-leaf-700 text-white' : 'border border-slate-100 bg-white text-slate-800 shadow-sm'
                }`}>
                  <p className="whitespace-pre-line leading-relaxed">{message.text}</p>
                  {message.meta && (
                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {message.meta.escalated && <Badge value="critical" />}
                        {message.meta.intent && <span className="badge bg-slate-100 text-slate-600">{message.meta.intent.replace(/_/g, ' ')}</span>}
                        {message.meta.provider && <span className="badge bg-sky-50 text-sky-700">{message.meta.provider}</span>}
                        {message.meta.latency != null && <span className="text-[10px] text-slate-400">{message.meta.latency} ms</span>}
                      </div>
                      <p className="text-[11px] text-slate-500">Agents: {(message.meta.agents || []).join(', ') || '—'}</p>
                      {message.meta.trace && message.meta.trace.length > 0 && (
                        <details className="text-[11px] text-slate-500">
                          <summary className="cursor-pointer font-semibold text-slate-600">Workflow trace</summary>
                          <ul className="mt-1 space-y-0.5">
                            {message.meta.trace.map((step, stepIndex) => (
                              <li key={stepIndex}>
                                {step.agent}: {step.status}{step.note ? ` — ${step.note}` : ''}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {message.meta.caseId && (
                          <Link to={`${caseBase}/${message.meta.caseId}`} className="text-[11px] font-semibold text-leaf-700 hover:underline">
                            Open health case
                          </Link>
                        )}
                        {message.meta.appointmentId && <span className="text-[11px] font-semibold text-leaf-700">Vet appointment requested</span>}
                      </div>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-200 text-slate-600">
                    <UserRound className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-leaf-600" /> Agents are working…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 bg-white px-4 py-3">
            {error && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            {voiceError && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{voiceError}</div>}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {prompts.map((prompt) => (
                <button key={prompt} onClick={() => setText(prompt)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-leaf-300 hover:bg-leaf-50">
                  {prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt}
                </button>
              ))}
            </div>
            <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); ask(text); }}>
              <textarea
                className="input max-h-32 min-h-11 flex-1 resize-none"
                rows={1}
                placeholder={t('assistant.placeholder')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask(text);
                  }
                }}
              />
              <button
                type="button"
                className={`btn ${listening ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-secondary'}`}
                onClick={listening ? stopVoice : startVoice}
                title={t('assistant.voice')}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-[10px] text-slate-400">{t('guardrail.note')}</p>
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Leaf className="h-5 w-5 text-leaf-700" /> Configured agents
            </h2>
            <p className="mt-1 text-xs text-slate-500">Structured LangGraph workflow, not a single chatbot.</p>
            <div className="mt-3 space-y-2">
              {agents.loading && <Spinner />}
              {(agents.data?.agents || []).map((agent) => (
                <details key={agent.key} className="rounded-xl border border-slate-100 px-3 py-2">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                    {agent.name}
                    <Badge value={agent.status} />
                  </summary>
                  <p className="mt-1 text-xs text-slate-500">{agent.responsibility}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-leaf-700" /> Guardrails & provider
            </h2>
            {status.loading && <Spinner />}
            {status.data && (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  Provider: <strong className="text-slate-800">{status.data.provider}</strong>
                  {status.data.gemini_configured ? ` · ${status.data.model}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">{status.data.fallback}</p>
                <ul className="mt-3 space-y-1.5">
                  {status.data.guardrails.map((guardrail) => (
                    <li key={guardrail} className="flex items-start gap-1.5 text-xs text-slate-700">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" /> {guardrail}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { lang, setLang } = useLanguage();
  const farms = useFetch<Farm[]>('/farms');
  const vetProfile = useFetch<VetProfile | null>(user?.role === 'veterinarian' || user?.role === 'paravet' ? '/veterinarians/me' : null);
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    language: user?.language || 'en',
    village: user?.village || '',
    district: user?.district || '',
    state: user?.state || '',
  });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.patch('/users/me', {
        full_name: form.full_name,
        phone: form.phone || undefined,
        language: form.language,
        village: form.village || undefined,
        district: form.district || undefined,
        state: form.state || undefined,
      });
      setLang(form.language as Lang);
      await refreshUser();
      setSaved('Profile updated.');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const response = await api.post('/auth/change-password', passwords);
      localStorage.setItem(TOKEN_KEY, response.data.access_token);
      setPasswords({ current_password: '', new_password: '' });
      setSaved('Password updated.');
    } catch (err) {
      setPasswordError(apiError(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile & account" subtitle="Your identity, language preference, farms and professional registration details." />
      {user.is_sample && <SampleBanner />}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Personal details</h2>
          <form className="mt-4 space-y-4" onSubmit={saveProfile}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><TextInput required value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} /></Field>
              <Field label="Email"><TextInput value={user.email} disabled /></Field>
              <Field label="Phone"><TextInput value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} /></Field>
              <Field label="Language">
                <Select value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="mr">मराठी</option>
                </Select>
              </Field>
              <Field label="Village"><TextInput value={form.village} onChange={(event) => setForm((prev) => ({ ...prev, village: event.target.value }))} /></Field>
              <Field label="District"><TextInput value={form.district} onChange={(event) => setForm((prev) => ({ ...prev, district: event.target.value }))} /></Field>
              <Field label="State"><TextInput value={form.state} onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))} /></Field>
              <Field label="Role"><TextInput value={user.role} disabled /></Field>
            </div>
            <FormError message={error} />
            {saved && <p className="text-sm font-semibold text-leaf-700">{saved}</p>}
            <SubmitButton type="submit" loading={busy}>Save profile</SubmitButton>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-5">
            <h2 className="text-base font-bold text-slate-900">Change password</h2>
            <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={changePassword}>
              <Field label="Current password"><TextInput required type="password" value={passwords.current_password} onChange={(event) => setPasswords((prev) => ({ ...prev, current_password: event.target.value }))} /></Field>
              <Field label="New password" hint="Minimum 8 characters."><TextInput required type="password" minLength={8} value={passwords.new_password} onChange={(event) => setPasswords((prev) => ({ ...prev, new_password: event.target.value }))} /></Field>
              <div className="sm:col-span-2">
                <FormError message={passwordError} />
                <SubmitButton type="submit" loading={passwordBusy}>Update password</SubmitButton>
              </div>
            </form>
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Account</h2>
            <div className="mt-2">
              <KeyValue label="Account ID"><span className="font-mono text-xs">{user.id}</span></KeyValue>
              <KeyValue label="Role">{user.role}</KeyValue>
              <KeyValue label="Status">{user.is_active ? 'Active' : 'Inactive'}</KeyValue>
              <KeyValue label="Last login">{fdatetime(user.last_login_at)}</KeyValue>
              <KeyValue label="Created">{fdate(user.created_at)}</KeyValue>
            </div>
            <button className="btn-secondary mt-4 w-full" onClick={logout}>
              <ShieldCheck className="h-4 w-4" /> Sign out
            </button>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><MapPin className="h-5 w-5 text-leaf-700" /> Farms</h2>
            <div className="mt-3 space-y-2">
              {farms.loading && <Spinner />}
              {(farms.data || []).length === 0 && !farms.loading && <p className="text-sm text-slate-500">No farms linked to this account.</p>}
              {(farms.data || []).map((farm) => (
                <div key={farm.id} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                  <p className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                    {farm.name} {farm.is_sample && <DemoBadge />}
                  </p>
                  <p className="text-xs text-slate-500">{farm.village}, {farm.district}, {farm.state}</p>
                  {farm.size_acres != null && <p className="text-xs text-slate-500">{farm.size_acres} acres</p>}
                </div>
              ))}
            </div>
          </section>

          {(user.role === 'veterinarian' || user.role === 'paravet') && (
            <section className="card p-5">
              <h2 className="text-base font-bold text-slate-900">Professional registration</h2>
              {vetProfile.loading && <Spinner />}
              {vetProfile.data && (
                <div className="mt-2">
                  <KeyValue label="Registration number">{vetProfile.data.registration_no}</KeyValue>
                  <KeyValue label="Qualification">{vetProfile.data.qualification}</KeyValue>
                  <KeyValue label="Specialisation">{vetProfile.data.specialization || 'General'}</KeyValue>
                  <KeyValue label="Verification">{vetProfile.data.verified ? 'Verified' : 'Pending administrator review'}</KeyValue>
                  <KeyValue label="Availability">{vetProfile.data.availability}</KeyValue>
                </div>
              )}
              {!vetProfile.loading && !vetProfile.data && <p className="mt-2 text-sm text-slate-500">No veterinary profile found.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
