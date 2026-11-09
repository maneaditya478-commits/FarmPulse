export type Role = 'farmer' | 'veterinarian' | 'paravet' | 'cooperative' | 'admin';

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  full_name: string;
  role: Role;
  language: 'en' | 'hi' | 'mr' | string;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_sample: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface Farm {
  id: string;
  owner_id: string;
  name: string;
  village: string;
  district: string;
  state: string;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  size_acres?: number | null;
  is_sample: boolean;
}

export interface Species {
  id: string;
  code: string;
  name_en: string;
  name_hi: string;
  name_mr: string;
  icon: string;
  milk_bearing: boolean;
  egg_bearing: boolean;
  profile?: Record<string, unknown> | null;
}

export interface Breed {
  id: string;
  species_id: string;
  name: string;
  purpose?: string | null;
  origin?: string | null;
}

export interface AnimalIdentifier {
  id: string;
  animal_id: string;
  identifier_type: string;
  identifier_value: string;
  qr_payload?: string | null;
  issued_at: string;
  is_active: boolean;
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
  identifiers: AnimalIdentifier[];
}

export interface AnimalBrief {
  id: string;
  name: string;
  tag_code: string;
  species_code?: string;
  photo_url?: string | null;
}

export interface Observation {
  id: string;
  observed_at: string;
  appetite?: string | null;
  temperature_c?: number | null;
  milk_change?: string | null;
  symptoms?: string[] | null;
  photo_url?: string | null;
  notes?: string | null;
  source: string;
}

export interface VetBrief {
  id: string;
  registration_no: string;
  qualification: string;
  clinic_name?: string | null;
  user?: { id: string; full_name: string; role: string } | null;
}

export interface Visit {
  id: string;
  case_id: string;
  vet_id: string;
  visit_type: string;
  status: string;
  requested_at: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  location?: string | null;
  notes?: string | null;
  vet?: VetBrief | null;
}

export interface HealthCase {
  id: string;
  case_code: string;
  animal_id: string;
  farmer_id: string;
  symptom_summary: string;
  severity: string;
  status: string;
  requires_vet: boolean;
  escalation_reason?: string | null;
  triage?: Record<string, unknown> | null;
  assigned_vet_id?: string | null;
  vet_diagnosis?: string | null;
  vet_treatment?: string | null;
  vet_notes?: string | null;
  approved_at?: string | null;
  opened_at: string;
  resolved_at?: string | null;
  is_sample: boolean;
  animal?: AnimalBrief | null;
  farmer?: { id: string; full_name: string; role: string } | null;
  observations: Observation[];
  visits: Visit[];
}

export interface HealthReportResponse {
  case: HealthCase | null;
  triage: {
    severity?: string;
    requires_vet?: boolean;
    symptoms?: string[];
    advice?: string[];
    reasons?: string[];
    duration_days?: number;
    [key: string]: unknown;
  };
  response_text: string;
  agents_used: string[];
  escalated: boolean;
  appointment_id?: string | null;
  interaction_id: string;
  data: Record<string, unknown>;
}

export interface Vaccination {
  id: string;
  animal_id: string;
  vaccine_id: string;
  administered_on?: string | null;
  due_on: string;
  status: string;
  batch_no?: string | null;
  administered_by?: string | null;
  verified_by?: string | null;
  certificate_ref?: string | null;
  notes?: string | null;
  is_sample: boolean;
  animal?: AnimalBrief | null;
  vaccine?: { id: string; name: string; disease: string; source_reference: string } | null;
}

export interface VaccinationCatalogItem {
  id: string;
  species_id: string;
  name: string;
  disease: string;
  age_weeks: number;
  booster_days?: number | null;
  source_reference: string;
  is_verified: boolean;
  notes?: string | null;
}

export interface ScheduleItem {
  animal_id: string;
  animal_name: string;
  vaccine_id: string;
  vaccine_name: string;
  disease: string;
  due_on: string;
  status: string;
  days_until: number;
  source_reference: string;
  note?: string | null;
}

export interface NutritionProfile {
  id: string;
  species_id: string;
  stage: string;
  dry_matter_kg?: number | null;
  feed_guidance: string;
  water_litres?: number | null;
  minerals?: string | null;
  reference_source: string;
}

export interface FeedRecord {
  id: string;
  animal_id: string;
  recorded_at: string;
  feed_type: string;
  quantity_kg: number;
  mineral_supplement?: string | null;
  cost?: number | null;
  notes?: string | null;
  is_sample: boolean;
}

export interface WaterRecord {
  id: string;
  animal_id: string;
  recorded_at: string;
  litres?: number | null;
  source?: string | null;
  quality_note?: string | null;
  is_sample: boolean;
}

export interface NutritionSummary {
  animals: number;
  feed_records_14d: number;
  feed_quantity_kg_14d: number;
  feed_cost_14d: number;
  water_records_14d: number;
  water_litres_14d: number;
  profile: NutritionProfile | null;
  gaps: string[];
  referral: string;
}

export interface EnvironmentRecord {
  id: string;
  farm_id: string;
  recorded_at: string;
  temperature_c?: number | null;
  humidity_pct?: number | null;
  weather?: string | null;
  shed_cleanliness?: number | null;
  water_available?: boolean | null;
  sanitation_note?: string | null;
  risk_flags?: { code: string; severity: string; message: string }[] | null;
  source: string;
  is_sample: boolean;
}

