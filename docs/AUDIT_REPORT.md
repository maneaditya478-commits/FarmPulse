# AI Livestock Guardian — Step 1 audit

Date: 2026-11-08. Verdict: **not production-safe; safety and authorization fixes must precede new features.**

This report describes the baseline before remediation. No application source or deployment configuration was changed while gathering it. Existing tests passing is not evidence that the clinical safety or tenant isolation requirements are satisfied.

## Scope and evidence limits

- Started/checked FastAPI, the Vite web console, and Expo Metro. Exercised the web application with real local API requests and persisted sample records.
- Read all 17 API modules and their authorization dependencies, relevant services/schemas/models, agent graph paths, mobile auth/database/sync/photo paths, and deployment files.
- Security reproductions used a separate in-memory SQLite database, foreign keys enabled, FastAPI TestClient, no application startup, and no shared demo database. All 106 protected v1 endpoints were tested without credentials.
- Offline reproductions used transpiled TypeScript with in-memory dependency mocks and extracted Python/Pydantic contracts. These are logic checks, **not native-device tests**.
- AI probes used deterministic functions, isolated SQLite graph runs and mocked LLM responses. No Gemini credentials were available; mocked unsafe translations are not claims that the real provider generated them.
- Re-ran the security/offline reproductions and directly verified the missed urgent phrases, severity downgrade and output-scanner gaps from the main audit session.
- Browser accessibility snapshots and DOM/API checks worked. Native screenshot capture failed with `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE` because the browser had no visible attached surface. Visual contrast, clipping, physical touch use and microphone capture are not certified.
- No Docker executable, adb executable or Android SDK/device was available. Production secrets, firewalls, TLS, PostgreSQL deployment behavior, concurrency/load and exhaustive dependency CVEs remain unverified.
- The workspace has no Git repository. No commits were created; no repository was initialized or user changes discarded.

Evidence: [endpoint inventory](audit-evidence/endpoint-authorization.csv), [Marathi triage](audit-evidence/marathi-triage.txt), [market](audit-evidence/market.txt), [empty market](audit-evidence/market-empty.txt), [finance](audit-evidence/finance.txt).

## Runtime and check baseline

| Check | Result | Actual evidence |
|---|---|---|
| Backend startup / health | PASS locally | HTTP 200; database `ok`; development; `local-expert-rules`; demo data enabled |
| Backend tests | PASS | `python -m pytest -q -ra`: 32 passed |
| Backend coverage | MEASURED | Statement coverage of production `app` code excluding tests: **70%**; 4,455 statements, 1,345 missed. Including tests is 72%; neither number is branch coverage |
| Backend warnings | WARNING | Starlette deprecates `HTTP_422_UNPROCESSABLE_ENTITY` in favor of `HTTP_422_UNPROCESSABLE_CONTENT` |
| Backend lint | NOT RUN | `ruff` not installed |
| Web dev server | PASS locally | HTTP 200 on port 5173; login and inspected application pages usable through browser automation |
| Web build / TypeScript | PASS | `npm run build`, `npm run typecheck` |
| Web bundle | WARNING | Main JS 909.02 kB, gzip 246.65 kB; Vite chunk-over-500-kB warning |
| Web console | WARNING | Two React Router v7 future-flag warning types, repeated on navigation; no observed uncaught errors on inspected pages |
| Web lint | MISSING | No lint script; `--if-present` silence is not a lint pass |
| Mobile Metro | PASS locally | Expo server on port 8081 responds HTTP 200 |
| Mobile TypeScript | PASS | `npm run typecheck` |
| Expo Doctor | PASS | 20/20 checks |
| Android export | PASS, bundle only | 3,375 modules; Hermes bundle about 5.7 MB |
| Mobile lint / tests | MISSING | No lint or test scripts |
| Android native runtime | BLOCKED | No device/emulator/adb/SDK; export does not prove native feature correctness |
| Docker / PostgreSQL stack | BLOCKED | Docker unavailable |
| GitHub Actions | MISSING | No `.github/workflows` files found |

Examples of uncovered production behavior: advisory agents 14%, intake 46%, appointment API 30%, users API 33%, finance API 33%, sync API 46%, storage 32%, LLM adapter 41%. Coverage is not a clinical accuracy metric.

## Ramesh scenario — observed end-to-end results

The shared local database already contained earlier QA records: 21 Ramesh animals including an extra Sync Goat, rather than a clean 20-animal seed. It was not reset. All newly entered clinical/vaccination content was explicitly synthetic sample QA content, not a real examination, diagnosis, treatment or administration.

