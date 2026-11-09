# FarmPulse

**AI Livestock Guardian — Protecting Livestock. Empowering Farmers. Securing Rural Income.**

An agentic-AI livestock healthcare, nutrition and management platform built for the GAVS Hackathon. It combines a FastAPI + PostgreSQL backend, a LangGraph multi-agent engine, a React web console with farmer / veterinarian / cooperative / administrator portals, and an Expo mobile app with offline-first synchronization and a Marathi–Hindi–English assistant.

> **Hackathon Prototype Notice**: This project is an experimental hackathon prototype. The demonstration dataset is clearly marked as sample data. AI agents never diagnose disease, prescribe medicine, or replace a veterinarian. Preliminary assessments and triage rules require review and confirmation by an authorised veterinary professional before any treatment is given.

## Repository layout

```
backend/        FastAPI service, SQLAlchemy models, Alembic migrations, LangGraph agents, seed data, tests
web/            React + Vite + TypeScript + Tailwind console (four portals)
mobile/         Expo + React Native app with SQLite offline queue
docs/           Architecture, ER diagram, API contracts, milestones
docker-compose.yml
render.yaml
```

## Quick start (local, zero configuration)

Requirements: Python 3.12+, Node.js 20+.

```bash
# 1. Backend (SQLite by default; demo data is seeded on first start)
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
alembic upgrade head              # or let startup create the schema
uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs> · health probe: <http://localhost:8000/health>

```bash
# 2. Web console
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. The backend URL defaults to `http://localhost:8000/api/v1`; override with `VITE_API_URL`.

```bash
# 3. Mobile app (Android first)
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` (see `mobile/.env.example`) to the LAN address of the backend when testing on a physical device.

## Demonstration accounts

| Role | Email | Password |
|---|---|---|
| Farmer (Ramesh Patil, Marathi) | `ramesh@alg.demo` | `Demo@1234` |
| Farmer (Savitri Shinde) | `savitri@alg.demo` | `Demo@1234` |
| Veterinarian (Dr. Aarti Kulkarni) | `dr.aarti@alg.demo` | `Demo@1234` |
| Veterinarian (Dr. Vikram Jadhav) | `dr.vikram@alg.demo` | `Demo@1234` |
| Cooperative manager | `coop.pune@alg.demo` | `Demo@1234` |
| Administrator | `admin@alg.demo` | `Demo@1234` |

Demo data includes Ramesh's 3 cows, 2 buffaloes, 5 goats and 10 chickens, two veterinarians, a cooperative, vaccination schedules, an open Marathi voice-reported health case, a veterinarian-resolved mastitis case, nutrition, environmental observations, district market prices marked as demonstration data, production records and financial estimates.

## Core capabilities

- **Farmer-to-veterinarian health workflow** — voice/text report → intake → orchestrator → record retrieval → rule-based triage → safety approval → veterinary assignment → follow-up reminder.
- **Vaccination management** — species-specific catalogue with source references, due/overdue detection, reminders, veterinarian verification, certificates.
- **Nutrition and environment** — feed/water/mineral records, species profiles with reference sources, live Open-Meteo weather, threshold-based environmental alerts.
- **Market intelligence** — district-wise prices with source, observation date and unit; demonstration rows are explicitly flagged.
- **Financial impact** — production-derived revenue, recorded expenses, and an estimated revenue difference with explicit assumptions (not an audited loss statement).
- **Offline-first mobile** — Expo SQLite queue with UUIDs, idempotency keys, server-side conflict detection and sync ledger.
- **Multilingual assistant** — Marathi, Hindi and English intent detection, symptom extraction, localized responses and notifications.
- **Administration** — audit logs, agent monitor, veterinary verification, sync operations, guardrail status.

## Multi-agent architecture

`LangGraph StateGraph`: `intake → orchestrator → (record → health → safety → vet → followup | vaccination | nutrition | environment | market | finance) → respond`.

Eleven specialist responsibilities plus a language intake/normalisation node are implemented as orchestrated graph nodes (see `backend/app/agents/`), not disconnected chatbots. The central orchestrator plans the workflow; the safety node raises an approval gate whenever escalation is required; all interactions and agent actions are written to `ai_interactions` and `audit_logs`.

Without a `GEMINI_API_KEY` the engine uses a deterministic, multilingual expert-rule reasoner. With a key, Gemini is used only for intent/symptom structuring and translation — never for diagnosis, prescriptions or dosages.

## Safety guardrails

- No disease confirmation or medicine/dosage generation by AI.
- Urgent warning signs always escalate to a veterinarian.
- Vaccination schedules come only from the verified catalogue.
- Treatment records require a veterinarian-confirmed diagnosis plus treatment plan.
- Financial outputs expose assumptions; market prices expose source and date.
- Role-based access control, JWT auth, rate limiting, secure uploads, audit logging.

## Testing

```bash
cd backend
pytest -q

cd ../web
npm run build

cd ../mobile
npm run typecheck
npx expo-doctor
npm run export:android
```

The backend suite covers authentication, role isolation, animal CRUD, health triage/escalation, vaccination scheduling, offline sync idempotency/conflicts, market demo labelling, admin access control and the exact request shapes used by the mobile client. The web build type-checks all four portals; the mobile commands verify TypeScript, Expo configuration and a Hermes Android bundle.

## Deployment

- **Docker Compose**: set `POSTGRES_PASSWORD` to a generated URL-safe password and `JWT_SECRET` to a separately generated secret before `docker compose up --build`; use `python -c "import secrets; print(secrets.token_urlsafe(48))"` to generate each value. Compose defaults to unseeded production and does not publish PostgreSQL/Redis ports. For an isolated sample demo, explicitly set `ENVIRONMENT=development` and `SEED_DEMO_DATA=true`; never use that mode for public deployment. Existing database volumes retain their original password; changing the environment does not rotate it.
- **Render**: `render.yaml` provisions the API and a managed PostgreSQL database, generates the JWT secret and disables demo seeding. Outside development/test, startup rejects enabled demo seeding, known placeholder JWT secrets and secrets shorter than 32 characters. Set `ENVIRONMENT=production`, `SEED_DEMO_DATA=false` and a generated `JWT_SECRET`; generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Existing demo accounts are not removed automatically. Production account provisioning remains a deployment prerequisite; do not enable demo seeding to work around it.
- **Vercel**: deploy `web/` with `VITE_API_URL` pointing at the Render API (`web/vercel.json` provided).
- **Neon**: set `DATABASE_URL` to the pooled PostgreSQL connection string and run `alembic upgrade head`.

## Documentation

- [Baseline audit and release blockers](docs/AUDIT_REPORT.md) — the current application is not production-safe; native Android and real voice capture remain unverified.
- [Architecture](docs/ARCHITECTURE.md)
- [Database ER diagram](docs/ER_DIAGRAM.md)
- [API contracts](docs/API.md)
- [Development milestones](docs/MILESTONES.md)
- [Mobile offline guide](mobile/README.md)
