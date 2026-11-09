export type Lang = 'en' | 'hi' | 'mr';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  full_name: string;
  role: string;
  language: Lang | string;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  is_active: boolean;
  is_sample: boolean;
}

export interface Farm {
  id: string;
  name: string;
  village: string;
  district: string;
  state: string;
  latitude?: number | null;
  longitude?: number | null;
  is_sample: boolean;
}

export interface Species {
  id: string;
  code: string;
  name_en: string;
  name_hi: string;
  name_mr: string;
  icon: string;
}

export interface Breed {
  id: string;
  species_id: string;
  name: string;
}

export interface Identifier {
  id: string;
  identifier_type: string;
  identifier_value: string;
  qr_payload?: string | null;
}

export interface Animal {
  id: string;
  farm_id: string;
  name: string;
  tag_code: string;
  sex: string;
  birth_date?: string | null;
  age_months?: number | null;
  weight_kg?: number | null;
  color?: string | null;
  photo_url?: string | null;
  status: string;
  notes?: string | null;
  is_sample: boolean;
  created_at: string;
  species: Species;
  breed?: Breed | null;
  identifiers?: Identifier[];
}

export interface Observation {
  id: string;
  observed_at: string;
  appetite?: string | null;
  temperature_c?: number | null;
  milk_change?: string | null;
  symptoms?: string[] | null;
  notes?: string | null;
  source: string;
}

export interface HealthCase {
  id: string;
  case_code: string;
  animal_id: string;
  symptom_summary: string;
  severity: string;
  status: string;
  requires_vet: boolean;
  escalation_reason?: string | null;
  triage?: Record<string, unknown> | null;
  vet_diagnosis?: string | null;
  vet_treatment?: string | null;
  opened_at: string;
  is_sample: boolean;
  animal?: { id: string; name: string; tag_code: string; species_code?: string; photo_url?: string | null } | null;
  observations?: Observation[];
}

export interface HealthReportResponse {
  case?: HealthCase | null;
  triage: Record<string, unknown>;
  response_text: string;
  agents_used: string[];
  escalated: boolean;
  appointment_id?: string | null;
  interaction_id: string;
}

export interface QRResponse {
  animal_id: string;
  identifier_value: string;
  qr_payload: string;
  issued_at: string;
}

export interface VaccinationScheduleItem {
  animal_id: string;
  animal_name: string;
  vaccine_id: string;
  vaccine_name: string;
  disease: string;
  due_on?: string | null;
  status: string;
  days_until?: number | null;
  source_reference: string;
  note?: string | null;
}

export interface AIResponse {
  interaction_id: string;
  session_id: string;
  language: string;
  intent: string;
  response_text: string;
  agents_used: string[];
  escalated: boolean;
  case_id?: string | null;
  appointment_id?: string | null;
  llm_provider: string;
  latency_ms: number;
}

export interface NearbyVet {
  vet_id: string;
  name?: string | null;
  qualification?: string | null;
  clinic_name?: string | null;
  district?: string | null;
  distance_km?: number | null;
  availability?: string | null;
  verified: boolean;
  phone?: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  read_at?: string | null;
  created_at: string;
}

export interface SyncResult {
  idempotency_key: string;
  entity_type: string;
  entity_id: string;
  status: 'applied' | 'duplicate' | 'conflict' | 'error';
  message?: string | null;
}

export interface SyncBatchResponse {
  client_id: string;
  results: SyncResult[];
  applied: number;
  duplicates: number;
  conflicts: number;
  errors: number;
}

export interface PendingOperation {
  id: string;
  client_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  idempotency_key: string;
  payload: string;
  created_at: string;
  status: 'pending' | 'error' | 'conflict';
  message?: string | null;
  attempts: number;
}

export interface AnalyticsOverview {
  total_animals: number;
  active_health_cases: number;
  critical_cases: number;
  upcoming_vaccinations: number;
  overdue_vaccinations: number;
  milk_litres_30d: number;
  egg_count_30d: number;
  alerts: { severity?: string; title?: string; message?: string }[];
}