| Step | Result | Evidence / limitation |
|---|---|---|
| Ramesh login and Marathi language | PASS | Real login and language selection in the web console |
| Marathi voice capture | BLOCKED | Browser exposes speech recognition, but no real microphone utterance was supplied/validated. Mobile uses keyboard dictation; device path unavailable |
| Marathi text report | PASS for tested wording | Ganga: `डेमो ऑडिट: गंगाला कालपासून तीव्र ताप आहे आणि ती उभी राहू शकत नाही. श्वास घेण्यास त्रास होत आहे आणि पाणी पीत नाही.` |
| Triage | PASS for this report; FAIL for urgent variants | `critical`, `requires_vet=true`; breathing/water refusal recognized. Other dangerous phrases fail, detailed below |
| Agent workflow / vet request | PASS persistence | Eight nodes: intake, orchestrator, record, health, safety, vet, followup, respond. Case `HC-261108-82FA21`, ID `a6660fb0-1d6a-40c7-8cfe-db0cd43940cc`, sample flag true; Dr Aarti assigned; teleconsult requested |
| Emergency timing | NEEDS REVIEW | Critical case scheduled two hours later. Automatic request creation is not evidence of immediate professional response or a safe clinical response-time policy |
| Veterinary assessment | PASS persistence/gate on verified demo account | Explicit SAMPLE QA assessment and SAMPLE QA plan saved; `approved_at` set; approved sample health record created; pending safety approval resolved; `health_case.updated` audit persisted |
| Farmer vaccination report | PASS persistence | Lakshmi's seeded FMD record updated through the actual form, batch `SAMPLE-QA-NO-ADMINISTRATION`, explicit no-administration notes, `is_sample=true`, initially `verified_by=null` |
| Professional vaccination verification | PASS API/persistence | Dr Aarti verification HTTP 200; explicit `SAMPLE-QA-NOT-A-REAL-CERTIFICATE`; recorded and verified audit events. This is a software test, not clinical verification |
| Market | PASS provenance and empty state | Pune API returned 14 rows, all `is_demo=true`, all with source/date/unit. UI displayed source/date/unit and sample badges. Unknown district displayed “No price records” and no trend data |
| Finance | PASS recorded-net arithmetic; FAIL estimate duplication | Net ₹40,999 matches recomputation from returned revenues/expenses. Assumptions visible. Estimated revenue difference ₹1,690.50 counted Ganga five times through repeated active cases |
| Follow-up reminder | PASS creation; delivery not certified | Marathi in-app follow-up persisted pending for 2026-11-09; farmer assistance notification persisted sent. No proof of future dispatch/push/SMS delivery |
| Vaccination reminders | PASS API creation/de-duplication for tested replay | First call created 3, immediate repeat created 0; persisted Marathi in-app notifications. No farmer-web scheduling control was found; call used the real API |
| Full scenario release acceptance | FAIL | Happy path works, but urgent-safety variants, authorization and offline acceptance checks fail; voice/native delivery checks blocked |

Native browser click did not dispatch some React button/form actions; DOM `click()` / `requestSubmit()` then dispatched the actual handlers and API requests. This is an automation limitation, not an established application button defect.

## Endpoint authorization inventory

**108 v1 method/path endpoints: 2 public, 106 bearer-authenticated; 61 current-user-only and 45 explicitly role-restricted.** Every protected route rejected anonymous access with HTTP 401 in isolation.

The CSV lists **every endpoint**, its actual gate, module and source location. These are route gates, not a claim that object authorization is correct. Public system/docs routes and static `/uploads` are outside that v1 count.

| Gate | Count | Main mutations/resources |
|---|---:|---|
| Public | 2 | Registration, login |
| Admin | 16 | Administration, user collection/update, animal removal, market writes, notification creation/dispatch |
| Farmer/admin | 8 | Animal create/update/photo/QR, farm create/update/delete, financial record creation |
| Farmer/paravet/admin | 7 | Breeding, health reporting, environment, feed/water, milk/egg writes |
| Farmer/vet/paravet/admin | 3 | Appointment creation, vaccination recording/reminders |
| Vet/paravet/admin | 5 | Case update/assignment, medical-record creation, approval list/decision |
| Vet/paravet | 3 | Vaccination verification, professional profile upsert/availability |
| Cooperative/admin | 3 | Membership list/add/remove |
| Any active account | 61 | Other scoped reads, sync, observations, appointment update, AI and self-account operations |

Normal ownership controls passed: farmer cross-animal/case reads 404, farmer administration 403, inactive account 401, public admin registration 422, ordinary booking of unverified vet 400. JWT signature/issuer checks and normally issued token expiry worked; database role, not JWT role claim, determines roles. Exceptions below prevent a clean isolation verdict.

## Critical findings — fix before any public deployment

### C01 — Production blueprint seeds a publicly documented administrator account

- Evidence: `render.yaml:22-23`; `backend/app/core/config.py:55-56`; `backend/app/seed/demo.py:213-227,318`.
- Render sets production and enables demo seeding with the documented default password. In-memory use of the actual seed-user helper allowed default-password login 200 and admin-system access 200.
- This is a deployment-default defect, not evidence of an already compromised deployment. Disable production seeding and require explicit safe provisioning; keep labelled demos isolated.

