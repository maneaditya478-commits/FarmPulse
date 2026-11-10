"""Domain request/response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import ORMModel

Language = Literal["en", "hi", "mr"]


# ---------------------------------------------------------------- users / auth
class UserBrief(ORMModel):
    id: uuid.UUID
    full_name: str
    role: str


class UserOut(ORMModel):
    id: uuid.UUID
    email: EmailStr
    phone: str | None = None
    full_name: str
    role: str
    language: str
    village: str | None = None
    district: str | None = None
    state: str | None = None
    avatar_url: str | None = None
    is_active: bool
    is_sample: bool
    last_login_at: datetime | None = None
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=20)
    language: Language = "en"
    village: str | None = None
    district: str | None = None
    state: str | None = None
    farm_name: str | None = None
    role: Literal["farmer", "veterinarian"] = "farmer"
    registration_no: str | None = None
    qualification: str | None = None
    clinic_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str
    role: Literal["farmer", "veterinarian", "paravet", "cooperative", "admin"] = "farmer"
    language: Language = "en"
    phone: str | None = None
    village: str | None = None
    district: str | None = None
    state: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    language: Language | None = None
    village: str | None = None
    district: str | None = None
    state: str | None = None
    avatar_url: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_active: bool | None = None


# ---------------------------------------------------------------- farms
class FarmCreate(BaseModel):
    name: str
    village: str
    district: str
    state: str
    pincode: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    size_acres: float | None = None


class FarmUpdate(BaseModel):
    name: str | None = None
    village: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    size_acres: float | None = None


class FarmOut(ORMModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    village: str
    district: str
    state: str
    pincode: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    size_acres: float | None = None
    is_sample: bool
    created_at: datetime


# ---------------------------------------------------------------- species / animals
class SpeciesOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_hi: str
    name_mr: str
    icon: str
    milk_bearing: bool
    egg_bearing: bool
    profile: dict | None = None


class BreedOut(ORMModel):
    id: uuid.UUID
    species_id: uuid.UUID
    name: str
    purpose: str | None = None
    origin: str | None = None


class AnimalCreate(BaseModel):
    farm_id: uuid.UUID | None = None
    species_id: uuid.UUID
    breed_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    tag_code: str | None = Field(default=None, max_length=40)
    sex: Literal["female", "male"] = "female"
    birth_date: date | None = None
    weight_kg: float | None = Field(default=None, gt=0, lt=2000)
    color: str | None = None
    photo_url: str | None = None
    notes: str | None = None


class AnimalUpdate(BaseModel):
    name: str | None = None
    breed_id: uuid.UUID | None = None
    sex: Literal["female", "male"] | None = None
    birth_date: date | None = None
    weight_kg: float | None = Field(default=None, gt=0, lt=2000)
    color: str | None = None
    photo_url: str | None = None
    status: Literal["active", "sold", "dead"] | None = None
    notes: str | None = None


class AnimalBrief(ORMModel):
    id: uuid.UUID
    name: str
    tag_code: str
    species_code: str = ""
    photo_url: str | None = None


class IdentifierOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    identifier_type: str
    identifier_value: str
    qr_payload: str | None = None
    issued_at: datetime
    is_active: bool


class AnimalOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    name: str
    tag_code: str
    sex: str
    birth_date: date | None = None
    age_months: int | None = None
    weight_kg: float | None = None
    color: str | None = None
    photo_url: str | None = None
    status: str
    notes: str | None = None
    is_sample: bool
    created_at: datetime
    species: SpeciesOut
    breed: BreedOut | None = None
    identifiers: list[IdentifierOut] = []


class BreedingRecordCreate(BaseModel):
    event_type: Literal["heat", "insemination", "pregnancy_check", "calving", "other"]
    event_date: date
    sire: str | None = None
    pregnancy_confirmed: bool | None = None
    expected_delivery: date | None = None
    notes: str | None = None


class BreedingRecordOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    event_type: str
    event_date: date
    sire: str | None = None
    pregnancy_confirmed: bool | None = None
    expected_delivery: date | None = None
    notes: str | None = None
    created_at: datetime


class QRResponse(BaseModel):
    animal_id: uuid.UUID
    identifier_value: str
    qr_payload: str
    issued_at: datetime


# ---------------------------------------------------------------- health
class ObservationInput(BaseModel):
    observed_at: datetime | None = None
    appetite: Literal["normal", "reduced", "none"] | None = None
    temperature_c: float | None = Field(default=None, ge=30, le=45)
    milk_change: str | None = None
    symptoms: list[str] = []
    photo_url: str | None = None
    notes: str | None = None
    source: Literal["text", "voice", "mobile", "mobile_offline", "field_agent"] = "text"


class HealthCaseCreate(BaseModel):
    animal_id: uuid.UUID
    symptom_summary: str = Field(min_length=3, max_length=2000)
    severity: Literal["low", "medium", "high", "critical"] | None = None
    observation: ObservationInput | None = None
    language: Language | None = None
    use_ai: bool = True


class HealthCaseUpdate(BaseModel):
    status: Literal["reported", "triaged", "assigned", "in_progress", "resolved", "closed"] | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    assigned_vet_id: uuid.UUID | None = None
    vet_diagnosis: str | None = None
    vet_treatment: str | None = None
    vet_notes: str | None = None


class ObservationOut(ORMModel):
    id: uuid.UUID
    observed_at: datetime
    appetite: str | None = None
    temperature_c: float | None = None
    milk_change: str | None = None
    symptoms: list | None = None
    photo_url: str | None = None
    notes: str | None = None
    source: str


class VetBrief(ORMModel):
    id: uuid.UUID
    registration_no: str
    qualification: str
    clinic_name: str | None = None
    user: UserBrief | None = None


class VisitOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    vet_id: uuid.UUID
    visit_type: str
    status: str
    requested_at: datetime
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    location: str | None = None
    notes: str | None = None
    vet: VetBrief | None = None


class HealthCaseOut(ORMModel):
    id: uuid.UUID
    case_code: str
    animal_id: uuid.UUID
    farmer_id: uuid.UUID
    symptom_summary: str
    severity: str
    status: str
    requires_vet: bool
    escalation_reason: str | None = None
    triage: dict | None = None
    assigned_vet_id: uuid.UUID | None = None
    vet_diagnosis: str | None = None
    vet_treatment: str | None = None
    vet_notes: str | None = None
    approved_at: datetime | None = None
    opened_at: datetime
    resolved_at: datetime | None = None
    is_sample: bool
    animal: AnimalBrief | None = None
    farmer: UserBrief | None = None
    observations: list[ObservationOut] = []
    visits: list[VisitOut] = []


class CaseAssignRequest(BaseModel):
    vet_id: uuid.UUID | None = None


class HealthReportResponse(BaseModel):
    case: HealthCaseOut | None = None
    triage: dict = {}
    response_text: str
    agents_used: list[str] = []
    escalated: bool
    appointment_id: uuid.UUID | None = None
    interaction_id: uuid.UUID
    data: dict = {}


class HealthRecordCreate(BaseModel):
    animal_id: uuid.UUID
    case_id: uuid.UUID | None = None
    record_type: Literal["diagnosis", "treatment", "checkup", "note", "surgery"]
    title: str
    details: str | None = None
    recorded_at: datetime | None = None


class HealthRecordOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    case_id: uuid.UUID | None = None
    record_type: str
    title: str
    details: str | None = None
    professional_id: uuid.UUID | None = None
    approved: bool
    recorded_at: datetime
    is_sample: bool


# ---------------------------------------------------------------- vaccination
class VaccineCatalogOut(ORMModel):
    id: uuid.UUID
    species_id: uuid.UUID
    name: str
    disease: str
    age_weeks: int
    booster_days: int | None = None
    source_reference: str
    is_verified: bool


class VaccinationCreate(BaseModel):
    animal_id: uuid.UUID
    vaccine_id: uuid.UUID
    administered_on: date | None = None
    due_on: date | None = None
    batch_no: str | None = None
    administered_by: str | None = None
    notes: str | None = None


class VaccinationOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    vaccine_id: uuid.UUID
    administered_on: date | None = None
    due_on: date
    status: str
    batch_no: str | None = None
    administered_by: str | None = None
    verified_by: uuid.UUID | None = None
    certificate_ref: str | None = None
    notes: str | None = None
    is_sample: bool
    animal: AnimalBrief | None = None
    vaccine: VaccineCatalogOut | None = None


class VaccinationScheduleItem(BaseModel):
    animal_id: uuid.UUID
    animal_name: str
    vaccine_id: uuid.UUID
    vaccine_name: str
    disease: str
    due_on: date | None = None
    status: str
    days_until: int | None = None
    source_reference: str
    note: str | None = None


class VaccinationVerify(BaseModel):
    batch_no: str | None = None
    certificate_ref: str | None = None
    verified: bool = True


# ---------------------------------------------------------------- nutrition
class NutritionProfileOut(ORMModel):
    id: uuid.UUID
    species_id: uuid.UUID
    stage: str
    dry_matter_kg: float | None = None
    feed_guidance: str
    water_litres: float | None = None
    minerals: str | None = None
    reference_source: str


class FeedRecordCreate(BaseModel):
    animal_id: uuid.UUID
    recorded_at: datetime | None = None
    feed_type: str
    quantity_kg: float = Field(gt=0)
    mineral_supplement: str | None = None
    cost: float | None = Field(default=None, ge=0)
    notes: str | None = None


class FeedRecordOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    recorded_at: datetime
    feed_type: str
    quantity_kg: float
    mineral_supplement: str | None = None
    cost: float | None = None
    notes: str | None = None
    is_sample: bool


class WaterRecordCreate(BaseModel):
    animal_id: uuid.UUID
    recorded_at: datetime | None = None
    litres: float | None = Field(default=None, ge=0)
    source: str | None = None
    quality_note: str | None = None


class WaterRecordOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    recorded_at: datetime
    litres: float | None = None
    source: str | None = None
    quality_note: str | None = None
    is_sample: bool


# ---------------------------------------------------------------- environment
class EnvironmentRecordCreate(BaseModel):
    farm_id: uuid.UUID | None = None
    temperature_c: float | None = Field(default=None, ge=-20, le=60)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)
    weather: str | None = None
    shed_cleanliness: int | None = Field(default=None, ge=1, le=5)
    water_available: bool | None = None
    sanitation_note: str | None = None


class EnvironmentRecordOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    recorded_at: datetime
    temperature_c: float | None = None
    humidity_pct: float | None = None
    weather: str | None = None
    shed_cleanliness: int | None = None
    water_available: bool | None = None
    sanitation_note: str | None = None
    risk_flags: list | None = None
    source: str
    is_sample: bool


class WeatherForecastDay(BaseModel):
    date: date
    temp_max: float | None = None
    temp_min: float | None = None
    humidity: float | None = None
    precipitation_mm: float | None = None


class WeatherOut(BaseModel):
    available: bool
    source: str
    location: str
    temperature_c: float | None = None
    humidity_pct: float | None = None
    weather: str | None = None
    wind_kmh: float | None = None
    forecast: list[WeatherForecastDay] = []
    note: str | None = None


# ---------------------------------------------------------------- veterinarians / appointments
class VetProfileOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    registration_no: str
    qualification: str
    specialization: str | None = None
    clinic_name: str | None = None
    district: str
    state: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    availability: str
    service_radius_km: float
    verified: bool
    rating: float | None = None
    languages: list | None = None
    user: UserOut | None = None


class VetProfileUpsert(BaseModel):
    registration_no: str = Field(min_length=3, max_length=60)
    qualification: str = Field(min_length=2, max_length=160)
    specialization: str | None = None
    clinic_name: str | None = None
    district: str
    state: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    service_radius_km: float = Field(default=25.0, gt=0, le=300)
    languages: list[str] = []


class VetAvailabilityUpdate(BaseModel):
    availability: Literal["available", "busy", "offline"]


class AppointmentCreate(BaseModel):
    case_id: uuid.UUID
    vet_id: uuid.UUID
    visit_type: Literal["teleconsult", "onsite"] = "teleconsult"
    scheduled_at: datetime | None = None
    location: str | None = None
    notes: str | None = None


class AppointmentUpdate(BaseModel):
    status: Literal["requested", "scheduled", "completed", "cancelled"]
    scheduled_at: datetime | None = None
    notes: str | None = None


class AppointmentOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    vet_id: uuid.UUID
    visit_type: str
    status: str
    requested_at: datetime
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    location: str | None = None
    notes: str | None = None
    vet: VetBrief | None = None


# ---------------------------------------------------------------- market
class MarketPriceOut(ORMModel):
    id: uuid.UUID
    species_id: uuid.UUID | None = None
    category: str
    breed: str | None = None
    district: str
    state: str
    market_name: str | None = None
    price_per_unit: float
    unit: str
    observed_on: date
    source: str
    source_url: str | None = None
    is_demo: bool


class MarketPriceCreate(BaseModel):
    species_id: uuid.UUID | None = None
    category: str
    breed: str | None = None
    district: str
    state: str
    market_name: str | None = None
    price_per_unit: float = Field(gt=0)
    unit: str = "per animal"
    observed_on: date
    source: str
    source_url: str | None = None
    is_demo: bool = True


# ---------------------------------------------------------------- finance
class FinancialRecordCreate(BaseModel):
    farm_id: uuid.UUID | None = None
    animal_id: uuid.UUID | None = None
    record_date: date | None = None
    record_type: Literal["income", "expense", "estimate"]
    category: Literal["milk", "egg", "animal_sale", "feed", "veterinary", "medicine", "labour", "other"]
    amount: float = Field(gt=0)
    description: str | None = None
    is_estimate: bool = False
    assumptions: dict | None = None


class FinancialRecordOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    animal_id: uuid.UUID | None = None
    record_date: date
    record_type: str
    category: str
    amount: float
    description: str | None = None
    is_estimate: bool
    assumptions: dict | None = None
    is_sample: bool


class MilkRecordCreate(BaseModel):
    animal_id: uuid.UUID
    record_date: date | None = None
    session: Literal["morning", "evening"] = "morning"
    litres: float = Field(gt=0, le=100)
    fat_pct: float | None = Field(default=None, ge=0, le=15)
    price_per_litre: float | None = Field(default=None, ge=0)


class MilkRecordOut(ORMModel):
    id: uuid.UUID
    animal_id: uuid.UUID
    record_date: date
    session: str
    litres: float
    fat_pct: float | None = None
    price_per_litre: float | None = None
    is_sample: bool


class EggRecordCreate(BaseModel):
    farm_id: uuid.UUID | None = None
    record_date: date | None = None
    eggs_count: int = Field(ge=0)
    broken_count: int = Field(default=0, ge=0)
    price_per_egg: float | None = Field(default=None, ge=0)


class EggRecordOut(ORMModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    record_date: date
    eggs_count: int
    broken_count: int
    price_per_egg: float | None = None
    is_sample: bool


class FinancialSummary(BaseModel):
    period_days: int
    milk_revenue: float
    egg_revenue: float
    other_income: float
    feed_expense: float
    vet_expense: float
    other_expense: float
    net: float
    estimated_loss: float
    assumptions: list[str]
    daily_series: list[dict]
    attribution: str


# ---------------------------------------------------------------- notifications
class NotificationOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    channel: str
    type: str
    title: str
    body: str
    language: str
    status: str
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    read_at: datetime | None = None
    related_type: str | None = None
    related_id: str | None = None
    created_at: datetime


class NotificationCreate(BaseModel):
    user_id: uuid.UUID
    channel: Literal["in_app", "push", "sms", "whatsapp"] = "in_app"
    type: str = "general"
    title: str
    body: str
    language: Language = "en"
    scheduled_at: datetime | None = None
    related_type: str | None = None
    related_id: str | None = None


# ---------------------------------------------------------------- analytics
class AnalyticsOverview(BaseModel):
    total_animals: int
    species_distribution: list[dict]
    active_health_cases: int
    critical_cases: int
    upcoming_vaccinations: int
    overdue_vaccinations: int
    nutrition_records_30d: int
    upcoming_appointments: int
    milk_litres_30d: float
    egg_count_30d: int
    estimated_monthly_income: float
    estimated_monthly_expense: float
    alerts: list[dict]
    generated_at: datetime
    is_sample: bool


# ---------------------------------------------------------------- AI
class AIQueryRequest(BaseModel):
    text: str = Field(min_length=2, max_length=4000)
    animal_id: uuid.UUID | None = None
    session_id: str | None = None
    language: Language | None = None
    input_mode: Literal["text", "voice"] = "text"


class AIResponse(BaseModel):
    interaction_id: uuid.UUID
    session_id: str
    language: str
    intent: str
    response_text: str
    agents_used: list[str]
    escalated: bool
    case_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    data: dict[str, Any] = {}
    trace: list[dict] = []
    llm_provider: str
    latency_ms: int


class AITranslateRequest(BaseModel):
    text: str
    target_language: Language


class AIInteractionOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    animal_id: uuid.UUID | None = None
    session_id: str
    input_text: str
    input_mode: str
    detected_language: str
    intent: str | None = None
    response_text: str
    workflow: dict | None = None
    agents_used: list = []
    escalated: bool
    latency_ms: int
    is_sample: bool
    created_at: datetime


class VerifyVetRequest(BaseModel):
    verified: bool
    note: str | None = None


# ---------------------------------------------------------------- sync
class SyncOperationIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=80)
    entity_type: Literal["animal", "health_observation", "vaccination", "feed_record", "water_record", "environmental_record"]
    entity_id: str = Field(min_length=1, max_length=48)
    operation: Literal["create", "update"] = "create"
    idempotency_key: str = Field(min_length=6, max_length=120)
    client_updated_at: datetime | None = None
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def payload_not_empty(cls, value: dict) -> dict:
        if not value:
            raise ValueError("payload must not be empty")
        return value


class SyncBatchRequest(BaseModel):
    client_id: str
    operations: list[SyncOperationIn] = Field(max_length=100)


class SyncResult(BaseModel):
    idempotency_key: str
    entity_type: str
    entity_id: str
    status: Literal["applied", "duplicate", "conflict", "error"]
    message: str | None = None
    server_updated_at: datetime | None = None


class SyncBatchResponse(BaseModel):
    client_id: str
    server_time: datetime
    results: list[SyncResult]
    applied: int
    duplicates: int
    conflicts: int
    errors: int


# ---------------------------------------------------------------- admin
class AuditLogOut(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_role: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    detail: dict | None = None
    ip_address: str | None = None
    created_at: datetime


class AgentApprovalOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID | None = None
    agent_name: str
    action: str
    status: str
    reason: str | None = None
    created_at: datetime
    decided_at: datetime | None = None


class AgentApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str | None = None


class UserAdminView(UserOut):
    model_config = ConfigDict(from_attributes=True)
    animal_count: int = 0
    farm_count: int = 0


class CooperativeMemberCreate(BaseModel):
    farmer_email: EmailStr
    member_code: str | None = Field(default=None, max_length=40)


class CooperativeMemberOut(BaseModel):
    id: uuid.UUID
    member_code: str
    status: str
    joined_at: datetime
    farmer: UserOut
    animal_count: int = 0


class CooperativeInvitationOut(BaseModel):
    id: uuid.UUID
    member_code: str
    status: str
    joined_at: datetime
    cooperative: UserBrief


class CooperativeInvitationDecision(BaseModel):
    decision: Literal["accept", "decline"]
