import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  Droplets,
  Leaf,
  Plus,
  ShieldCheck,
  Sprout,
  Sun,
  Syringe,
  Thermometer,
  Wheat,
  Wind,
} from 'lucide-react';
import { api, apiError, fdate, fdatetime } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  Animal,
  EnvironmentAlerts,
  EnvironmentRecord,
  FeedRecord,
  NutritionProfile,
  NutritionSummary,
  Page,
  ScheduleItem,
  Species,
  Vaccination,
  VaccinationCatalogItem,
  WaterRecord,
  Weather,
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

function animalLabel(animal: Animal) {
  return `${animal.name} (${animal.tag_code})`;
}

export function VaccinationsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'schedule' | 'records' | 'overdue'>('schedule');
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<{ animalId?: string; vaccineId?: string }>({});
  const schedule = useFetch<ScheduleItem[]>('/vaccinations/schedule?within_days=60');
  const overdue = useFetch<ScheduleItem[]>('/vaccinations/overdue');
  const records = useFetch<Vaccination[]>('/vaccinations');
  const animals = useFetch<Page<Animal>>('/animals?page_size=100');
  const catalog = useFetch<VaccinationCatalogItem[]>('/vaccinations/catalog');

  const openForm = (animalId?: string, vaccineId?: string) => {
    setPreset({ animalId, vaccineId });
    setOpen(true);
  };

  const dueSoon = useMemo(() => (schedule.data || []).filter((item) => item.status !== 'overdue'), [schedule.data]);

  return (
    <div>
      <PageHeader
        title="Vaccination management"
        subtitle="Schedules generated from the verified protocol catalogue. Farmers may record a vaccination; only veterinary professionals can verify it."
        actions={
          <button className="btn-primary" onClick={() => openForm()}>
            <Plus className="h-4 w-4" /> Record vaccination
          </button>
        }
      />
      <SampleBanner />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Due in 60 days" value={dueSoon.length} icon={<Syringe className="h-5 w-5" />} />
        <StatCard label="Overdue" value={overdue.data?.length ?? 0} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard
          label="Completed records"
          value={(records.data || []).filter((item) => item.status === 'completed' || item.status === 'given').length}
          tone="sky"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      {(schedule.error || records.error || overdue.error) && (
        <div className="mt-5">
          <ErrorAlert
            message={schedule.error || records.error || overdue.error || ''}
            onRetry={() => {
              schedule.reload();
              records.reload();
              overdue.reload();
            }}
          />
        </div>
      )}

      <div className="card mt-5 p-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'schedule', label: 'Upcoming schedule' },
            { key: 'overdue', label: `Overdue (${overdue.data?.length ?? 0})` },
            { key: 'records', label: 'All records' },
          ]}
        />

        {tab === 'schedule' && (
          <div className="overflow-x-auto">
            {schedule.loading ? (
              <Spinner />
            ) : (schedule.data || []).length === 0 ? (
              <EmptyState title="No vaccinations due in the next 60 days" />
            ) : (
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Animal</th>
                    <th className="table-th">Vaccine</th>
                    <th className="table-th">Disease</th>
                    <th className="table-th">Due</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Verified reference</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(schedule.data || []).map((item) => (
                    <tr key={`${item.animal_id}-${item.vaccine_id}`}>
                      <td className="table-td font-medium">{item.animal_name}</td>
                      <td className="table-td">{item.vaccine_name}</td>
                      <td className="table-td">{item.disease}</td>
                      <td className="table-td">
                        {fdate(item.due_on)}
                        <span className="ml-2 text-xs text-slate-400">
                          {item.days_until != null ? (item.days_until < 0 ? `${Math.abs(item.days_until)}d late` : `in ${item.days_until}d`) : ''}
                        </span>
                      </td>
                      <td className="table-td"><Badge value={item.status} /></td>
                      <td className="table-td max-w-xs text-xs text-slate-500">{item.source_reference}</td>
                      <td className="table-td">
                        <button className="btn-secondary !px-2.5 !py-1.5 text-xs" onClick={() => openForm(item.animal_id, item.vaccine_id)}>
                          Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'overdue' && (
          <div className="space-y-2">
            {overdue.loading && <Spinner />}
            {(overdue.data || []).length === 0 && <EmptyState title="No overdue vaccinations" note="All scheduled vaccinations are within their due window." />}
            {(overdue.data || []).map((item) => (
              <div key={`${item.animal_id}-${item.vaccine_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50/50 px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {item.vaccine_name} — {item.animal_name}
                  </p>
                  <p className="text-xs text-red-700">
                    Due {fdate(item.due_on)} · {Math.abs(item.days_until ?? 0)} days overdue
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.source_reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge value="overdue" />
                  <button className="btn-primary !px-2.5 !py-1.5 text-xs" onClick={() => openForm(item.animal_id, item.vaccine_id)}>
                    Record
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'records' && (
          <div className="overflow-x-auto">
            {records.loading ? (
              <Spinner />
            ) : (records.data || []).length === 0 ? (
              <EmptyState title="No vaccination records yet" />
            ) : (
              <table className="w-full min-w-[820px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">Animal</th>
                    <th className="table-th">Vaccine</th>
                    <th className="table-th">Given</th>
                    <th className="table-th">Due</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Batch / certificate</th>
                    <th className="table-th">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(records.data || []).map((record) => (
                    <tr key={record.id}>
                      <td className="table-td font-medium">{record.animal?.name || '—'}</td>
                      <td className="table-td">
                        {record.vaccine?.name || '—'}
                        {record.is_sample && <span className="ml-2"><DemoBadge /></span>}
                      </td>
                      <td className="table-td">{fdate(record.administered_on)}</td>
                      <td className="table-td">{fdate(record.due_on)}</td>
                      <td className="table-td"><Badge value={record.status} /></td>
                      <td className="table-td text-xs text-slate-500">
                        {record.batch_no || '—'}
                        {record.certificate_ref ? ` · ${record.certificate_ref}` : ''}
                      </td>
                      <td className="table-td">
                        {record.verified_by ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-leaf-700">
                            <ShieldCheck className="h-3.5 w-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Self-reported</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <VaccinationForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          records.reload();
          schedule.reload();
          overdue.reload();
        }}
        preset={preset}
        animals={animals.data?.items || []}
        catalog={catalog.data || []}
        canVerify={user?.role === 'veterinarian' || user?.role === 'paravet'}
      />
    </div>
  );
}

function VaccinationForm({
  open,
  onClose,
  onSaved,
  preset,
  animals,
  catalog,
  canVerify,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  preset: { animalId?: string; vaccineId?: string };
  animals: Animal[];
  catalog: VaccinationCatalogItem[];
  canVerify: boolean;
}) {
  const [animalId, setAnimalId] = useState(preset.animalId || '');
  const [vaccineId, setVaccineId] = useState(preset.vaccineId || '');
  const [form, setForm] = useState({ administered_on: new Date().toISOString().slice(0, 10), due_on: '', batch_no: '', administered_by: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animal = animals.find((item) => item.id === animalId);
  const filteredCatalog = animal ? catalog.filter((item) => item.species_id === animal.species.id) : catalog;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/vaccinations', {
        animal_id: animalId,
        vaccine_id: vaccineId,
        administered_on: form.administered_on || undefined,
        due_on: form.due_on || undefined,
        batch_no: form.batch_no || undefined,
        administered_by: form.administered_by || undefined,
        notes: form.notes || undefined,
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
    <Modal open={open} onClose={onClose} title="Record a vaccination">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Animal">
          <Select required value={animalId} onChange={(event) => { setAnimalId(event.target.value); setVaccineId(''); }}>
            <option value="">Select animal</option>
            {animals.map((item) => (
              <option key={item.id} value={item.id}>
                {animalLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vaccine" hint="Only verified catalogue entries are available for the selected species.">
          <Select required value={vaccineId} onChange={(event) => setVaccineId(event.target.value)} disabled={!animalId}>
            <option value="">Select vaccine</option>
            {filteredCatalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.disease}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Administered on">
            <TextInput type="date" value={form.administered_on} onChange={(event) => setForm((prev) => ({ ...prev, administered_on: event.target.value }))} />
          </Field>
          <Field label="Next due">
            <TextInput type="date" value={form.due_on} onChange={(event) => setForm((prev) => ({ ...prev, due_on: event.target.value }))} />
          </Field>
          <Field label="Batch number">
            <TextInput value={form.batch_no} onChange={(event) => setForm((prev) => ({ ...prev, batch_no: event.target.value }))} />
          </Field>
          <Field label="Administered by">
            <TextInput value={form.administered_by} onChange={(event) => setForm((prev) => ({ ...prev, administered_by: event.target.value }))} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
        </Field>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Farmer-entered vaccinations are marked self-reported. {canVerify ? 'You can verify a record from the veterinary portal.' : 'A veterinary professional must verify this record.'}
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <SubmitButton type="submit" loading={busy}>
            <ClipboardCheck className="h-4 w-4" /> Save record
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function NutritionPage() {
  const summary = useFetch<NutritionSummary>('/nutrition/summary');
  const feeds = useFetch<FeedRecord[]>('/nutrition/feed?days=14');
  const waters = useFetch<WaterRecord[]>('/nutrition/water?days=14');
  const animals = useFetch<Page<Animal>>('/animals?page_size=100');
  const profiles = useFetch<NutritionProfile[]>('/nutrition/profiles');
  const [feedForm, setFeedForm] = useState({ animal_id: '', feed_type: '', quantity_kg: '', mineral_supplement: '', cost: '', notes: '' });
  const [waterForm, setWaterForm] = useState({ animal_id: '', litres: '', source: '', quality_note: '' });
  const [feedBusy, setFeedBusy] = useState(false);
  const [waterBusy, setWaterBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);

  const submitFeed = async (event: FormEvent) => {
    event.preventDefault();
    setFeedBusy(true);
    setFeedError(null);
    try {
      await api.post('/nutrition/feed', {
        animal_id: feedForm.animal_id,
        feed_type: feedForm.feed_type,
        quantity_kg: Number(feedForm.quantity_kg),
        mineral_supplement: feedForm.mineral_supplement || undefined,
        cost: feedForm.cost ? Number(feedForm.cost) : undefined,
        notes: feedForm.notes || undefined,
      });
      setFeedForm({ animal_id: '', feed_type: '', quantity_kg: '', mineral_supplement: '', cost: '', notes: '' });
      feeds.reload();
      summary.reload();
    } catch (err) {
      setFeedError(apiError(err));
    } finally {
      setFeedBusy(false);
    }
  };

  const submitWater = async (event: FormEvent) => {
    event.preventDefault();
    setWaterBusy(true);
    setWaterError(null);
    try {
      await api.post('/nutrition/water', {
        animal_id: waterForm.animal_id,
        litres: waterForm.litres ? Number(waterForm.litres) : undefined,
        source: waterForm.source || undefined,
        quality_note: waterForm.quality_note || undefined,
      });
      setWaterForm({ animal_id: '', litres: '', source: '', quality_note: '' });
      waters.reload();
      summary.reload();
    } catch (err) {
      setWaterError(apiError(err));
    } finally {
      setWaterBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Nutrition & water"
        subtitle="Track feed, minerals and water. Species guidance cites its reference source; dietary changes are referred to professionals."
      />
      <SampleBanner />
      {summary.error && <ErrorAlert message={summary.error} onRetry={summary.reload} />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Feed records (14d)" value={summary.data?.feed_records_14d ?? '—'} icon={<Wheat className="h-5 w-5" />} />
        <StatCard label="Feed quantity" value={`${summary.data?.feed_quantity_kg_14d ?? 0} kg`} tone="amber" icon={<Sprout className="h-5 w-5" />} />
        <StatCard label="Feed cost" value={`₹${summary.data?.feed_cost_14d ?? 0}`} tone="slate" icon={<Leaf className="h-5 w-5" />} />
        <StatCard label="Water observed" value={`${summary.data?.water_litres_14d ?? 0} L`} tone="sky" icon={<Droplets className="h-5 w-5" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Record feed</h2>
          <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={submitFeed}>
            <Field label="Animal">
              <Select required value={feedForm.animal_id} onChange={(event) => setFeedForm((prev) => ({ ...prev, animal_id: event.target.value }))}>
                <option value="">Select animal</option>
                {(animals.data?.items || []).map((animal) => (
                  <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Feed type">
              <TextInput required value={feedForm.feed_type} onChange={(event) => setFeedForm((prev) => ({ ...prev, feed_type: event.target.value }))} placeholder="e.g. Green fodder, concentrate" />
            </Field>
            <Field label="Quantity (kg)">
              <TextInput required type="number" min="0.01" step="0.01" value={feedForm.quantity_kg} onChange={(event) => setFeedForm((prev) => ({ ...prev, quantity_kg: event.target.value }))} />
            </Field>
            <Field label="Mineral supplement">
              <TextInput value={feedForm.mineral_supplement} onChange={(event) => setFeedForm((prev) => ({ ...prev, mineral_supplement: event.target.value }))} />
            </Field>
            <Field label="Cost (₹)">
              <TextInput type="number" min="0" step="0.01" value={feedForm.cost} onChange={(event) => setFeedForm((prev) => ({ ...prev, cost: event.target.value }))} />
            </Field>
            <Field label="Notes">
              <TextInput value={feedForm.notes} onChange={(event) => setFeedForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <FormError message={feedError} />
              <SubmitButton type="submit" loading={feedBusy}>
                <Wheat className="h-4 w-4" /> Save feed record
              </SubmitButton>
            </div>
          </form>

          <h2 className="mt-7 text-base font-bold text-slate-900">Record water</h2>
          <form className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={submitWater}>
            <Field label="Animal">
              <Select required value={waterForm.animal_id} onChange={(event) => setWaterForm((prev) => ({ ...prev, animal_id: event.target.value }))}>
                <option value="">Select animal</option>
                {(animals.data?.items || []).map((animal) => (
                  <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Litres">
              <TextInput type="number" min="0" step="0.1" value={waterForm.litres} onChange={(event) => setWaterForm((prev) => ({ ...prev, litres: event.target.value }))} />
            </Field>
            <Field label="Source">
              <TextInput value={waterForm.source} onChange={(event) => setWaterForm((prev) => ({ ...prev, source: event.target.value }))} placeholder="Borewell, trough, canal" />
            </Field>
            <Field label="Quality note">
              <TextInput value={waterForm.quality_note} onChange={(event) => setWaterForm((prev) => ({ ...prev, quality_note: event.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <FormError message={waterError} />
              <SubmitButton type="submit" loading={waterBusy}>
                <Droplets className="h-4 w-4" /> Save water record
              </SubmitButton>
            </div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Leaf className="h-5 w-5 text-leaf-700" /> Guidance
            </h2>
            {summary.loading && <Spinner />}
            {summary.data?.profile ? (
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <KeyValue label="Stage">{summary.data.profile.stage}</KeyValue>
                  <KeyValue label="Dry matter">{summary.data.profile.dry_matter_kg ? `${summary.data.profile.dry_matter_kg} kg/day` : '—'}</KeyValue>
                  <KeyValue label="Water">{summary.data.profile.water_litres ? `${summary.data.profile.water_litres} L/day` : '—'}</KeyValue>
                  <KeyValue label="Minerals">{summary.data.profile.minerals || '—'}</KeyValue>
                </div>
                <p className="mt-2 rounded-xl bg-leaf-50 px-3 py-2 text-sm text-leaf-900">{summary.data.profile.feed_guidance}</p>
                <p className="mt-2 text-[11px] text-slate-500">Reference: {summary.data.profile.reference_source}</p>
              </div>
            ) : (
              !summary.loading && <p className="mt-2 text-sm text-slate-500">Add an animal to load species guidance.</p>
            )}
            {(summary.data?.gaps || []).length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Data gaps</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
                  {(summary.data?.gaps || []).map((gap) => <li key={gap}>{gap}</li>)}
                </ul>
              </div>
            )}
            {summary.data?.referral && <p className="mt-3 text-xs leading-relaxed text-slate-500">{summary.data.referral}</p>}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Species profiles</h2>
            <div className="mt-3 space-y-2">
              {profiles.loading && <Spinner />}
              {(profiles.data || []).slice(0, 6).map((profile) => {
                const species = animals.data?.items.find((animal) => animal.species.id === profile.species_id)?.species;
                return (
                  <div key={profile.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-800">{species?.name_en || 'Species'} · <span className="capitalize">{profile.stage}</span></p>
                    <p className="text-xs text-slate-500">{profile.feed_guidance}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Recent feed records</h2>
          <div className="mt-3 space-y-2">
            {feeds.loading && <Spinner />}
            {(feeds.data || []).length === 0 && !feeds.loading && <EmptyState title="No feed records in the last 14 days" />}
            {(feeds.data || []).map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{record.feed_type}</p>
                  <p className="text-xs text-slate-500">
                    {fdatetime(record.recorded_at)}
                    {record.mineral_supplement ? ` · ${record.mineral_supplement}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{record.quantity_kg} kg</p>
                  {record.cost != null && <p className="text-xs text-slate-500">₹{record.cost}</p>}
                  {record.is_sample && <DemoBadge />}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Recent water observations</h2>
          <div className="mt-3 space-y-2">
            {waters.loading && <Spinner />}
            {(waters.data || []).length === 0 && !waters.loading && <EmptyState title="No water records in the last 14 days" />}
            {(waters.data || []).map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{record.source || 'Water observation'}</p>
                  <p className="text-xs text-slate-500">{fdatetime(record.recorded_at)}</p>
                  {record.quality_note && <p className="text-xs text-slate-500">{record.quality_note}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{record.litres != null ? `${record.litres} L` : '—'}</p>
                  {record.is_sample && <DemoBadge />}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function EnvironmentPage() {
  const alerts = useFetch<EnvironmentAlerts>('/environment/alerts');
  const records = useFetch<EnvironmentRecord[]>('/environment/records?days=14');
  const [form, setForm] = useState({
    temperature_c: '',
    humidity_pct: '',
    weather: '',
    shed_cleanliness: '',
    water_available: '',
    sanitation_note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weather: Weather | undefined = alerts.data?.weather;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/environment/records', {
        temperature_c: form.temperature_c ? Number(form.temperature_c) : undefined,
        humidity_pct: form.humidity_pct ? Number(form.humidity_pct) : undefined,
        weather: form.weather || undefined,
        shed_cleanliness: form.shed_cleanliness ? Number(form.shed_cleanliness) : undefined,
        water_available: form.water_available === '' ? undefined : form.water_available === 'true',
        sanitation_note: form.sanitation_note || undefined,
      });
      setForm({ temperature_c: '', humidity_pct: '', weather: '', shed_cleanliness: '', water_available: '', sanitation_note: '' });
      alerts.reload();
      records.reload();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Environmental monitoring"
        subtitle="Farm observations combine with live Open-Meteo weather. Risks are threshold rules — never a disease diagnosis."
      />
      <SampleBanner />
      {alerts.error && <ErrorAlert message={alerts.error} onRetry={alerts.reload} />}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="bg-gradient-to-br from-sky-600 to-leaf-700 p-5 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <CloudSun className="h-5 w-5" /> Live weather
                  </p>
                  <p className="mt-1 text-xs text-sky-100">{weather?.location || 'Farm location'} · {weather?.source || 'Open-Meteo'}</p>
                  {weather?.available ? (
                    <p className="mt-3 text-4xl font-bold">{weather.temperature_c ?? '—'}°C</p>
                  ) : (
                    <p className="mt-3 text-sm text-sky-100">{weather?.note || 'Live weather unavailable; farm observations still apply.'}</p>
                  )}
                  <p className="mt-1 text-sm capitalize text-sky-100">{weather?.weather || ''}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <Sun className="h-8 w-8" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-sky-100">Humidity</p>
                  <p className="mt-0.5 text-base font-bold">{weather?.humidity_pct ?? '—'}%</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-sky-100">Wind</p>
                  <p className="mt-0.5 text-base font-bold">{weather?.wind_kmh ?? '—'} km/h</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <p className="text-sky-100">Forecast days</p>
                  <p className="mt-0.5 text-base font-bold">{weather?.forecast?.length ?? 0}</p>
                </div>
              </div>
            </div>
            {(weather?.forecast || []).length > 0 && (
              <div className="flex gap-2 overflow-x-auto p-4">
                {(weather?.forecast || []).map((day) => (
                  <div key={day.date} className="min-w-24 rounded-xl border border-slate-100 px-3 py-2 text-center text-xs">
                    <p className="font-semibold text-slate-700">{fdate(day.date)}</p>
                    <p className="mt-1 text-slate-900">{day.temp_max ?? '—'}° / {day.temp_min ?? '—'}°</p>
                    <p className="text-slate-500">{day.precipitation_mm ?? 0} mm</p>
                  </div>
                ))}
              </div>
            )}
            <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">Source: {weather?.source}. Live values are not proof of disease or welfare status.</p>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Risk flags
            </h2>
            <div className="mt-3 space-y-2">
              {alerts.loading && <Spinner />}
              {(alerts.data?.flags || []).length === 0 && !alerts.loading && (
                <p className="rounded-xl bg-leaf-50 px-3 py-3 text-sm text-leaf-800">No environmental risk flags from the latest observation and live weather.</p>
              )}
              {(alerts.data?.flags || []).map((flag) => (
                <div key={flag.code} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
                  flag.severity === 'high' || flag.severity === 'critical' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'
                }`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{flag.message}</p>
                    <p className="text-[11px] opacity-70">{flag.code}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{alerts.data?.disclaimer}</p>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Record a farm observation</h2>
            <form className="mt-3 space-y-4" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Temperature (°C)">
                  <div className="relative">
                    <Thermometer className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <TextInput type="number" step="0.1" className="pl-9" value={form.temperature_c} onChange={(event) => setForm((prev) => ({ ...prev, temperature_c: event.target.value }))} />
                  </div>
                </Field>
                <Field label="Humidity (%)">
                  <div className="relative">
                    <Droplets className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <TextInput type="number" min="0" max="100" className="pl-9" value={form.humidity_pct} onChange={(event) => setForm((prev) => ({ ...prev, humidity_pct: event.target.value }))} />
                  </div>
                </Field>
                <Field label="Weather">
                  <TextInput value={form.weather} onChange={(event) => setForm((prev) => ({ ...prev, weather: event.target.value }))} placeholder="Sunny, humid, rainy" />
                </Field>
                <Field label="Shed cleanliness (1–5)">
                  <Select value={form.shed_cleanliness} onChange={(event) => setForm((prev) => ({ ...prev, shed_cleanliness: event.target.value }))}>
                    <option value="">Not recorded</option>
                    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Water available">
                  <Select value={form.water_available} onChange={(event) => setForm((prev) => ({ ...prev, water_available: event.target.value }))}>
                    <option value="">Not recorded</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Select>
                </Field>
              </div>
              <Field label="Sanitation note">
                <textarea className="input min-h-20" value={form.sanitation_note} onChange={(event) => setForm((prev) => ({ ...prev, sanitation_note: event.target.value }))} />
              </Field>
              <FormError message={error} />
              <SubmitButton type="submit" loading={busy}>Save observation</SubmitButton>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Recent observations</h2>
            <div className="mt-3 space-y-2">
              {records.loading && <Spinner />}
              {records.error && <ErrorAlert message={records.error} onRetry={records.reload} />}
              {(records.data || []).length === 0 && !records.loading && <EmptyState title="No observations recorded" />}
              {(records.data || []).map((record) => (
                <div key={record.id} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">
                      {record.temperature_c != null ? `${record.temperature_c}°C` : '—'} · {record.humidity_pct != null ? `${record.humidity_pct}%` : '—'}
                    </p>
                    <span className="text-xs text-slate-500">{fdatetime(record.recorded_at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {record.weather || 'Weather not recorded'} · cleanliness {record.shed_cleanliness ?? '—'}/5 · water {record.water_available == null ? '—' : record.water_available ? 'yes' : 'no'}
                  </p>
                  {record.sanitation_note && <p className="mt-1 text-xs text-slate-500">{record.sanitation_note}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{record.source}</span>
                    {record.is_sample && <DemoBadge />}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