### C02 — Public fallback JWT signing key is accepted in production

- Evidence: `backend/app/core/config.py:28-30`; `backend/app/core/security.py:23-43`.
- With the default key and a known existing admin UUID, an isolated signed token obtained admin access 200. This requires the unsafe key configuration; no deployed token was forged or tested.
- Render's generated JWT secret is a passing control. Other startup/deployment paths do not reject the fallback. Reject missing/default/weak production secrets.

## High findings — release-blocking authorization, safety and data reliability

| ID | Finding and reproduced result | Source evidence |
|---|---|---|
| H01 | An unlinked cooperative read another farmer's medical records, HTTP 200; missing membership scope on unfiltered medical-record listing | `backend/app/api/v1/health.py:289-310` |
| H02 | A cooperative self-added active farmer membership using only an email; unrelated animal access changed 404 → 200 without farmer consent/admin approval | `backend/app/api/v1/users.py:201-223` |
| H03 | Professional authorized for animal A but denied case B created an approved record linking A to B, HTTP 201; farmer B then read A's record, HTTP 200. Offline observations also accept mismatched accessible animal/case IDs and leave resolved cases resolved | `backend/app/api/v1/health.py:297-328`; `backend/app/api/v1/sync.py:128-132,185-199` |
| H04 | Assigned `verified=False` professional approved gates, confirmed assessment, created approved records and verified vaccines, HTTP 200/201. Updating professional registration/qualification preserves verification | `backend/app/api/v1/health.py:143-173,355-370`; `backend/app/api/v1/vaccinations.py:120-138,159-168`; `backend/app/api/v1/veterinarians.py:90-105` |
| H05 | Farmer changed professionally verified vaccine administration date/batch, HTTP 201; old `verified_by` survived while certificate cleared | `backend/app/api/v1/vaccinations.py:121-138`; `backend/app/services/vaccination.py:105-119` |
| H06 | Sync bypasses canonical mutation roles and typed payload validation. Cooperative online writes 403 but equivalent sync applied; sync stored temperature 999, negative feed/cost/water. Non-animal update operations follow create logic | `backend/app/api/v1/sync.py:76-123,125-297,302-306`; `backend/app/schemas/domain.py:443-470` |
| H07 | Device-wide SQLite has no account ownership. B reads A's cache and sends A's queued new animal under B's token; backend selects B's farm. Logout clears credentials only | `mobile/src/db/database.ts:6-64,112-159,170-239`; `mobile/src/context/AuthContext.tsx:126-153` |
| H08 | A real tag conflict returns `conflict`; identical retry becomes `duplicate` although the requested animal does not exist. Client deletes duplicate, losing the unapplied operation. Keys are global and do not verify user/payload | `backend/app/api/v1/sync.py:88-90,311-349`; `mobile/src/offline/sync.ts:51-59` |
| H09 | 101-operation queue is sent as one batch, exceeds server max 100, returns 422 and cannot drain; attempts remain zero. Invalid UUID string passes request schema, then aborts the entire batch outside per-operation handling before commit | `mobile/src/offline/sync.ts:34-48`; `backend/app/schemas/domain.py:810-829`; `backend/app/api/v1/sync.py:311-334` |
| H10 | Server commits a mutation but response times out; mobile queues another new UUID/key, allowing duplicate feed/expense, health or generated-tag animal records | `mobile/src/api/client.ts:37-69`; `mobile/src/screens/AnimalFormScreen.tsx:111-159`; `mobile/src/screens/HealthScreen.tsx:169-204`; `mobile/src/screens/NutritionScreen.tsx:110-124` |
| H11 | Photos have no upload timeout; raw network errors are inconsistently queued, photo failures report errors=0 and mark sync successful/online; 403 silently deletes queued photo. Cached image URI is not copied into durable storage | `mobile/src/api/client.ts:75-93`; `mobile/src/offline/sync.ts:68-89`; `mobile/src/screens/AnimalDetailScreen.tsx:81-100`; `mobile/src/components/PhotoCapture.tsx:29-37`; `mobile/src/db/database.ts:224-239` |
| H12 | Dangerous common phrases yield no symptoms and `requires_vet=false`: “My cow cannot breathe”, “My cow is unconscious”, “sudden death”, `मेरी गाय को दौरे पड़ रहे हैं`, `माझी गाय उभी राहू शकत नाही`, `माझी गाय बेशुद्ध आहे`. Shipped warning labels and high-fever variants are also missed/under-triaged | `backend/app/services/triage.py:60-65,96-107,146-153,183-194,237-256`; `backend/app/core/constants.py:159-197`; `backend/app/agents/intake.py:39-59` |
| H13 | Recognized emergency without a resolved animal halts before triage/safety/vet and returns only an animal-selection prompt; escalation false, no emergency guidance | `backend/app/agents/intake.py:156-160,199-204,243-244` |
| H14 | Online orchestration ignores submitted `observation.symptoms`; neutral text + selected breathing/convulsion chip can route to animal_record or low severity, no case. Offline chip does produce critical, but skips safety approval/farmer follow-up/trace and selected report language | `backend/app/agents/intake.py:89-108`; `backend/app/agents/clinical.py:40-49,115-332`; `backend/app/api/v1/sync.py:125-199`; `mobile/src/screens/HealthScreen.tsx:163-203` |
| H15 | Adding a symptom downgrades urgency: cattle 39.3°C with no symptoms = high/review; same temperature + cough = medium/no review | `backend/app/services/triage.py:245-256,264` |
| H16 | Output scanner allows `Give 2 ml`, diagnosis assertions and Devanagari dosage/fake-approval text; unsafe animal-name content is echoed. Some narrow English dose phrases are blocked, but this is not a multilingual safety boundary | `backend/app/agents/intake.py:257-267,291-316`; `backend/app/services/language.py:127` |
| H17 | Freeform LLM translation returned mocked Hindi disease/dosage/fake-approval text without post-scan or safety event. No real provider unsafe generation was observed | `backend/app/services/llm.py:65-85`; `backend/app/api/v1/ai.py:122-134` |
| H18 | Booster date is updated but administered record remains `given`, so schedule/overdue excludes it even when booster is overdue. Isolated 2020 administration + 180-day booster disappeared from overdue list | `backend/app/services/vaccination.py:69-101,114-128` |
| H19 | Conditional deployment exposure: Compose publishes fixed-credential PostgreSQL and unauthenticated Redis on all host interfaces. Actual external reachability not tested | `docker-compose.yml:4-6,15-24` |

