import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileClock,
  HeartPulse,
  PawPrint,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Stethoscope,
  ToggleLeft,
  ToggleRight,
  UserCog,
  Users,
  Warehouse,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiError, fdate, fdatetime } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  AdminOverview,
  AgentApproval,
  AgentMonitor,
  AnalyticsOverview,
  Animal,
  AuditLog,
  Farm,
  Page,
  User,
  VetProfile,
} from '../lib/types';
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
  Select,
  SeverityBadge,
  Spinner,
  StatCard,
  SubmitButton,
  Tabs,
  TextInput,
  useFetch,
} from '../components/ui';
import { AnimalAvatar } from './farmer';

type AdminUser = User & { animal_count?: number; farm_count?: number };

export function AdminDashboard() {
  const overview = useFetch<AdminOverview>('/admin/overview');
  const analytics = useFetch<AnalyticsOverview>('/analytics/overview');
  const monitor = useFetch<AgentMonitor>('/admin/agent-monitor');
  const data = overview.data;

  const roleData = Object.entries(data?.users || {}).map(([role, count]) => ({ role, count }));
  const severityData = Object.entries(data?.cases_by_severity || {}).map(([severity, count]) => ({ severity, count }));
  const agentData = Object.entries(monitor.data?.agent_usage_recent || {}).map(([agent, count]) => ({ agent, count }));
  const colors = ['#276223', '#66b75e', '#9ad494', '#d9a441', '#8b5e3c', '#7c9eb2', '#b35c5c'];

  return (
    <div>
      <PageHeader
        title="Platform overview"
        subtitle="Governance, veterinary verification and agent safety monitoring across the deployment."
        actions={
          <>
            <Link to="/admin/vets" className="btn-primary"><Stethoscope className="h-4 w-4" /> Verify veterinarians</Link>
            <Link to="/admin/agents" className="btn-secondary"><Bot className="h-4 w-4" /> Agent monitor</Link>
          </>
        }
      />
      {data?.demo_data_enabled && <SampleBanner />}
      {overview.error && <ErrorAlert message={overview.error} onRetry={overview.reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={data?.total_users ?? '—'} hint={`${data?.active_users ?? 0} active`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Farms" value={data?.farms ?? '—'} hint={`${data?.animals ?? 0} active animals`} icon={<Warehouse className="h-5 w-5" />} />
        <StatCard label="Veterinarians" value={data?.veterinarians ?? '—'} hint={`${data?.unverified_veterinarians ?? 0} awaiting verification`} tone={data?.unverified_veterinarians ? 'amber' : 'leaf'} icon={<Stethoscope className="h-5 w-5" />} />
        <StatCard label="Open health cases" value={data?.open_health_cases ?? '—'} hint={`${data?.health_cases ?? 0} lifetime`} tone={data?.open_health_cases ? 'red' : 'leaf'} icon={<HeartPulse className="h-5 w-5" />} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending approvals" value={data?.pending_approvals ?? '—'} hint="Human-in-the-loop safety gate" tone="amber" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="AI interactions (24h)" value={data?.ai_interactions_24h ?? '—'} hint={`${data?.ai_interactions ?? 0} lifetime`} icon={<Bot className="h-5 w-5" />} />
        <StatCard label="Cooperative links" value={data?.cooperative_links ?? '—'} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Sync errors" value={data?.sync_errors ?? '—'} hint={`${data?.sync_operations ?? 0} operations`} tone={data?.sync_errors ? 'red' : 'slate'} icon={<Database className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Users by role</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleData} dataKey="count" nameKey="role" innerRadius={35} outerRadius={70} paddingAngle={2}>
                  {roleData.map((entry, index) => <Cell key={entry.role} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2">
            {roleData.map((entry, index) => (
              <span key={entry.role} className="inline-flex items-center gap-1 text-xs capitalize text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ background: colors[index % colors.length] }} />
                {entry.role} ({entry.count})
              </span>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Cases by severity</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                <XAxis dataKey="severity" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry) => (
                    <Cell key={entry.severity} fill={entry.severity === 'critical' ? '#b91c1c' : entry.severity === 'high' ? '#ea580c' : entry.severity === 'medium' ? '#d97706' : '#429a3a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500">Total lifetime cases: {data?.health_cases ?? 0}</p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Agent usage</h2>
          <p className="text-xs text-slate-500">Recent orchestrator traces</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentData} layout="vertical" margin={{ top: 4, right: 12, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <YAxis type="category" dataKey="agent" width={82} tick={{ fontSize: 9, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" fill="#429a3a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500">Provider: {monitor.data?.llm_provider || '…'} · avg {monitor.data?.average_latency_ms ?? '—'} ms</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Bot className="h-5 w-5 text-leaf-700" /> Recent agent interactions</h2>
            <Link to="/admin/agents" className="text-xs font-semibold text-leaf-700 hover:underline">Monitor</Link>
          </div>
          <div className="mt-3 space-y-2">
            {monitor.loading && <Spinner />}
            {(monitor.data?.recent_interactions || []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium capitalize text-slate-800">{item.intent?.replace(/_/g, ' ') || 'Interaction'}</p>
                  {item.escalated ? <Badge value="critical" /> : <Badge value="active" />}
                </div>
                <p className="text-xs text-slate-500">{item.language} · {item.latency_ms} ms · {fdatetime(item.created_at)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{(item.agents_used || []).join(', ')}</p>
              </div>
            ))}
            {(monitor.data?.recent_interactions || []).length === 0 && !monitor.loading && <EmptyState title="No AI interactions yet" />}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileClock className="h-5 w-5 text-leaf-700" /> Recent audit activity</h2>
            <Link to="/admin/audit" className="text-xs font-semibold text-leaf-700 hover:underline">Audit logs</Link>
          </div>
          <RecentAudit />
        </section>
      </div>
    </div>
  );
}

function RecentAudit() {
  const logs = useFetch<Page<AuditLog>>('/admin/audit-logs?page_size=6');
  return (
    <div className="mt-3 space-y-2">
      {logs.loading && <Spinner />}
      {(logs.data?.items || []).length === 0 && !logs.loading && <EmptyState title="No audit entries" />}
      {(logs.data?.items || []).map((log) => (
        <div key={log.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
          <p className="font-medium text-slate-800">{log.action.replace(/\./g, ' · ')}</p>
          <p className="text-xs text-slate-500">{log.actor_role || 'system'} → {log.entity_type} · {fdatetime(log.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500">Page {page} of {Math.max(pages, 1)}</span>
      <div className="flex gap-2">
        <button className="btn-secondary !px-2.5 !py-1.5 text-xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <button className="btn-secondary !px-2.5 !py-1.5 text-xs" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const users = useFetch<Page<AdminUser>>(
    `/users?page=${page}&page_size=25${role ? `&role=${role}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`,
    [page, role, query],
  );

  const toggle = async (user: AdminUser) => {
    setBusyId(user.id);
    setError(null);
    try {
      await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
      users.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="User management"
        subtitle="Create accounts, review roles and deactivate access. Every action is audit logged."
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create user</button>}
      />
      {error && <div className="mb-4"><FormError message={error} /></div>}
      <form
        className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <Field label="Search" className="min-w-52 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" />
          </div>
        </Field>
        <Field label="Role" className="min-w-40">
          <Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="farmer">Farmer</option>
            <option value="veterinarian">Veterinarian</option>
            <option value="paravet">Paravet</option>
            <option value="cooperative">Cooperative</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <button className="btn-secondary" type="submit">Apply</button>
      </form>

      {users.error && <ErrorAlert message={users.error} onRetry={users.reload} />}
      <div className="card overflow-x-auto">
        {users.loading ? (
          <Spinner />
        ) : (users.data?.items || []).length === 0 ? (
          <div className="p-5"><EmptyState title="No users match this view" /></div>
        ) : (
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Role</th>
                <th className="table-th">Location</th>
                <th className="table-th">Farms</th>
                <th className="table-th">Animals</th>
                <th className="table-th">Language</th>
                <th className="table-th">Created</th>
                <th className="table-th">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(users.data?.items || []).map((user) => (
                <tr key={user.id}>
                  <td className="table-td">
                    <p className="font-semibold text-slate-800">{user.full_name} {user.is_sample && <DemoBadge />}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="table-td"><Badge value={user.role} /></td>
                  <td className="table-td">{user.village || '—'}{user.district ? `, ${user.district}` : ''}</td>
                  <td className="table-td">{user.farm_count ?? 0}</td>
                  <td className="table-td">{user.animal_count ?? 0}</td>
                  <td className="table-td uppercase">{user.language}</td>
                  <td className="table-td">{fdate(user.created_at)}</td>
                  <td className="table-td">
                    {user.id === me?.id ? (
                      <span className="text-xs font-semibold text-leaf-700">You</span>
                    ) : (
                      <button
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${user.is_active ? 'text-leaf-700' : 'text-slate-500'}`}
                        disabled={busyId === user.id}
                        onClick={() => toggle(user)}
                      >
                        {user.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        {user.is_active ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {users.data && <Pager page={users.data.page} pages={users.data.pages} onChange={setPage} />}
      <CreateUserModal open={open} onClose={() => setOpen(false)} onSaved={users.reload} />
    </div>
  );
}

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'farmer',
    language: 'en',
    phone: '',
    village: '',
    district: '',
    state: 'Maharashtra',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/users', {
        ...form,
        phone: form.phone || undefined,
        village: form.village || undefined,
        district: form.district || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create user account" width="max-w-xl">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><TextInput required value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} /></Field>
          <Field label="Email"><TextInput required type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} /></Field>
          <Field label="Temporary password" hint="Minimum 8 characters."><TextInput required type="password" minLength={8} value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="farmer">Farmer</option>
              <option value="veterinarian">Veterinarian</option>
              <option value="paravet">Paravet</option>
              <option value="cooperative">Cooperative</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <Field label="Language">
            <Select value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </Select>
          </Field>
          <Field label="Phone"><TextInput value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} /></Field>
          <Field label="Village"><TextInput value={form.village} onChange={(event) => setForm((prev) => ({ ...prev, village: event.target.value }))} /></Field>
          <Field label="District"><TextInput value={form.district} onChange={(event) => setForm((prev) => ({ ...prev, district: event.target.value }))} /></Field>
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          A farmer account receives a default farm. Veterinary accounts must complete their professional profile and await
          verification before accepting appointments.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <SubmitButton type="submit" loading={busy}>Create account</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function AdminFarms() {
  const location = useLocation();
  const [tab, setTab] = useState<'farms' | 'animals'>(location.pathname.endsWith('/animals') ? 'animals' : 'farms');
  const farms = useFetch<Farm[]>('/farms');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const animals = useFetch<Page<Animal>>(`/animals?page_size=100${query ? `&q=${encodeURIComponent(query)}` : ''}`, [query]);

  return (
    <div>
      <PageHeader
        title="Farms & animals"
        subtitle="Platform-wide registry. Demonstration farms and animals are explicitly labelled."
        actions={
          <Link to="/admin/users" className="btn-secondary"><Users className="h-4 w-4" /> Manage owners</Link>
        }
      />
      <SampleBanner />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'farms', label: `Farms (${farms.data?.length ?? 0})` },
          { key: 'animals', label: `Animals (${animals.data?.total ?? 0})` },
        ]}
      />
      {tab === 'farms' && (
        <div>
          {farms.error && <ErrorAlert message={farms.error} onRetry={farms.reload} />}
          {farms.loading ? (
            <Spinner />
          ) : (farms.data || []).length === 0 ? (
            <EmptyState title="No farms registered" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(farms.data || []).map((farm) => (
                <div key={farm.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900"><Warehouse className="h-4 w-4 text-leaf-700" /> {farm.name} {farm.is_sample && <DemoBadge />}</p>
                      <p className="mt-1 text-xs text-slate-500">{farm.village}, {farm.district}, {farm.state}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Size</p>
                      <p className="font-semibold text-slate-800">{farm.size_acres != null ? `${farm.size_acres} acres` : '—'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Pincode</p>
                      <p className="font-semibold text-slate-800">{farm.pincode || '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'animals' && (
        <div>
          <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
            <Field label="Search animals" className="min-w-56 flex-1">
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
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Animal</th>
                    <th className="table-th">Species</th>
                    <th className="table-th">Sex</th>
                    <th className="table-th">Weight</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(animals.data?.items || []).map((animal) => (
                    <tr key={animal.id}>
                      <td className="table-td">
                        <Link to={`/admin/animals/${animal.id}`} className="flex items-center gap-2 font-medium text-leaf-700 hover:underline">
                          <AnimalAvatar animal={animal} size="h-8 w-8" />
                          <span>{animal.name} <span className="block text-xs font-normal text-slate-500">{animal.tag_code}</span></span>
                        </Link>
                      </td>
                      <td className="table-td">{animal.species?.name_en}</td>
                      <td className="table-td capitalize">{animal.sex}</td>
                      <td className="table-td">{animal.weight_kg ? `${animal.weight_kg} kg` : '—'}</td>
                      <td className="table-td"><Badge value={animal.status} /></td>
                      <td className="table-td">{fdate(animal.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(animals.data?.items || []).length === 0 && <div className="p-5"><EmptyState title="No animals" /></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminVets() {
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vets = useFetch<VetProfile[]>(`/admin/veterinarians${verifiedFilter ? `?verified=${verifiedFilter}` : ''}`, [verifiedFilter]);

  const setVerified = async (vet: VetProfile, verified: boolean) => {
    setBusyId(vet.id);
    setError(null);
    try {
      await api.post(`/admin/veterinarians/${vet.id}/verify`, {
        verified,
        note: verified ? 'Registration reviewed by administrator.' : 'Verification withdrawn after review.',
      });
      vets.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Veterinary network"
        subtitle="Verify professional registration before a veterinarian can receive appointments. Verification changes are audit logged."
        actions={
          <Select className="!w-auto !py-2 text-xs" value={verifiedFilter} onChange={(event) => setVerifiedFilter(event.target.value)}>
            <option value="">All veterinarians</option>
            <option value="false">Awaiting verification</option>
            <option value="true">Verified</option>
          </Select>
        }
      />
      {error && <div className="mb-4"><FormError message={error} /></div>}
      {vets.error && <ErrorAlert message={vets.error} onRetry={vets.reload} />}
      {vets.loading ? (
        <Spinner />
      ) : (vets.data || []).length === 0 ? (
        <EmptyState title="No veterinarians in this view" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(vets.data || []).map((vet) => (
            <div key={vet.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                    {vet.user?.full_name || 'Veterinarian'}
                    {vet.verified ? <Badge value="approved" /> : <Badge value="pending" />}
                  </p>
                  <p className="text-xs text-slate-500">{vet.qualification} · {vet.specialization || 'General practice'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Reg. {vet.registration_no} · {vet.district}{vet.state ? `, ${vet.state}` : ''}
                  </p>
                  {vet.clinic_name && <p className="text-xs text-slate-500">{vet.clinic_name}</p>}
                </div>
                <Stethoscope className="h-8 w-8 text-leaf-200" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge value={vet.availability} />
                <span className="text-slate-500">{vet.service_radius_km} km radius</span>
                {vet.user?.language && <span className="text-slate-500">· {vet.user.language}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {vet.verified ? (
                  <button className="btn-secondary !px-2.5 !py-1.5 text-xs text-red-700" disabled={busyId === vet.id} onClick={() => setVerified(vet, false)}>
                    <XCircle className="h-3.5 w-3.5" /> Withdraw verification
                  </button>
                ) : (
                  <button className="btn-primary !px-2.5 !py-1.5 text-xs" disabled={busyId === vet.id} onClick={() => setVerified(vet, true)}>
                    <BadgeCheck className="h-3.5 w-3.5" /> Verify registration
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminAgents() {
  const monitor = useFetch<AgentMonitor>('/admin/agent-monitor');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (approval: AgentApproval, decision: 'approved' | 'rejected') => {
    setBusyId(approval.id);
    setError(null);
    try {
      await api.post(`/health/approvals/${approval.id}/decision`, {
        decision,
        reason: 'Reviewed by platform administrator.',
      });
      monitor.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const agentData = Object.entries(monitor.data?.agent_usage_recent || {}).map(([agent, count]) => ({ agent, count }));

  return (
    <div>
      <PageHeader title="Agent monitoring" subtitle="Orchestration health, escalation counts, pending human approvals and offline sync activity." />
      {error && <div className="mb-4"><FormError message={error} /></div>}
      {monitor.error && <ErrorAlert message={monitor.error} onRetry={monitor.reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Interactions" value={monitor.data?.total_interactions ?? '—'} icon={<Bot className="h-5 w-5" />} />
        <StatCard label="Escalated" value={monitor.data?.escalated_interactions ?? '—'} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Average latency" value={`${monitor.data?.average_latency_ms ?? '—'} ms`} tone="sky" icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Provider" value={monitor.data?.llm_provider || '—'} tone="slate" icon={<Server className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Agent usage</h2>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <YAxis type="category" dataKey="agent" width={92} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" fill="#429a3a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-amber-600" /> Pending approvals</h2>
          <div className="mt-3 space-y-2">
            {monitor.loading && <Spinner />}
            {(monitor.data?.pending_approvals || []).length === 0 && !monitor.loading && <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">No approvals pending.</p>}
            {(monitor.data?.pending_approvals || []).map((approval) => (
              <div key={approval.id} className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 text-sm">
                <p className="font-semibold text-slate-800">{approval.agent_name.replace(/_/g, ' ')} · {approval.action.replace(/_/g, ' ')}</p>
                <p className="text-xs text-amber-900">{approval.reason || 'Review required.'}</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary !px-2.5 !py-1.5 text-xs" disabled={busyId === approval.id} onClick={() => decide(approval, 'approved')}>Approve</button>
                  <button className="btn-secondary !px-2.5 !py-1.5 text-xs" disabled={busyId === approval.id} onClick={() => decide(approval, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-x-auto p-5">
          <h2 className="text-base font-bold text-slate-900">Recent interactions</h2>
          <table className="mt-3 w-full min-w-[540px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Intent</th>
                <th className="table-th">Language</th>
                <th className="table-th">Escalated</th>
                <th className="table-th">Latency</th>
                <th className="table-th">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(monitor.data?.recent_interactions || []).map((item) => (
                <tr key={item.id}>
                  <td className="table-td capitalize">{item.intent?.replace(/_/g, ' ') || '—'}</td>
                  <td className="table-td uppercase">{item.language}</td>
                  <td className="table-td">{item.escalated ? <Badge value="critical" /> : <Badge value="active" />}</td>
                  <td className="table-td">{item.latency_ms} ms</td>
                  <td className="table-td">{fdatetime(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-x-auto p-5">
          <h2 className="text-base font-bold text-slate-900">Recent sync operations</h2>
          <table className="mt-3 w-full min-w-[460px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Entity</th>
                <th className="table-th">Operation</th>
                <th className="table-th">Status</th>
                <th className="table-th">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(monitor.data?.recent_sync_operations || []).map((operation) => (
                <tr key={operation.id}>
                  <td className="table-td">{operation.entity_type.replace(/_/g, ' ')}</td>
                  <td className="table-td capitalize">{operation.operation}</td>
                  <td className="table-td"><Badge value={operation.status} /></td>
                  <td className="table-td">{fdatetime(operation.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [role, setRole] = useState('');
  const logs = useFetch<Page<AuditLog>>(
    `/admin/audit-logs?page=${page}&page_size=25${action ? `&action=${encodeURIComponent(action)}` : ''}${entity ? `&entity_type=${encodeURIComponent(entity)}` : ''}${role ? `&actor_role=${role}` : ''}`,
    [page, action, entity, role],
  );

  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Immutable record of authentication, clinical, agent, vaccination and administrative actions." />
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <Field label="Action contains" className="min-w-44 flex-1">
          <TextInput value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} placeholder="e.g. health_case, auth" />
        </Field>
        <Field label="Entity type" className="min-w-40">
          <TextInput value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} placeholder="e.g. user" />
        </Field>
        <Field label="Actor role" className="min-w-36">
          <Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="farmer">Farmer</option>
            <option value="veterinarian">Veterinarian</option>
            <option value="cooperative">Cooperative</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
      </div>
      {logs.error && <ErrorAlert message={logs.error} onRetry={logs.reload} />}
      <div className="card overflow-x-auto">
        {logs.loading ? (
          <Spinner />
        ) : (logs.data?.items || []).length === 0 ? (
          <div className="p-5"><EmptyState title="No audit entries match this filter" /></div>
        ) : (
          <table className="w-full min-w-[880px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">When</th>
                <th className="table-th">Actor role</th>
                <th className="table-th">Action</th>
                <th className="table-th">Entity</th>
                <th className="table-th">Detail</th>
                <th className="table-th">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(logs.data?.items || []).map((log) => (
                <tr key={log.id}>
                  <td className="table-td text-xs text-slate-500">{fdatetime(log.created_at)}</td>
                  <td className="table-td"><Badge value={log.actor_role || 'system'} /></td>
                  <td className="table-td font-medium">{log.action}</td>
                  <td className="table-td text-xs">{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ''}</td>
                  <td className="table-td max-w-xs truncate text-xs text-slate-500">{log.detail ? JSON.stringify(log.detail) : '—'}</td>
                  <td className="table-td text-xs text-slate-500">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {logs.data && <Pager page={logs.data.page} pages={logs.data.pages} onChange={setPage} />}
    </div>
  );
}

interface SystemInfo {
  app: string;
  environment: string;
  api_prefix: string;
  database: string;
  llm_provider: string;
  llm_configured: boolean;
  storage_backend: string;
  demo_seed_enabled: boolean;
  rate_limit_per_minute: number;
  guardrails: string[];
}

interface SyncOp {
  id: string;
  client_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  status: string;
  error?: string | null;
  created_at: string;
}

export function AdminSystem() {
  const system = useFetch<SystemInfo>('/admin/system');
  const ai = useFetch<{ provider: string; gemini_configured: boolean; model?: string | null; fallback: string; guardrails: string[] }>('/ai/status');
  const [status, setStatus] = useState('');
  const sync = useFetch<Page<SyncOp>>(`/admin/sync-operations?page_size=20${status ? `&status=${status}` : ''}`, [status]);

  return (
    <div>
      <PageHeader title="System & deployment" subtitle="Runtime configuration reported by the backend. Secrets are never exposed." />
      {system.data?.demo_seed_enabled && <SampleBanner />}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Server className="h-5 w-5 text-leaf-700" /> Runtime</h2>
          {system.loading && <Spinner />}
          {system.data && (
            <div className="mt-2 divide-y divide-slate-50">
              {[
                ['Application', system.data.app],
                ['Environment', system.data.environment],
                ['API prefix', system.data.api_prefix],
                ['Database', system.data.database],
                ['LLM provider', `${system.data.llm_provider}${system.data.llm_configured ? ' (configured)' : ' (rules fallback)'}`],
                ['Storage backend', system.data.storage_backend],
                ['Rate limit', `${system.data.rate_limit_per_minute} requests/min`],
                ['Demo seed', system.data.demo_seed_enabled ? 'Enabled' : 'Disabled'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          )}
          {ai.data && (
            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">AI runtime</p>
              <p className="mt-1 text-sm text-slate-700">Provider: {ai.data.provider}{ai.data.model ? ` · ${ai.data.model}` : ''}</p>
              <p className="text-xs text-slate-500">{ai.data.fallback}</p>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-leaf-700" /> Enforced guardrails</h2>
          <ul className="mt-3 space-y-2">
            {(system.data?.guardrails || ai.data?.guardrails || []).map((guardrail) => (
              <li key={guardrail} className="flex items-start gap-2 rounded-xl border border-leaf-100 bg-leaf-50/50 px-3 py-2 text-sm text-slate-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" /> {guardrail}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            Deploy with PostgreSQL (Neon), Redis and object storage through environment variables. The companion Docker Compose
            stack runs the API and web app; mobile clients synchronise through the idempotent offline endpoint.
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Database className="h-5 w-5 text-leaf-700" /> Offline sync operations</h2>
          <Select className="!w-auto !py-1.5 text-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="applied">Applied</option>
            <option value="duplicate">Duplicate</option>
            <option value="conflict">Conflict</option>
            <option value="error">Error</option>
          </Select>
        </div>
        {sync.error && <ErrorAlert message={sync.error} onRetry={sync.reload} />}
        <div className="mt-3 overflow-x-auto">
          {sync.loading ? (
            <Spinner />
          ) : (sync.data?.items || []).length === 0 ? (
            <EmptyState title="No sync operations in this view" />
          ) : (
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">When</th>
                  <th className="table-th">Client</th>
                  <th className="table-th">Entity</th>
                  <th className="table-th">Operation</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(sync.data?.items || []).map((operation) => (
                  <tr key={operation.id}>
                    <td className="table-td text-xs text-slate-500">{fdatetime(operation.created_at)}</td>
                    <td className="table-td font-mono text-xs">{operation.client_id.slice(0, 12)}…</td>
                    <td className="table-td">{operation.entity_type.replace(/_/g, ' ')}</td>
                    <td className="table-td capitalize">{operation.operation}</td>
                    <td className="table-td"><Badge value={operation.status} /></td>
                    <td className="table-td max-w-xs truncate text-xs text-red-600">{operation.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
