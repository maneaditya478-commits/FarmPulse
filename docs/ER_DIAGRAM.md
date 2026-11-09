# Database ER Diagram

PostgreSQL in production, SQLite for zero-configuration demos. All domain tables use UUID primary keys, created/updated timestamps where mutable, foreign keys and targeted indexes. The initial Alembic migration is `backend/alembic/versions/*_initial_schema.py`.

```mermaid
erDiagram
  USERS ||--o{ FARMS : owns
  USERS ||--o| VETERINARIANS : has
  USERS ||--o{ COOPERATIVE_MEMBERSHIPS : cooperative
  USERS ||--o{ COOPERATIVE_MEMBERSHIPS : member

  SPECIES ||--o{ BREEDS : contains
  SPECIES ||--o{ ANIMALS : classifies
  SPECIES ||--o{ VACCINE_CATALOG : protocol
  SPECIES ||--o{ NUTRITION_PROFILES : guidance
  SPECIES ||--o{ LIVESTOCK_MARKET_PRICES : category
  BREEDS ||--o{ ANIMALS : breed

  FARMS ||--o{ ANIMALS : hosts
  FARMS ||--o{ ENVIRONMENTAL_RECORDS : observes
  FARMS ||--o{ EGG_PRODUCTION : produces
  FARMS ||--o{ FINANCIAL_RECORDS : books

  ANIMALS ||--o{ ANIMAL_IDENTIFIERS : identified_by
  ANIMALS ||--o{ HEALTH_CASES : reported
  ANIMALS ||--o{ HEALTH_OBSERVATIONS : observed
  ANIMALS ||--o{ HEALTH_RECORDS : history
  ANIMALS ||--o{ VACCINATIONS : receives
  ANIMALS ||--o{ FEED_RECORDS : fed
  ANIMALS ||--o{ WATER_RECORDS : watered
  ANIMALS ||--o{ BREEDING_RECORDS : bred
  ANIMALS ||--o{ MILK_PRODUCTION : yields
  ANIMALS ||--o{ FINANCIAL_RECORDS : attributed

  HEALTH_CASES ||--o{ HEALTH_OBSERVATIONS : collects
  HEALTH_CASES ||--o{ HEALTH_RECORDS : documents
  HEALTH_CASES ||--o{ VET_VISITS : requests
  HEALTH_CASES ||--o{ AGENT_APPROVALS : gates
  VETERINARIANS ||--o{ HEALTH_CASES : assigned
  VETERINARIANS ||--o{ VET_VISITS : performs
  VETERINARIANS ||--o{ VACCINATIONS : verifies
  VACCINE_CATALOG ||--o{ VACCINATIONS : schedules

  AI_INTERACTIONS ||--o{ AGENT_APPROVALS : requests
  USERS ||--o{ AI_INTERACTIONS : converses
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ SYNC_OPERATIONS : syncs
  USERS ||--o{ AUDIT_LOGS : acts

  USERS {
    uuid id PK
    string email UK
    string password_hash
    string role
    string language
    string district
    bool is_sample
  }
  FARMS {
    uuid id PK
    uuid owner_id FK
    string name
    string village
    string district
    float latitude
    float longitude
    bool is_sample
  }
  ANIMALS {
    uuid id PK
    uuid farm_id FK
    uuid species_id FK
    uuid breed_id FK
    string name
    string tag_code UK
    string sex
    date birth_date
    float weight_kg
    string status
    bool is_sample
  }
  ANIMAL_IDENTIFIERS {
    uuid id PK
    uuid animal_id FK
    string identifier_type
    string identifier_value UK
    string qr_payload
    bool is_active
  }
  HEALTH_CASES {
    uuid id PK
    uuid animal_id FK
    uuid farmer_id FK
    string case_code UK
    string symptom_summary
    string severity
    string status
    bool requires_vet
    json triage
    uuid assigned_vet_id FK
    text vet_diagnosis
    text vet_treatment
    uuid approved_by FK
    bool is_sample
  }
  HEALTH_OBSERVATIONS {
    uuid id PK
    uuid case_id FK
    uuid animal_id FK
    string appetite
    float temperature_c
    string milk_change
    json symptoms
    string source
  }
  HEALTH_RECORDS {
    uuid id PK
    uuid animal_id FK
    uuid case_id FK
    string record_type
    string title
    bool approved
    uuid professional_id FK
  }
  VACCINE_CATALOG {
    uuid id PK
    uuid species_id FK
    string name
    string disease
    int age_weeks
    int booster_days
    string source_reference
    bool is_verified
  }
  VACCINATIONS {
    uuid id PK
    uuid animal_id FK
    uuid vaccine_id FK
    date administered_on
    date due_on
    string status
    string batch_no
    uuid verified_by FK
    string certificate_ref
  }
  VETERINARIANS {
    uuid id PK
    uuid user_id FK UK
    string registration_no UK
    string qualification
    string district
    bool verified
    string availability
    float latitude
    float longitude
  }
  VET_VISITS {
    uuid id PK
    uuid case_id FK
    uuid vet_id FK
    string visit_type
    string status
    datetime scheduled_at
    datetime completed_at
  }
  NUTRITION_PROFILES {
    uuid id PK
    uuid species_id FK
    string stage
    float dry_matter_kg
    text feed_guidance
    float water_litres
    string reference_source
  }
  FEED_RECORDS {
    uuid id PK
    uuid animal_id FK
    string feed_type
    float quantity_kg
    float cost
    datetime recorded_at
  }
  WATER_RECORDS {
    uuid id PK
    uuid animal_id FK
    float litres
    string source
    datetime recorded_at
  }
  ENVIRONMENTAL_RECORDS {
    uuid id PK
    uuid farm_id FK
    float temperature_c
    float humidity_pct
    int shed_cleanliness
    bool water_available
    json risk_flags
    string source
  }
  BREEDING_RECORDS {
    uuid id PK
    uuid animal_id FK
    string event_type
    date event_date
    bool pregnancy_confirmed
    date expected_delivery
  }
  MILK_PRODUCTION {
    uuid id PK
    uuid animal_id FK
    date record_date
    string session
    float litres
    float price_per_litre
  }
  EGG_PRODUCTION {
    uuid id PK
    uuid farm_id FK
    date record_date
    int eggs_count
    float price_per_egg
  }
  LIVESTOCK_MARKET_PRICES {
    uuid id PK
    uuid species_id FK
    string category
    string district
    float price_per_unit
    string unit
    date observed_on
    string source
    bool is_demo
  }
  FINANCIAL_RECORDS {
    uuid id PK
    uuid farm_id FK
    uuid animal_id FK
    date record_date
    string record_type
    string category
    float amount
    bool is_estimate
    json assumptions
  }
  NOTIFICATIONS {
    uuid id PK
    uuid user_id FK
    string channel
    string type
    string status
    datetime scheduled_at
    datetime sent_at
  }
  AI_INTERACTIONS {
    uuid id PK
    uuid user_id FK
    uuid animal_id FK
    string session_id
    string intent
    text input_text
    text response_text
    json workflow
    json agents_used
    bool escalated
  }
  AGENT_APPROVALS {
    uuid id PK
    uuid interaction_id FK
    uuid case_id FK
    string agent_name
    string action
    string status
    uuid decided_by FK
  }
  KNOWLEDGE_DOCUMENTS {
    uuid id PK
    string title
    text content
    string source
    string category
    string species_code
    json embedding
    bool is_verified
  }
  COOPERATIVE_MEMBERSHIPS {
    uuid id PK
    uuid cooperative_id FK
    uuid farmer_id FK
    string member_code
    string status
  }
  AUDIT_LOGS {
    uuid id PK
    uuid actor_id FK
    string actor_role
    string action
    string entity_type
    string entity_id
    json detail
  }
  SYNC_OPERATIONS {
    uuid id PK
    uuid user_id FK
    string client_id
    string entity_type
    string entity_id
    string operation
    string idempotency_key UK
    string status
  }
```

## Notes

- `nutrition_profiles` is species-level guidance; per-animal feed and water observations live in `feed_records` and `water_records`.
- `health_records` stores the immutable professional history (diagnosis/treatment), while `health_cases` holds the working case state.
- `agent_approvals` is the safety gate: a pending row blocks treatment recording until a veterinary professional confirms the assessment.
- `sync_operations.idempotency_key` is unique, making mobile retries safe.
- `livestock_market_prices.is_demo` is mandatory for demonstration rows; every price carries `source`, `observed_on` and `unit`.
- `knowledge_documents.embedding` is a JSON placeholder for pgvector in PostgreSQL deployments; the deterministic engine does not require embeddings.