These findings do not establish that prompts can genuinely authorize a medical record: isolated fake-approval probes did not create diagnosis/treatment or approved timestamps. The confirmed authorization failures instead involve legitimate routes used by accounts that should not have permission.

## Medium findings — correctness, privacy, UX and operational gaps

| ID | Finding / evidence | Source |
|---|---|---|
| M01 | Seed vaccine references explicitly say “sample protocol/reference” yet `is_verified=True`; catalogue endpoint/form includes unverified entries and schedule can retain linked unverified entries. No clinical-source signoff was established | `backend/app/seed/demo.py:94-102,138-172`; `backend/app/services/vaccination.py:30-55,69-101`; `backend/app/api/v1/vaccinations.py:41-50`; `web/src/pages/farmer-care.tsx:291-292,329-335` |
| M02 | Unlinked cooperative saw global appointment counts; farmer with no farm saw four foreign environmental alerts; vet saw three global case trend entries despite one assignment; vet finance exposed unassigned sibling-animal revenue | `backend/app/services/analytics.py:103-132`; `backend/app/api/v1/analytics.py:48-56`; `backend/app/services/access.py:54-59`; `backend/app/services/finance.py:40-44` |
| M03 | Old token still works after password change; self-profile PATCH changes password without current password. Default lifetime 12 hours. Signed no-exp token accepted; ordinary expired token rejected | `backend/app/api/v1/auth.py:112-122`; `backend/app/api/v1/users.py:33-44`; `backend/app/core/security.py:37-43` |
| M04 | Rate limit is per-process despite Redis comment; two-worker deployment multiplies allowance. Two independent limit-two instances each gave 200,200,429. Buckets never evicted; no separate account login throttle | `backend/app/core/middleware.py:41-66`; `backend/Dockerfile:22` |
| M05 | Photos anonymously accessible; UUID is not authorization. Full upload read precedes size check; image pixel exception can escape. No large image/load attack performed | `backend/app/main.py:105-107`; `backend/app/services/storage.py:25-46` |
| M06 | Schema accepts 128-character password but bcrypt rejects >72 bytes; 73-byte password produced registration 500 | `backend/app/schemas/domain.py:40-42,61-63`; `backend/app/core/security.py:12-13` |
| M07 | LLM structure schema accepts string/dict symptoms, extra unsafe fields and malformed metadata; an ungrounded allowed symptom can trigger a case. Failures fall back after one configured 20-second call; no retries | `backend/app/services/llm.py:55-63`; `backend/app/agents/intake.py:94-107` |
| M08 | Safety refusal sets response data but stored workflow/audit omits block reason/override; trace says response composed successfully. Negated “no dosage” style phrases cause false refusals | `backend/app/agents/intake.py:291-316`; `backend/app/agents/graph.py:109-137` |
| M09 | Negations can trigger false critical results; vomiting/unknown symptoms can receive low reassurance instead of unclear/review. Hindi/English written-out durations missed; romanized Marathi not supported by tested extraction | `backend/app/services/triage.py:155,183-209,239-264`; `backend/app/services/language.py:49-60,113-115` |
| M10 | Synced animal detail retains pending flag until animal-list reconciliation; QR disabled. Discard leaves cache/pending metadata. Reporting health for unsynced local animal receives 404 and queues nothing | `mobile/src/screens/AnimalDetailScreen.tsx:45-55,185-190`; `mobile/src/screens/AnimalsScreen.tsx:35-49`; `mobile/src/screens/SyncCentreScreen.tsx:101-110`; `mobile/src/screens/HealthScreen.tsx:169-213` |
| M11 | Cache only upserts, never removes obsolete server records; empty snapshot retains prior animal. Detail refresh does not update cache. Mobile first-100 animal list has no next-page retrieval; nutrition picker only first 12 | `mobile/src/db/database.ts:96-159`; `mobile/src/screens/AnimalDetailScreen.tsx:45-55`; `mobile/src/screens/AnimalsScreen.tsx:43-49,76-82`; `mobile/src/screens/NutritionScreen.tsx:53-68,154-163` |
| M12 | Sync retry disabled when offline, no reconnect listener; recovery depends on foreground/other refresh. Empty queue makes no network request but marks online and updates last-success timestamp | `mobile/src/context/AuthContext.tsx:42-59,115-124`; `mobile/src/screens/SyncCentreScreen.tsx:150`; `mobile/src/offline/sync.ts:68-70` |
| M13 | Rejected SQLite open promise remains memoized; init rejection leaves booting=true and splash stranded. Reproduced with dependency mocks, not a native SQLite failure | `mobile/src/db/database.ts:11-19`; `mobile/src/context/AuthContext.tsx:61-109` |
| M14 | Marathi shell surrounds English vaccination/market/finance content; urgency reasons and veterinary-ready notification are English even with language mr. Nutrition text can embed English guidance | `web/src/pages/farmer-care.tsx:81-84`; `web/src/pages/farmer-tools.tsx:94-98,345-349`; `backend/app/services/triage.py:239`; `backend/app/api/v1/health.py:188-191`; `backend/app/agents/intake.py:319-347` |
| M15 | Shared Field labels are neither htmlFor-associated nor wrapping controls. Live market DOM: 3 labels, 3 unassociated labels, 3 unnamed controls. Modal/keyboard/touch/contrast/font scaling not fully verified | `web/src/components/ui.tsx:226-230`; `web/src/pages/farmer-tools.tsx:114-132` |
| M16 | Mobile failed language PATCH implies later server synchronization but no preference queue exists; assistant clears text before request, so retry with ask() has no prompt | `mobile/src/screens/ProfileScreen.tsx:49-60`; `mobile/src/screens/AssistantScreen.tsx:110-143` |
| M17 | Finance loops cases, not unique animals: repeated open cases multiply same-animal estimated revenue difference. Live assumptions listed Ganga five times. Daily chart returns 14 days under a 30-day caption. Net arithmetic passed; estimate is not a measured loss | `backend/app/services/finance.py:96-143`; `web/src/pages/farmer-tools.tsx:362-363` |
| M18 | Health probe catches DB failure but returns HTTP 200 with degraded body, so HTTP-only platform health checks can keep an unusable instance healthy | `backend/app/main.py:121-139`; `render.yaml:8` |
| M19 | Lint scripts, native mobile tests, regression tests for reproduced failures, branch coverage and CI are missing. Existing green tests do not test the failed safety variants | `web/package.json:6-11`; `mobile/package.json:6-11`; `.github/workflows` absent |

