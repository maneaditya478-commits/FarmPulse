import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  HeartPulse,
  MapPin,
  PawPrint,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  XCircle,
} from 'lucide-react';
import { api, apiError, fdate, fdatetime } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  AgentApproval,
  AnalyticsOverview,
  AnalyticsTrends,
  Animal,
  Appointment,
  HealthCase,
  Page,
  ScheduleItem,
  Vaccination,
  VetProfile,
} from '../lib/types';
import {
  Badge,
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
  TextInput,
  useFetch,
} from '../components/ui';
import { AnimalRow } from './farmer';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

export function VetDashboard() {
  const { user } = useAuth();
  const overview = useFetch<AnalyticsOverview>('/analytics/overview');
  const approvals = useFetch<AgentApproval[]>('/health/approvals?status=pending');
  const cases = useFetch<Page<HealthCase>>('/health/cases?page_size=6');
  const appointments = useFetch<Appointment[]>('/appointments');
  const profile = useFetch<VetProfile>('/veterinarians/me');
  const trends = useFetch<AnalyticsTrends>('/analytics/trends?days=30');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  const data = overview.data;
  const upcoming = (appointments.data || []).filter((item) => item.status === 'requested' || item.status === 'scheduled');

  const decide = async (approval: AgentApproval, decision: 'approved' | 'rejected') => {
    setBusyId(approval.id);
    setError(null);
    try {
      await api.post(`/health/approvals/${approval.id}/decision`, {
        decision,
        reason: decision === 'approved' ? 'Reviewed in the veterinary portal.' : 'Rejected after professional review.',
      });
      approvals.reload();
      cases.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const setAvailability = async (availability: string) => {
    setAvailabilityBusy(true);
    setError(null);
    try {
      await api.patch('/veterinarians/me/availability', { availability });
      profile.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setAvailabilityBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Dr. ${user?.full_name.replace(/^Dr\.?\s*/i, '') || ''}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{profile.data?.qualification || 'Veterinarian'}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.data?.district || user?.district || 'District'}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> {profile.data?.verified ? 'Verified' : 'Verification pending'}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Select
              className="!w-auto !py-2 text-xs"
              value={profile.data?.availability || 'offline'}
              disabled={availabilityBusy || !profile.data}
              onChange={(event) => setAvailability(event.target.value)}
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
            </Select>
            <Link to="/vet/cases" className="btn-primary">
              <ClipboardList className="h-4 w-4" /> Case queue
            </Link>
          </div>
        }
      />
      <SampleBanner />
      {error && <div className="mb-4"><FormError message={error} /></div>}
      {overview.error && <ErrorAlert message={overview.error} onRetry={overview.reload} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned animals" value={data?.total_animals ?? '—'} icon={<PawPrint className="h-5 w-5" />} />
        <StatCard label="Active cases" value={data?.active_health_cases ?? '—'} hint={`${data?.critical_cases ?? 0} high priority`} tone={data?.critical_cases ? 'red' : 'leaf'} icon={<HeartPulse className="h-5 w-5" />} />
        <StatCard label="Pending approvals" value={approvals.data?.length ?? '—'} tone="amber" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Upcoming visits" value={upcoming.length} tone="sky" icon={<CalendarClock className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-amber-600" /> Safety approvals
            </h2>
            <span className="text-xs text-slate-500">Human-in-the-loop gate</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            The safety agent requires professional review before any diagnosis or treatment is released as confirmed.
          </p>
          <div className="mt-3 space-y-2">
            {approvals.loading && <Spinner />}
            {!approvals.loading && (approvals.data || []).length === 0 && (
              <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">No pending approvals. All safety gates are clear.</p>
            )}
            {(approvals.data || []).map((approval) => (
              <div key={approval.id} className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {approval.agent_name.replace(/_/g, ' ')} · {approval.action.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-900">{approval.reason || 'Professional confirmation required.'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{fdatetime(approval.created_at)}</p>
                  </div>
                  <Badge value={approval.status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {approval.case_id && (
                    <Link to={`/vet/cases/${approval.case_id}`} className="text-xs font-semibold text-leaf-700 hover:underline">
                      Open case
                    </Link>
                  )}
                  <button
                    className="btn-primary !px-2.5 !py-1.5 text-xs"
                    disabled={busyId === approval.id}
                    onClick={() => decide(approval, 'approved')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    className="btn-secondary !px-2.5 !py-1.5 text-xs"
                    disabled={busyId === approval.id}
                    onClick={() => decide(approval, 'rejected')}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <CalendarClock className="h-5 w-5 text-leaf-700" /> Clinical load
            </h2>
            <Link to="/vet/appointments" className="text-xs font-semibold text-leaf-700 hover:underline">All appointments</Link>
          </div>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends.data?.health_cases || []} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2ee" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(value) => String(value).slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="total" name="Cases" fill="#66b75e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="high" name="High priority" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {upcoming.slice(0, 4).map((visit) => (
              <div key={visit.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium capitalize text-slate-800">{visit.visit_type}</p>
                  <p className="text-xs text-slate-500">{fdatetime(visit.scheduled_at || visit.requested_at)}</p>
                </div>
                <Badge value={visit.status} />
              </div>
            ))}
            {upcoming.length === 0 && <p className="text-sm text-slate-500">No upcoming visits.</p>}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Assigned cases</h2>
            <Link to="/vet/cases" className="text-xs font-semibold text-leaf-700 hover:underline">Open queue</Link>
          </div>
          <div className="mt-3 space-y-2">
            {cases.loading && <Spinner />}
            {!cases.loading && (cases.data?.items || []).length === 0 && <EmptyState title="No assigned cases" note="New farmer reports requiring veterinary review appear here." />}
            {(cases.data?.items || []).map((item) => (
              <Link key={item.id} to={`/vet/cases/${item.id}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:border-leaf-200 hover:bg-leaf-50/40">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {item.case_code} <SeverityBadge value={item.severity} />
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.symptom_summary}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.animal?.name} · {item.farmer?.full_name} · {fdatetime(item.opened_at)}</p>
                </div>
                <Badge value={item.status} />
              </Link>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Syringe className="h-5 w-5 text-leaf-700" /> Vaccination verification
            </h2>
            <Link to="/vet/vaccinations" className="text-xs font-semibold text-leaf-700 hover:underline">Open records</Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">Self-reported vaccinations require professional verification.</p>
          <VaccinationVerifyList compact />
        </section>
      </div>
    </div>
  );
}

function VaccinationVerifyList({ compact = false }: { compact?: boolean }) {
  const records = useFetch<Vaccination[]>('/vaccinations');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(
    () => (records.data || []).filter((record) => !record.verified_by).slice(0, compact ? 5 : 100),
    [records.data, compact],
  );

  const verify = async (record: Vaccination) => {
    setBusyId(record.id);
    setError(null);
    try {
      await api.post(`/vaccinations/${record.id}/verify`, { verified: true });
      records.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {error && <FormError message={error} />}
      {records.loading && <Spinner />}
      {!records.loading && rows.length === 0 && <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">All vaccination records are verified.</p>}
      {rows.map((record) => (
        <div key={record.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-slate-800">{record.vaccine?.name || 'Vaccine'}</p>
            <p className="text-xs text-slate-500">
              {record.animal?.name} · given {fdate(record.administered_on)} · batch {record.batch_no || '—'}
            </p>
          </div>
          <button className="btn-secondary !px-2.5 !py-1.5 text-xs" disabled={busyId === record.id} onClick={() => verify(record)}>
            <BadgeCheck className="h-3.5 w-3.5" /> Verify
          </button>
        </div>
      ))}
    </div>
  );
}

export function VetCases() {
  const [statusFilter, setStatusFilter] = useState('');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const cases = useFetch<Page<HealthCase>>(
    `/health/cases?page_size=100${statusFilter ? `&status=${statusFilter}` : ''}${severity ? `&severity=${severity}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`,
    [statusFilter, severity, query],
  );

  return (
    <div>
      <PageHeader
        title="Case queue"
        subtitle="Farmer reports triaged by the health agent, assigned to you with severity, observations and the AI workflow trace."
      />
      <SampleBanner />
      <form
        className="card mb-5 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Field label="Search" className="min-w-52 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Case code or symptom" />
          </div>
        </Field>
        <Field label="Status" className="min-w-40">
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="reported">Reported</option>
            <option value="triaged">Triaged</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </Select>
        </Field>
        <Field label="Severity" className="min-w-36">
          <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
        <button type="submit" className="btn-secondary">Apply</button>
      </form>

      {cases.error && <ErrorAlert message={cases.error} onRetry={cases.reload} />}
      {cases.loading ? (
        <Spinner />
      ) : (cases.data?.items || []).length === 0 ? (
        <EmptyState title="No cases match this view" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Case</th>
                <th className="table-th">Animal</th>
                <th className="table-th">Farmer</th>
                <th className="table-th">Severity</th>
                <th className="table-th">Status</th>
                <th className="table-th">Opened</th>
                <th className="table-th">Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(cases.data?.items || []).map((item) => (
                <tr key={item.id} className="hover:bg-leaf-50/40">
                  <td className="table-td">
                    <Link to={`/vet/cases/${item.id}`} className="font-semibold text-leaf-700 hover:underline">{item.case_code}</Link>
                    <p className="max-w-xs truncate text-xs text-slate-500">{item.symptom_summary}</p>
                  </td>
                  <td className="table-td">{item.animal?.name || '—'}<span className="block text-xs text-slate-500">{item.animal?.tag_code}</span></td>
                  <td className="table-td">{item.farmer?.full_name || '—'}</td>
                  <td className="table-td"><SeverityBadge value={item.severity} /></td>
                  <td className="table-td"><Badge value={item.status} /></td>
                  <td className="table-td">{fdatetime(item.opened_at)}</td>
                  <td className="table-td">
                    {item.approved_at ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-leaf-700"><ShieldCheck className="h-3.5 w-3.5" /> Confirmed</span>
                    ) : (
                      <span className="text-xs text-amber-700">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function VetAppointments() {
  const appointments = useFetch<Appointment[]>('/appointments');
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState({ status: 'scheduled', scheduled_at: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (visit: Appointment) => {
    setEditing(visit);
    setForm({
      status: visit.status,
      scheduled_at: visit.scheduled_at ? new Date(visit.scheduled_at).toISOString().slice(0, 16) : '',
      notes: visit.notes || '',
    });
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/appointments/${editing.id}`, {
        status: form.status,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
        notes: form.notes || undefined,
      });
      setEditing(null);
      appointments.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Teleconsultation and on-site visit requests created by the veterinary coordination agent or the farmer." />
      <SampleBanner />
      {appointments.error && <ErrorAlert message={appointments.error} onRetry={appointments.reload} />}
      {appointments.loading ? (
        <Spinner />
      ) : (appointments.data || []).length === 0 ? (
        <EmptyState title="No appointments" note="Requests appear here when a case is escalated or assigned." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(appointments.data || []).map((visit) => (
            <div key={visit.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold capitalize text-slate-900">
                    {visit.visit_type === 'onsite' ? <MapPin className="h-4 w-4 text-leaf-700" /> : <Stethoscope className="h-4 w-4 text-leaf-700" />}
                    {visit.visit_type} consultation
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Case {visit.case_id.slice(0, 8)} · requested {fdatetime(visit.requested_at)}</p>
                  {visit.scheduled_at && <p className="text-xs font-semibold text-leaf-800">Scheduled {fdatetime(visit.scheduled_at)}</p>}
                  {visit.location && <p className="text-xs text-slate-500">{visit.location}</p>}
                  {visit.notes && <p className="mt-1 text-xs text-slate-600">{visit.notes}</p>}
                </div>
                <Badge value={visit.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/vet/cases/${visit.case_id}`} className="btn-secondary !px-2.5 !py-1.5 text-xs">Open case</Link>
                <button className="btn-primary !px-2.5 !py-1.5 text-xs" onClick={() => open(visit)}>
                  <Clock className="h-3.5 w-3.5" /> Update
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Update appointment" width="max-w-lg">
        <form className="space-y-4" onSubmit={save}>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="requested">Requested</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Scheduled at">
            <TextInput type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm((prev) => ({ ...prev, scheduled_at: event.target.value }))} />
          </Field>
          <Field label="Notes">
            <textarea className="input min-h-20" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <SubmitButton type="submit" loading={busy}><ClipboardCheck className="h-4 w-4" /> Save</SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function VetAnimals() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const animals = useFetch<Page<Animal>>(`/animals?page_size=100${query ? `&q=${encodeURIComponent(query)}` : ''}`, [query]);

  return (
    <div>
      <PageHeader title="Animals under care" subtitle="Animals linked to cases assigned to you, with health timelines and vaccination records." />
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
        <EmptyState title="No animals accessible" note="Animals appear once a case is assigned to you." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(animals.data?.items || []).map((animal) => (
            <AnimalRow key={animal.id} animal={animal} to={`/vet/animals/${animal.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function VetVaccinations() {
  const schedule = useFetch<ScheduleItem[]>('/vaccinations/schedule?within_days=60');
  const overdue = useFetch<ScheduleItem[]>('/vaccinations/overdue');

  return (
    <div>
      <PageHeader title="Vaccination records" subtitle="Verify self-reported vaccinations and review verified protocol schedules." />
      <SampleBanner />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Due in 60 days" value={schedule.data?.length ?? '—'} icon={<Syringe className="h-5 w-5" />} />
        <StatCard label="Overdue" value={overdue.data?.length ?? '—'} tone="red" icon={<Activity className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <ClipboardCheck className="h-5 w-5 text-leaf-700" /> Awaiting verification
          </h2>
          <VaccinationVerifyList />
        </section>
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Due schedule</h2>
          <div className="mt-3 space-y-2">
            {schedule.loading && <Spinner />}
            {(schedule.data || []).slice(0, 12).map((item) => (
              <div key={`${item.animal_id}-${item.vaccine_id}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{item.vaccine_name}</p>
                  <p className="text-xs text-slate-500">{item.animal_name} · {fdate(item.due_on)}</p>
                </div>
                <Badge value={item.status} />
              </div>
            ))}
            {(schedule.data || []).length === 0 && !schedule.loading && <p className="text-sm text-slate-500">No upcoming vaccinations.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
