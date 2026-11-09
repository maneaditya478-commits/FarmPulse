# API Contracts

Base URL: `/api/v1` · Interactive OpenAPI: `/docs` · Errors use `{"error": {"code", "message", "details?"}}`.

All authenticated requests use `Authorization: Bearer <JWT>`. Paginated responses use `{items, total, page, page_size, pages}`.

## Authentication

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Farmer or veterinarian registration (creates farm / vet profile) |
| POST | `/auth/login` | public | JWT issuance |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/change-password` | any | Change password (requires current password); returns a fresh token |

Batch B token lifecycle: JWTs carry a `tv` (token version) claim and require `exp`, `sub` and `iat`. Changing the password (or an admin reset) increments the user's `token_version`, so previously issued tokens are rejected with 401 `token_revoked`. `POST /auth/change-password` requires `current_password` (400 `invalid_password` if wrong) and returns a `TokenResponse`; clients must store the returned `access_token` to keep the session. `PATCH /users/me` rejects `password` (400 `use_change_password`) and `is_active` (400 `forbidden`). Default token lifetime is 2 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`). A hand-crafted token without `exp` is rejected (401 `invalid_token`).

## Users, farms and cooperative

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET/PATCH | `/users/me` | any | Profile |
| GET | `/users/me/summary` | any | Farm/animal counts |
| GET | `/users` | admin | Paginated user administration |
| POST | `/users` | admin | Create user |
| PATCH | `/users/{id}` | admin | Update user / deactivate |
| GET | `/users/cooperative/members` | cooperative | Members (pending and active) |
| POST | `/users/cooperative/members` | cooperative | Invite a farmer by email (creates a **pending** membership) |
| DELETE | `/users/cooperative/members/{membership_id}` | cooperative | Remove link |
| GET | `/users/cooperative/invitations` | farmer | Own pending cooperative invitations |
| POST | `/users/cooperative/invitations/{membership_id}/decision` | farmer | Accept or decline an invitation (`{"decision": "accept"\|"decline"}`) |
| GET/POST | `/farms` | farmer, cooperative, admin | List / create farms |
| GET/PATCH/DELETE | `/farms/{farm_id}` | scoped | Farm detail; delete blocked when animals exist |

Batch B consent model: adding a member creates a `pending` membership and notifies the farmer; the cooperative gains **no** animal/health/production access until the farmer accepts. Accept sets status `active` and records `consented_at`; decline removes the row (re-invite possible). A farmer only sees/acts on their own invitations (404 `invitation_not_found` otherwise). Cooperative data scoping everywhere uses `active` memberships only. There is no farmer-facing invitation screen yet (API-only by design); the cooperative members table shows pending/active status.

## Animals

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/animals/species` | any | 8 supported species with profiles |
| GET | `/animals/breeds` | any | Breeds (`?species_id=`) |
| GET | `/animals` | scoped | Paginated list (`q`, `species_id`, `farm_id`, `status`) |
| POST | `/animals` | farmer, admin | Register animal, issue identifier, build vaccination schedule |
| GET/PATCH | `/animals/{animal_id}` | scoped | Profile / update |
| DELETE | `/animals/{animal_id}` | admin | Remove |
| POST | `/animals/{animal_id}/photo` | farmer, admin | Validated, EXIF-stripped upload |
| POST | `/animals/{animal_id}/qr` | farmer, admin | Issue QR identifier |
| GET | `/animals/qr/{code}` | scoped | Resolve QR / tag code |
| GET | `/animals/{animal_id}/timeline` | scoped | Combined health, vaccination, feed and production timeline |
| GET/POST | `/animals/{animal_id}/breeding` | farmer, vet, admin | Breeding history and events |

## Healthcare

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/health/warning-signs?language=en\|hi\|mr` | any | Localized urgent signs list and escalation note |
| POST | `/health/cases` | farmer, paravet, admin | Run agentic triage workflow from symptoms/voice text |
| GET | `/health/cases` | scoped | Paginated cases (`status`, `severity`, `animal_id`, `q`) |
| GET | `/health/cases/{case_id}` | scoped | Case with observations and visits |
| PATCH | `/health/cases/{case_id}` | assigned **verified** vet/paravet, admin | Update status and veterinarian assessment |
| POST | `/health/cases/{case_id}/observations` | scoped writer | Append observation through safety re-triage workflow |
| POST | `/health/cases/{case_id}/assign` | vet, paravet, admin | Assign case and create visit |
| GET/POST | `/health/records` | scoped | Professional health history (POST: verified vet/paravet or admin) |
| GET | `/health/approvals` | vet, paravet, admin | Safety approval queue |
| POST | `/health/approvals/{id}/decision` | **verified** vet/paravet, admin | Approve/reject a gated action |