## Low findings and documented limitations

- L01: Router future-flag warnings, oversized initial web chunk, deprecated 422 constant. These did not crash inspected happy paths.
- L02: Documentation overstates offline workflow parity, catalogue verification and some role contracts; demo dataset is not resettable to a reproducible clean state through a tested one-click flow.
- Web has no durable offline mutation queue/service worker found; direct Axios failures propagate. Do not claim web offline equivalence to mobile.
- External SMS/WhatsApp/push adapters explicitly remain pending without a provider; no delivery was fabricated by this audit.
- Animal/health list relationship loading is eager in inspected code; no list-serialization N+1 was demonstrated. Nutrition/vaccination routes load all accessible animals before slicing, so Python limits do not bound database work.
- No source-grounded 40+ multilingual evaluation corpus or clinically reviewed ground truth was completed in Step 1. Urgent recall, false-negative rate and per-language accuracy are **not yet measured** and must not be inferred from the 32 software tests or a few probes.

## Fix order and acceptance gates

1. **Deployment containment:** reject unsafe production JWT/demo configuration; stop exposing local database/cache ports as public defaults. Preserve an explicitly labelled local demo, never a publicly reachable default-admin deployment.
2. **Authorization and isolation:** H01-H07, M02/M03; require verified professionals, animal/case consistency, consent-controlled membership and account-scoped queues. Add regressions before claiming isolation.
3. **Urgent safety:** H12-H17; preserve highest urgency, honor structured inputs, always give emergency guidance even without an animal, treat unclear reports conservatively, validate and scan provider output, record safety events.
4. **Offline data integrity:** H08-H11, H14, M10-M13/M16; preserve conflicts, bind identities, chunk/drain queues, use one mutation identity across online/offline retry, make photos durable and failures visible, align health workflow.
5. **Vaccination:** H05/H18/M01; invalidate changed attestations, model booster/history correctly and replace sample provenance with reviewed references before claiming verified clinical protocols.
6. Only after those regressions pass, add the requested 40+ source-grounded multilingual suite and honest metrics, then UX/reliability/CI/demo improvements. Optional outbreak/heat/weekly-summary features remain deferred until stable.

