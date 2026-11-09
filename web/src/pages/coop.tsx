import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  HeartPulse,
  Milk,
  PawPrint,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiError, fdate, fdatetime } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AnalyticsOverview, AnalyticsTrends, Animal, CooperativeMember, HealthCase, Page } from '../lib/types';
import {
  Badge,
  DemoBadge,
  EmptyState,
  ErrorAlert,
  Field,
  FormError,
  Modal,
  PageHeader,
  SampleBanner,
  SeverityBadge,
  Spinner,
  StatCard,
  SubmitButton,
  TextInput,
  useFetch,
} from '../components/ui';
import { AnimalRow } from './farmer';

export function CoopDashboard() {
  const { user } = useAuth();
  const overview = useFetch<AnalyticsOverview>('/analytics/overview');
  const trends = useFetch<AnalyticsTrends>('/analytics/trends?days=30');
  const members = useFetch<CooperativeMember[]>('/users/cooperative/members');
  const cases = useFetch<Page<HealthCase>>('/health/cases?page_size=6');
  const data = overview.data;

  return (
    <div>
      <PageHeader
        title={user?.full_name || 'Cooperative dashboard'}
        subtitle={`${user?.village || 'Village'}, ${user?.district || 'District'} · read-only oversight of linked farmer members`}
        actions={
          <>
            <Link to="/coop/members" className="btn-primary"><Users className="h-4 w-4" /> Manage members</Link>
            <Link to="/coop/health" className="btn-secondary"><HeartPulse className="h-4 w-4" /> Member cases</Link>
          </>
        }
      />
      <SampleBanner />
      {overview.error && <ErrorAlert message={overview.error} onRetry={overview.reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Linked farmers" value={members.data?.length ?? '—'} hint="Active cooperative members" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Animals monitored" value={data?.total_animals ?? '—'} icon={<PawPrint className="h-5 w-5" />} />
        <StatCard label="Active health cases" value={data?.active_health_cases ?? '—'} hint={`${data?.critical_cases ?? 0} high priority`} tone={data?.critical_cases ? 'red' : 'leaf'} icon={<HeartPulse className="h-5 w-5" />} />
        <StatCard label="Milk (30 days)" value={`${data?.milk_litres_30d ?? 0} L`} hint={`${data?.overdue_vaccinations ?? 0} vaccinations overdue`} tone="sky" icon={<Milk className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Network production</h2>
          <p className="text-xs text-slate-500">Aggregated from consenting linked farmers</p>
          <div className="mt-3 h-64">
            {trends.loading ? (
              <Spinner />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.data?.milk || []} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="coopMilk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#429a3a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#429a3a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="L" />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="litres" name="Milk (L)" stroke="#276223" fill="url(#coopMilk)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Network alerts
          </h2>
          <div className="mt-3 space-y-2">
            {(data?.alerts || []).length === 0 && <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">No active alerts across member farms.</p>}
            {(data?.alerts || []).map((alert, index) => (
              <div key={`${alert.type}-${index}`} className={`rounded-xl px-3 py-2.5 text-sm ${alert.severity === 'critical' || alert.severity === 'high' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
                <span className="font-semibold capitalize">{alert.type}:</span> {alert.message}
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Member health snapshot</p>
            <p className="mt-1 text-sm text-slate-600">
              {data?.active_health_cases ?? 0} open cases · {data?.critical_cases ?? 0} high priority · {data?.upcoming_vaccinations ?? 0} vaccinations due
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Users className="h-5 w-5 text-leaf-700" /> Recent members</h2>
            <Link to="/coop/members" className="text-xs font-semibold text-leaf-700 hover:underline">Manage</Link>
          </div>
          <div className="mt-3 space-y-2">
            {members.loading && <Spinner />}
            {(members.data || []).length === 0 && !members.loading && <EmptyState title="No linked members" note="Add a farmer by email to begin oversight." />}
            {(members.data || []).slice(0, 6).map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">{member.farmer.full_name} {member.farmer.is_sample && <DemoBadge />}</p>
                  <p className="text-xs text-slate-500">{member.member_code} · {member.farmer.village || 'Village'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{member.animal_count}</p>
                  <p className="text-[11px] text-slate-500">animals</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ClipboardList className="h-5 w-5 text-leaf-700" /> Member cases</h2>
            <Link to="/coop/health" className="text-xs font-semibold text-leaf-700 hover:underline">All cases</Link>
          </div>
          <div className="mt-3 space-y-2">
            {cases.loading && <Spinner />}
            {(cases.data?.items || []).length === 0 && !cases.loading && <EmptyState title="No cases" />}
            {(cases.data?.items || []).map((item) => (
              <Link key={item.id} to={`/coop/health/${item.id}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-leaf-200 hover:bg-leaf-50/40">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {item.case_code} <SeverityBadge value={item.severity} />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.symptom_summary}</p>
                  <p className="text-[11px] text-slate-400">{item.animal?.name} · {item.farmer?.full_name}</p>
                </div>
                <Badge value={item.status} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function CoopMembers() {
  const members = useFetch<CooperativeMember[]>('/users/cooperative/members');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ farmer_email: '', member_code: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/users/cooperative/members', {
        farmer_email: form.farmer_email,
        member_code: form.member_code || undefined,
      });
      setForm({ farmer_email: '', member_code: '' });
      setOpen(false);
      members.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: CooperativeMember) => {
    if (!window.confirm(`Remove ${member.farmer.full_name} from this cooperative?`)) return;
    try {
      await api.delete(`/users/cooperative/members/${member.id}`);
      members.reload();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const rows = (members.data || []).filter((member) => {
    const term = search.toLowerCase();
    return (
      member.farmer.full_name.toLowerCase().includes(term) ||
      member.farmer.email.toLowerCase().includes(term) ||
      member.member_code.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <PageHeader
        title="Cooperative members"
        subtitle="Link farmer accounts to see aggregated animal, health and production data. Cooperative users have read-only clinical access."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add member</button>}
      />
      {error && <div className="mb-4"><FormError message={error} /></div>}
      {members.error && <ErrorAlert message={members.error} onRetry={members.reload} />}
      <div className="card mb-5 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or member code" />
        </div>
      </div>
      <div className="card overflow-x-auto">
        {members.loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No members found" note="Add a registered farmer by email address." /></div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Member</th>
                <th className="table-th">Member code</th>
                <th className="table-th">Village</th>
                <th className="table-th">Animals</th>
                <th className="table-th">Joined</th>
                <th className="table-th">Status</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((member) => (
                <tr key={member.id}>
                  <td className="table-td">
                    <p className="font-semibold text-slate-800">{member.farmer.full_name}</p>
                    <p className="text-xs text-slate-500">{member.farmer.email}</p>
                  </td>
                  <td className="table-td font-mono text-xs">{member.member_code}</td>
                  <td className="table-td">{member.farmer.village || '—'}</td>
                  <td className="table-td">{member.animal_count}</td>
                  <td className="table-td">{fdate(member.joined_at)}</td>
                  <td className="table-td"><Badge value={member.status} /></td>
                  <td className="table-td">
                    <button className="btn-ghost !px-2 !py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => remove(member)}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add cooperative member" width="max-w-lg">
        <form className="space-y-4" onSubmit={addMember}>
          <Field label="Farmer email" hint="The farmer must already have a registered farmer account.">
            <TextInput required type="email" value={form.farmer_email} onChange={(event) => setForm((prev) => ({ ...prev, farmer_email: event.target.value }))} placeholder="ramesh@alg.demo" />
          </Field>
          <Field label="Member code">
            <TextInput value={form.member_code} onChange={(event) => setForm((prev) => ({ ...prev, member_code: event.target.value }))} placeholder="Auto-generated" />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton type="submit" loading={busy}>Add member</SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function CoopAnimals() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const animals = useFetch<Page<Animal>>(`/animals?page_size=100${query ? `&q=${encodeURIComponent(query)}` : ''}`, [query]);

  return (
    <div>
      <PageHeader title="Member animals" subtitle="Read-only registry of animals belonging to linked farmers." />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <Field label="Search" className="min-w-56 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or tag" />
          </div>
        </Field>
        <button className="btn-secondary" type="submit">Search</button>
      </form>
      {animals.error && <ErrorAlert message={animals.error} onRetry={animals.reload} />}
      {animals.loading ? (
        <Spinner />
      ) : (animals.data?.items || []).length === 0 ? (
        <EmptyState title="No animals" note="Animals appear after farmers are linked and have registered animals." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(animals.data?.items || []).map((animal) => (
            <AnimalRow key={animal.id} animal={animal} to={`/coop/animals/${animal.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CoopHealth() {
  const [statusFilter, setStatusFilter] = useState('');
  const cases = useFetch<Page<HealthCase>>(`/health/cases?page_size=100${statusFilter ? `&status=${statusFilter}` : ''}`, [statusFilter]);

  return (
    <div>
      <PageHeader title="Member health oversight" subtitle="Read-only view of health cases across linked farms. Cooperatives cannot edit clinical records." />
      <SampleBanner />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['', 'reported', 'assigned', 'in_progress', 'resolved'].map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
              statusFilter === status ? 'border-leaf-600 bg-leaf-600 text-white' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {status ? status.replace(/_/g, ' ') : 'All'}
          </button>
        ))}
      </div>
      {cases.error && <ErrorAlert message={cases.error} onRetry={cases.reload} />}
      {cases.loading ? (
        <Spinner />
      ) : (cases.data?.items || []).length === 0 ? (
        <EmptyState title="No cases in this view" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Case</th>
                <th className="table-th">Animal</th>
                <th className="table-th">Farmer</th>
                <th className="table-th">Severity</th>
                <th className="table-th">Status</th>
                <th className="table-th">Opened</th>
                <th className="table-th">Vet assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(cases.data?.items || []).map((item) => (
                <tr key={item.id}>
                  <td className="table-td">
                    <Link to={`/coop/health/${item.id}`} className="font-semibold text-leaf-700 hover:underline">{item.case_code}</Link>
                    <p className="max-w-xs truncate text-xs text-slate-500">{item.symptom_summary}</p>
                  </td>
                  <td className="table-td">{item.animal?.name || '—'}</td>
                  <td className="table-td">{item.farmer?.full_name || '—'}</td>
                  <td className="table-td"><SeverityBadge value={item.severity} /></td>
                  <td className="table-td"><Badge value={item.status} /></td>
                  <td className="table-td">{fdatetime(item.opened_at)}</td>
                  <td className="table-td">{item.approved_at ? 'Confirmed' : 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