Batch B authorization: clinical assessment, record creation and approval decisions require a **verified** professional (`require_verified_professional`); an unverified assigned vet/paravet gets 403 `professional_not_verified`. Admin retains clinical-write and verification authority. `POST /health/records` with a `case_id` validates that the case belongs to the same animal (422 `animal_case_mismatch`) and is accessible to the caller (404 otherwise); cooperative record listing is scoped to active-member animals. Changing a professional's registration number or qualification resets `verified=False` until an admin re-verifies. These gates close the audited H01/H03/H04 defects; they are still not a substitute for clinical validation.

Batch A urgency policy: `observation.symptoms` uses canonical keys (for example `convulsions`, `unable_to_stand`, `breathing_difficulty`) and is combined with text and measurements. Urgent warning phrases escalate in English/Hindi/Marathi. Severity is monotonic; unclear reports require review rather than a low result. Triage includes `rule_status: "needs vet review"` and `needs_vet_review`; thresholds and clinical accuracy are not validated. Veterinary requests are pending, without an automatically confirmed appointment time. Critical guidance says to contact a veterinarian immediately, not wait for the app or next-day follow-up.

## Vaccination

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/vaccinations/catalog` | any | Verified species protocols with source references |
| GET | `/vaccinations/schedule` | scoped | Due within 30 days or overdue |
| GET | `/vaccinations/overdue` | scoped | Overdue only |
| GET | `/vaccinations` | scoped | Full record list |
| POST | `/vaccinations` | vet, paravet, admin | Record administration; attestation/certificate only when the professional is verified |
| POST | `/vaccinations/{id}/verify` | **verified** vet/paravet, admin | Verify a farmer-reported record |
| POST | `/vaccinations/reminders` | farmer, admin | Create de-duplicated reminders |

Batch B attestation integrity: verification requires a verified professional (403 `professional_not_verified` otherwise). An unverified professional's recording stores `verified_by=None` and no certificate. If a previously attested vaccination's administration date or batch is later changed, `verified_by` is cleared (the attestation covered the recorded date/batch); the certificate reference is cleared on re-reporting. Catalogue provenance (M01) and booster/overdue modeling (H18) remain open.

## Nutrition, environment and veterinary network

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/nutrition/profiles` | any | Species nutrition guidance |
| GET/POST | `/nutrition/feed` | scoped | Feed records (POST also books feed expense) |
| GET/POST | `/nutrition/water` | scoped | Water observations |
| GET | `/nutrition/summary` | scoped | 30-day records and missing-data gaps |
| GET/POST | `/environment/records` | scoped | Farmer-reported environmental observations |
| GET | `/environment/weather` | scoped | Live Open-Meteo weather (degrades honestly) |
| GET | `/environment/alerts` | scoped | Validated threshold flags |
| GET | `/veterinarians` | any | Registered vets with filters |
| GET | `/veterinarians/nearby?farm_id=\|latitude=&longitude=` | any | Haversine ranking by farm or device coordinates |
| GET/POST | `/veterinarians/me` | vet, paravet | Own profile |
| PATCH | `/veterinarians/me/availability` | vet, paravet | Availability |
| GET | `/veterinarians/{vet_id}` | any | Public profile |
| GET/POST | `/appointments` | scoped | List / request visits |
| GET/PATCH | `/appointments/{id}` | scoped | Detail / status (farmers may cancel only) |

## Market, finance and analytics

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/market/prices` | any | District/category price rows with source and date |
| GET | `/market/trends?district=&category=` | any | Observation series |
| GET | `/market/sources` | any | Distinct sources and demo flags |
| GET | `/market/categories` | any | Available categories |
| POST/DELETE | `/market/prices` | admin | Publish/remove sourced price rows |
| GET | `/finance/summary?period_days=` | scoped | Revenue, expenses, estimated loss, assumptions |
| GET/POST | `/finance/records` | scoped | Financial ledger |
| GET/POST | `/finance/milk` | scoped | Milk production |
| GET/POST | `/finance/eggs` | scoped | Egg production |
| GET | `/finance/production-trends` | scoped | Daily production series |
| GET | `/analytics/overview` | scoped | Role-scoped dashboard metrics and alerts |
| GET | `/analytics/trends` | scoped | Production and financial series |
| GET | `/analytics/species-distribution` | scoped | Species counts |

Batch B scoping (M02): cooperative metrics (including upcoming appointments) and a farmer's environmental alerts are limited to accessible farms; an account with no accessible farms sees empty results, not global data. Veterinarian case trends count only assigned cases. Veterinarian finance follows the accessible-animal scope for milk/loss figures (no unassigned sibling-animal revenue); egg and financial-ledger records remain farm-scoped. Financial calculations still expose their assumptions and market rows their source/date.

## AI assistant

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/ai/query` | any authenticated | Run multilingual agent workflow |
| GET | `/ai/agents` | any | Agent catalogue and capabilities |
| GET | `/ai/status` | any | Provider and guardrail status |
| GET | `/ai/interactions` | scoped | Paginated interaction audit |
| GET | `/ai/interactions/{id}` | owner/admin | Workflow trace |
| POST | `/ai/translate` | any | Translation adapter (marked when unavailable) |