Remaining work includes fixes with before/after evidence, clinical/source review, real Android golden/edge-case testing, real voice capture, screenshots/accessibility checks, PostgreSQL/Docker validation, AI evaluation, CI and the demo reset/script. This baseline report is not a claim that Steps 2-8 are complete.

## Remediation started after audit presentation

### Deployment-security batch — 2026-11-08

- **C01:** Render blueprint now disables demo seeding. Non-development/test settings reject `SEED_DEMO_DATA=true`, preventing accidental production seed creation.
- **C02:** Non-development/test settings reject the development key, documented placeholder keys and signing secrets shorter than 32 characters. Generated production keys are accepted. Validation exception text suppresses input values to avoid logging credentials.
- Local development/test explicitly retains the labelled demo. Environment aliases/whitespace cannot bypass the nonlocal guard. No existing database accounts were deleted or credentials rotated; already deployed demo accounts and exposed keys still require operator remediation.
- Regression evidence: `backend/app/tests/test_deployment_security.py`; full backend suite **49 passed** (baseline 32 plus 17 deployment checks). Existing Starlette 422 deprecation warning remains.
- This closes the configuration paths for C01/C02, not existing deployment exposure. No Render/Docker deployment was performed and no Git commit was possible. Production account provisioning is not yet implemented; do not use sample seeding as a substitute.

### Compose exposure batch — 2026-11-08

- **H19:** PostgreSQL and Redis no longer publish host ports. Compose requires `POSTGRES_PASSWORD` and `JWT_SECRET` environment values instead of fixed password/placeholder fallbacks; database username/name are environment-configurable. Backend defaults to production with demo seeding disabled and debug false.
- Local sample Compose requires explicit `ENVIRONMENT=development` and `SEED_DEMO_DATA=true`, still with separately generated credentials. No existing volumes were removed or credentials rotated; changing a password variable does not update an existing PostgreSQL volume.
- Full backend suite **51 passed** (19 deployment regressions). Compose YAML parsing passed; no database/cache host ports remain. Docker runtime and production account provisioning are still unverified/unimplemented respectively. All other High findings remained pending at this checkpoint.

### Batch A — urgent triage safety — 2026-11-08

**Scope:** remediation only, no new product features. Stop after A; authorization (B) and general offline integrity (C) are not started.

#### Regression-first evidence

- Pre-implementation existing backend baseline: **51 passed**.
- Added the initial **289** Batch A cases before application changes, including **44 parameterized phrase cases** across English/Hindi/Marathi (all 24 shipped warning labels plus audit variants). Initial run: **222 failed, 67 passed**. These are software-policy test results, not clinical error rates. See [initial detailed failures](audit-evidence/batch-a-before.txt) and [baseline count](audit-evidence/batch-a-before-summary.txt).
- Additional edge regressions were captured while integrating: appended online observations bypassed triage; Devanagari `ने`/word fragments were misread as negations; safe Hindi/Marathi templates triggered blocks; stronger appetite signs reduced urgency; normal observations incorrectly dismissed unknown complaints; blocked translations dropped emergency wording. Each was corrected after its failing check. See [integration failures](audit-evidence/batch-a-iteration.txt), [safe-template failures](audit-evidence/batch-a-iteration-2.txt), [appetite failure](audit-evidence/batch-a-appetite-before.txt), [unknown-report failures](audit-evidence/batch-a-unknown-before.txt) and [translation emergency failures](audit-evidence/batch-a-translation-emergency-before.txt).

#### Changes and finding status

