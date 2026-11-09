# Development Milestones

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo structure, architecture, ER diagram, API contracts | Complete |
| 2 | FastAPI core, 29-table schema, Alembic, JWT auth, RBAC, audit, rate limits | Complete |
| 3 | Farmer web console — dashboard, animals, health, vaccination, nutrition, environment, market, assistant, profile | Complete |
| 4 | Expo mobile app, SQLite offline queue, synchronization | Complete |
| 5 | Animal and healthcare modules with triage, escalation and professional records | Complete |
| 6 | LangGraph orchestrator and eleven agent responsibilities | Complete |
| 7 | Vaccination, nutrition and environmental modules | Complete |
| 8 | Veterinary coordination, case assignment, visit requests, approvals | Complete |
| 9 | Market intelligence and financial impact with provenance and assumptions | Complete |
| 10 | Marathi / Hindi / English voice-ready assistant and localized notifications | Complete |
| 11 | Tests, Docker, Render, Vercel, documentation | Complete |
| 12 | End-to-end hackathon demonstration (Ramesh scenario) | Complete |

## Demonstration flow (Ramesh)

1. Farmer logs in (`ramesh@alg.demo` / `Demo@1234`).
2. Dashboard shows 20 animals, open cases, overdue vaccinations, production and finance.
3. Animals list; open Ganga, view QR identifier and timeline.
4. Health → report symptoms in Marathi (text or voice in the mobile app).
5. Agents run: intake → orchestrator → record → health → safety → vet → followup → respond.
6. Triage shows severity and escalation; a case, visit request and notifications are created.
7. Veterinarian logs in, opens the assigned case, records diagnosis and treatment; the safety approval resolves.
8. Vaccination page shows the verified schedule (due / overdue) with source references.
9. Nutrition and environment pages show feed, water, live weather and threshold flags.
10. Market shows sourced district prices clearly marked as demonstration data.
11. Finance shows production-derived revenue and an estimated revenue difference with assumptions.
12. Administrator reviews audit logs, agent monitoring, veterinary verification and sync operations.

## Known boundaries

- Live SMS/WhatsApp/push delivery requires a provider gateway; messages remain pending until configured.
- Gemini is optional and restricted to structuring/translation; deterministic rules are the default.
- Demonstration market rows are labelled and sourced, not live mandi feeds.
- The mobile speech layer uses the device speech engine; typed input is always available as a fallback.