### `POST /ai/query` request

```json
{
  "text": "माझी गाय दोन दिवसांपासून नीट खात नाही आणि दूध कमी देत आहे.",
  "animal_id": "uuid",
  "session_id": "optional-session",
  "language": "mr",
  "input_mode": "voice"
}
```

### Response

```json
{
  "interaction_id": "uuid",
  "session_id": "uuid-or-client-id",
  "language": "mr",
  "intent": "health",
  "response_text": "…localized advisory with escalation…",
  "agents_used": ["intake", "orchestrator", "record", "health", "safety", "vet", "followup", "respond"],
  "escalated": true,
  "case_id": "uuid",
  "appointment_id": "uuid",
  "data": {"triage": {"severity": "medium", "requires_vet": true}},
  "trace": [{"agent": "health", "status": "ok"}],
  "llm_provider": "local-expert-rules",
  "latency_ms": 974
}
```

Unresolved animals no longer halt urgent triage: `/ai/query` returns emergency guidance and `escalated: true`, but `case_id` and `appointment_id` remain null when no clinical record/request could be created. This flag means review is needed, not that a veterinarian has accepted a request.

All provider structures and composed/translated output are scanned for disallowed medical claims. Blocked output is replaced with conservative guidance. A `safety.output_blocked` audit records stage/reason and actor without repeating unsafe provider text; interaction workflows store `safety_events` and a `blocked` trace. Translation also scans the missing-provider source echo. Safe missing-provider text remains explicitly labelled `local-templates`; it is not falsely described as translated.

## Notifications

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/notifications` | any | Inbox (`unread_only`, `channel`, `status`) |
| GET | `/notifications/unread-count` | any | Badge count |
| POST | `/notifications/{id}/read` | owner | Mark read |
| POST | `/notifications/read-all` | any | Mark all read |
| POST | `/notifications` | admin | Send in-app / queue external channel |
| POST | `/notifications/dispatch-due` | admin | Release scheduled in-app reminders |

External SMS/WhatsApp/push messages remain `pending` until a provider gateway is configured.

## Offline sync

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/sync/batch` | any authenticated | Apply up to 100 offline operations |
| GET | `/sync/operations` | any | Own sync ledger |

### `POST /sync/batch`

```json
{
  "client_id": "android-device-1",
  "operations": [
    {
      "client_id": "android-device-1",
      "entity_type": "health_observation",
      "entity_id": "client-generated-uuid",
      "operation": "create",
      "idempotency_key": "unique-per-operation",
      "client_updated_at": "2026-11-08T10:00:00Z",
      "payload": {
        "animal_id": "uuid",
        "symptom_summary": "गाय खात नाही",
        "symptoms": ["no_appetite"],
        "language": "mr",
        "observed_at": "2026-11-08T10:00:00Z",
        "source": "mobile_offline"
      }
    }
  ]
}
```

Per-operation result status: `applied`, `duplicate`, `conflict`, `error`. Health observations invoke the same LangGraph safety workflow without committing inside the operation savepoint. Client observation UUID, timestamp and language are retained. Re-triage preserves professional diagnosis/treatment and the highest case urgency.

Batch B parity: each operation is gated by the canonical entity role (for example cooperative feed/water writes are rejected, matching the online 403), non-animal `update` operations are rejected (422 `unsupported_operation`), and payloads are validated with the same typed schemas as the online routes (`ObservationInput`, `VaccinationCreate`, `FeedRecordCreate`, `WaterRecordCreate`, `EnvironmentRecordCreate`), so out-of-range values such as temperature 999 or negative quantities become per-operation `error` results. A mismatched accessible animal/case in a synced observation is rejected like the online route. Still open for Batch C: global idempotency-key binding to user/payload, conflict-vs-duplicate replay, queue chunking to the 100-op limit, malformed-UUID batch isolation, and durable photo upload/failure visibility.

## Administration

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/admin/overview` | admin | Platform counts and severity breakdown |
| GET | `/admin/users` | admin | Paginated users with farm/animal counts |
| GET | `/admin/audit-logs` | admin | Filterable audit trail |
| GET | `/admin/agent-monitor` | admin | Recent workflows, agent usage, escalations, pending approvals |
| GET | `/admin/veterinarians` | admin | Verification queue |
| POST | `/admin/veterinarians/{vet_id}/verify` | admin | Verify / revoke |
| GET | `/admin/sync-operations` | admin | Sync ledger |
| GET | `/admin/system` | admin | Deployment, provider and guardrail status |