| Finding / requirement | Batch A remediation |
|---|---|
| H12: missed urgent signs | Added cannot-breathe/choking, unconsciousness, sudden death, seizures/standing and high-fever variants, including all shipped Hindi/Marathi warning labels. Tested urgent phrases now return critical and require veterinary contact. |
| H15: urgency downgrade | Severity combines by maximum rank, including temperature and symptom combinations. Stronger appetite signs cannot weaken combination urgency. Existing-case re-triage preserves highest urgency. |
| H14: chips / workflow mismatch | Online new reports, appended observations and offline health observations execute the same health/safety/vet/follow-up graph. Chips and measurements force health routing even with neutral text. Client observation UUID/time and queued language are retained. Sync flushes inside the caller's savepoint rather than committing it. |
| H13: no resolved animal | Health/safety assessment continues; urgent guidance and escalation are returned, with null case/appointment IDs when no record/request can be created. No fabricated veterinary request. |
| M09: unknown / negation / duration | Unrecognized reports require medium-priority review, including when appetite or a temperature observation is normal. Local negation avoids tested false criticals and preserves positive signs after adversatives. Hindi `दो दिन/दो दिनों`, English `two days`, Marathi `दोन/२ दिवस` are recognized. Romanized ambiguous input no longer matches the `hi` greeting substring. |
| H16 / M08: output guard and persistence | Shared scanner examines composed localized output and every raw provider field for disallowed medical claims/doses/approvals in all three languages. Blocks use generic reasons, persist attributed `safety.output_blocked` audits and interaction `safety_events`, and mark trace status `blocked`. Disclaimers do not whitelist later unsafe clauses. |
| H17: translation | Both provider translations and missing-provider echoes are screened. Unsafe content is replaced and audited; emergency guidance from the source/output is retained. Safe unavailable-provider echoes are honestly labelled, not claimed to be translations. |
| M07: provider trust | Strict five-field schema, no coercion, no extras or duplicate JSON keys, grounded symptoms/code/duration, malformed fallback. At most two attempts for transient transport/429/5xx failures; no retries for invalid output or permanent errors. No shared mutable event state. |
| Clinical-accuracy claims / timing | Returned rule status is **needs vet review**; templates/catalogue disclaim clinical validation. A pending veterinary request no longer auto-confirms a two-hour appointment; critical wording says not to wait for the app or next-day follow-up. Professional diagnosis/treatment records are preserved. |

#### Final verification

- Full backend suite: **354 passed, 1 existing Starlette deprecation warning**, comprising the original 51 tests and 303 Batch A cases. All initial 289 regression cases now pass. [Final output](audit-evidence/batch-a-full-suite.txt).
- Web `npm run typecheck`: **pass**. [Output](audit-evidence/batch-a-web-typecheck.txt).
- Mobile `npm run typecheck`: **pass**. [Output](audit-evidence/batch-a-mobile-typecheck.txt).
- Real web-form smoke on isolated local demo database/API/Vite servers: Marathi neutral report plus breathing chip produced critical case `HC-261108-50E313`; unresolved unconscious-animal query showed immediate contact without a case/request; negated breathing query did not escalate. Browser showed no console errors and two existing React Router warnings. Persisted visit is `requested` with `scheduled_at=null`; records remain labelled sample. [Browser observations](audit-evidence/batch-a-browser.txt), [actual database evidence](audit-evidence/batch-a-browser-db.json).
- API/architecture documentation updated. No Git repository exists, so no commits were created.

#### Not fixed or not verified

- These rules, thresholds and multilingual regexes are **not clinically validated**. Passing the explicit corpus is not proof that every possible diagnosis/drug/dosage/negation wording is caught. Veterinarian review of thresholds and language coverage is still required.
- M09 is not completely closed: general transliteration/romanized auto-language detection and arbitrary language/duration understanding remain limited; unsupported reports route to review rather than a diagnosis. Hindi/Marathi triage reasons still include English strings (M14 remains open).
- No real Gemini calls or safety performance were evaluated: provider tests use explicitly mocked HTTP responses. No diagnosis, prescription, dose, physical examination or actual emergency veterinary response was verified.
- Native Android/Expo SQLite ownership, network loss, voice, camera and durable photos were not exercised: no Android SDK/device/emulator is available. Mobile queued-language change is typechecked, not device-tested.
- Batch B professional verification, cooperative consent/scoping, ownership and token invalidation remain pending at this checkpoint (remediated later — see the Batch B section below). Batch C general schema/role parity, global idempotency/conflict replay, queue chunking/retry identity and durable photos remain pending; shared health triage does not close those findings.
- Other audit findings outside A remain open. The application is still not production-safe.

### Batch B — authorization — 2026-11-09

**Scope:** remediation only, no new product features. Covers H01-H07, M02 and M03. Stop after B; offline integrity (C) is not started.

#### Regression-first evidence

- Pre-implementation backend baseline (after Batch A): **354 passed**.
- Added **28** authorization regression tests (`backend/app/tests/test_authorization.py`) before application changes, at least one per finding. Initial run: **22 failed, 6 passed**. The six passing were controls that already held (e.g. anonymous rejection, admin authority). See [initial failures](audit-evidence/batch-b-before.txt).
- Added the mobile H07 account-ownership test (`mobile/tests/database.test.ts`, Node built-in runner over a `node:sqlite` adapter mocking `expo-sqlite`/`expo-crypto`). Initial run: **1 fail** — `db.setActiveAccount is not a function`. See [mobile baseline](audit-evidence/batch-b-mobile-before.txt).

#### Changes and finding status