export interface Weather {
  available: boolean;
  source: string;
  location: string;
  temperature_c?: number | null;
  humidity_pct?: number | null;
  weather?: string | null;
  wind_kmh?: number | null;
  forecast: {
    date: string;
    temp_max?: number | null;
    temp_min?: number | null;
    humidity?: number | null;
    precipitation_mm?: number | null;
  }[];
  note?: string | null;
}

export interface EnvironmentAlerts {
  flags: { code: string; severity: string; message: string }[];
  latest_observation: EnvironmentRecord | null;
  weather: Weather;
  disclaimer: string;
}

export interface MarketPrice {
  id: string;
  category: string;
  breed?: string | null;
  district: string;
  state: string;
  market_name?: string | null;
  price_per_unit: number;
  unit: string;
  observed_on: string;
  source: string;
  source_url?: string | null;
  is_demo: boolean;
}

export interface MarketTrend {
  district: string;
  category: string;
  series: {
    date: string;
    price_per_unit: number;
    unit: string;
    samples: number;
    sources: string[];
    is_demo: boolean;
  }[];
  sources: string[];
  demo_data: boolean;
  disclaimer: string;
}

export interface MarketSource {
  source: string;
  source_url?: string | null;
  is_demo: boolean;
  latest_observed_on: string;
  districts: string[];
}

export interface FinanceSummary {
  period_days: number;
  milk_revenue: number;
  egg_revenue: number;
  other_income: number;
  feed_expense: number;
  vet_expense: number;
  other_expense: number;
  net: number;
  estimated_loss: number;
  assumptions: string[];
  daily_series: { date: string; income: number; expense: number }[];
  attribution: string;
}

export interface FinancialRecord {
  id: string;
  farm_id: string;
  animal_id?: string | null;
  record_date: string;
  record_type: string;
  category: string;
  amount: number;
  description?: string | null;
  is_estimate: boolean;
  assumptions?: Record<string, unknown> | null;
  is_sample: boolean;
}

export interface MilkRecord {
  id: string;
  animal_id: string;
  record_date: string;
  session: string;
  litres: number;
  fat_pct?: number | null;
  price_per_litre?: number | null;
  is_sample: boolean;
}

export interface EggRecord {
  id: string;
  farm_id: string;
  record_date: string;
  eggs_count: number;
  broken_count: number;
  price_per_egg?: number | null;
  is_sample: boolean;
}

export interface VetProfile {
  id: string;
  user_id: string;
  registration_no: string;
  qualification: string;
  specialization?: string | null;
  clinic_name?: string | null;
  district: string;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  availability: string;
  service_radius_km: number;
  verified: boolean;
  rating?: number | null;
  languages?: string[] | null;
  user?: User | null;
}

export interface Appointment {
  id: string;
  case_id: string;
  vet_id: string;
  visit_type: string;
  status: string;
  requested_at: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  location?: string | null;
  notes?: string | null;
  vet?: VetBrief | null;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  language: string;
  status: string;
  scheduled_at?: string | null;
  sent_at?: string | null;
  read_at?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  created_at: string;
}

export interface AnalyticsOverview {
  total_animals: number;
  species_distribution: { code: string; name: string; count: number }[];
  active_health_cases: number;
  critical_cases: number;
  upcoming_vaccinations: number;
  overdue_vaccinations: number;
  nutrition_records_30d: number;
  upcoming_appointments: number;
  milk_litres_30d: number;
  egg_count_30d: number;
  estimated_monthly_income: number;
  estimated_monthly_expense: number;
  alerts: { type: string; severity: string; message: string }[];
  generated_at: string;
  is_sample: boolean;
}

export interface AnalyticsTrends {
  milk: { date: string; litres: number }[];
  eggs: { date: string; count: number }[];
  health_cases: { date: string; total: number; high: number }[];
  period_days: number;
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
  data: Record<string, unknown>;
  trace: { agent?: string; status?: string; note?: string }[];
  llm_provider: string;
  latency_ms: number;
}

export interface AIInteraction {
  id: string;
  session_id: string;
  input_text: string;
  input_mode: string;
  detected_language: string;
  intent?: string | null;
  response_text: string;
  workflow?: Record<string, unknown> | null;
  agents_used: string[];
  escalated: boolean;
  latency_ms: number;
  is_sample: boolean;
  created_at: string;
}

export interface AdminOverview {
  users: Record<string, number>;
  total_users: number;
  active_users: number;
  farms: number;
  animals: number;
  veterinarians: number;
  unverified_veterinarians: number;
  cooperative_links: number;
  health_cases: number;
  open_health_cases: number;
  cases_by_severity: Record<string, number>;
  pending_approvals: number;
  ai_interactions: number;
  ai_interactions_24h: number;
  sync_operations: number;
  sync_errors: number;
  demo_data_enabled: boolean;
  generated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  detail?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AgentApproval {
  id: string;
  case_id?: string | null;
  agent_name: string;
  action: string;
  status: string;
  reason?: string | null;
  created_at: string;
  decided_at?: string | null;
}

export interface AgentMonitor {
  total_interactions: number;
  escalated_interactions: number;
  average_latency_ms: number;
  llm_provider: string;
  agent_usage_recent: Record<string, number>;
  recent_interactions: {
    id: string;
    intent?: string | null;
    language: string;
    agents_used: string[];
    escalated: boolean;
    latency_ms: number;
    created_at: string;
  }[];
  pending_approvals: AgentApproval[];
  recent_sync_operations: {
    id: string;
    entity_type: string;
    operation: string;
    status: string;
    created_at: string;
  }[];
}

export interface CooperativeMember {
  id: string;
  member_code: string;
  status: string;
  joined_at: string;
  farmer: User;
  animal_count: number;
}

export type { Page } from './api';