| Finding / requirement | Batch B remediation |
|---|---|
| H01: cooperative medical-record scope | `list_records` cooperative branch now restricts to animals on farms owned by **active** members (`where(False)` when none). Unlinked cooperative reads return empty; linked reads are a subset of member animals. |
| H02: consent-based membership | `add_member` creates status `pending` and notifies the farmer; no data access before consent. New farmer endpoints `GET /users/cooperative/invitations` and `POST /users/cooperative/invitations/{id}/decision` (accept → `active` + `consented_at`; decline → row removed). Other farmers get 404. Demo seed memberships are explicitly `active` with `consented_at`. |
| H03: animal/case consistency | `create_record` validates the linked case belongs to the same animal (422 `animal_case_mismatch`) and is accessible (404 otherwise). Sync applies the same check. Offline observations reopen resolved cases through the Batch A workflow. |
| H04: verified professionals | New `require_verified_professional` gate (403 `professional_not_verified`) on case assessment, clinical-record creation, approval decisions and vaccine verification. Unverified recording stores `verified_by=None`/no certificate. Changing registration_no/qualification resets `verified=False`. Admin retains verification and clinical-write authority. |
| H05: attestation invalidation | `mark_given` clears `verified_by` when a previously attested vaccination's administration date or batch changes; certificate already cleared. |
| H06: sync role/schema parity | Sync enforces canonical per-entity roles (cooperative feed → error, matching online 403), rejects non-animal `update` operations (422 `unsupported_operation`), and validates payloads with the same typed schemas as online routes (temperature 999, negative feed/cost/water → error). |
| H07: mobile account ownership | All five SQLite data tables gain `owner_id`; cache/queue/photo reads and writes are scoped to the active account. `setActiveAccount`/`getActiveAccount`/`clearActiveAccount` added; login sets the owner, logout clears that account's data and pending count. Legacy unowned rows are purged on upgrade. |
| M02: analytics/finance scope | Cooperative appointment counts and farmer environmental alerts scoped to accessible farms (none → empty). Vet case trends filter to assigned cases. Vet milk/loss finance follows `animal_query` (no unassigned sibling-animal revenue); egg/financial records stay farm-scoped. |
| M03: token lifecycle | Password change requires the current password, bumps `token_version`, and returns a fresh token; old tokens are rejected (401 `token_revoked`). Self-profile PATCH rejects password/is_active changes. Admin reset invalidates tokens. JWT decode requires `exp`/`sub`/`iat`; default lifetime reduced 12h → 2h. Web stores the returned token so the session survives a password change. |

#### Final verification

- Full backend suite: **382 passed, 3 warnings** (354 prior + 28 new authorization tests; warnings are the pre-existing Starlette 422 deprecation). All 28 regression tests pass. [Final output](audit-evidence/batch-b-full-suite.txt).
- Web `npm run typecheck`: **pass**. [Output](audit-evidence/batch-b-web-typecheck.txt).
- Mobile `npm run typecheck`: **pass**. [Output](audit-evidence/batch-b-mobile-typecheck.txt).
- Mobile H07 Node test: **1 pass, 0 fail**. [Output](audit-evidence/batch-b-mobile-test.txt).
- Alembic migration `b7c2d4e6f8a1` (additive `users.token_version`, `cooperative_memberships.consented_at`) applied to the development database and verified present.
- Real browser smoke on isolated local demo API (:8001) / Vite (:5174): password change showed "Password updated.", preserved the session, rotated the token, and the old token returned 401 `invalid_token` while the new token returned 200. Cooperative invite of a fresh farmer showed status **pending** with 0 animals; the farmer's invitation list returned the pending invite, accepting it activated membership and persisted `consented_at`, and the members table then showed **active**. Screenshot surface was unavailable; structural DOM/API evidence captured. [Browser observations](audit-evidence/batch-b-browser.txt).
- API/architecture documentation updated. No Git repository exists, so no commits were created.

#### Not fixed or not verified

- **No farmer-facing invitation UI** was added in web or mobile (the request forbids new features). The consent flow is API-only; farmers currently accept/decline via the endpoints, not a screen. The cooperative members screen shows pending/active status.
- **Mobile native/device behavior is unverified.** H07 is proven through a Node `node:sqlite` adapter mocking `expo-sqlite`, not a real Android device/emulator (none available). Account switching, logout clearing and durable behavior on-device remain uncertified.
- **Legacy mobile upgrade purges unowned queued rows.** Rows written before `owner_id` existed cannot be attributed to an account and are deleted on upgrade; this is data loss for pre-existing offline queues, chosen over leaking another account's data.
- **Admin retains clinical write/verification authority**, and vet egg/financial-record scoping stays farm-level (only animal-level milk/loss data follows `animal_query`). These are deliberate scope decisions, not audited defects.
- The original :8000/:5173 demo servers still run pre-Batch-B code in memory until restarted; the development database schema is migrated, but a restart is required to load the new authorization logic.
- Batch A clinical/regex limitations and multilingual gaps (M09/M14) are unchanged. Batch C offline-integrity findings (H08-H11, M10-M13) remain open. The application is still not production-safe.
