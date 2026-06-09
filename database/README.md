# Database

MySQL schema, ER diagram, and (eventually) migrations / seeds / scripts for the CareSync RDS instance.

## Layout

```
database/
├── img/
│   └── ERD.jpg                          # entity-relationship diagram
└── schemas/
    └── 001_initial_mysql_schema.sql     # full DDL — five tables
```

## What's in `001_initial_mysql_schema.sql`

Five tables wired together as the v1 data model.

| Table             | What it holds                                                         |
| ----------------- | --------------------------------------------------------------------- |
| `users`           | App users, one row per Cognito identity (`cognito_sub` is the link)   |
| `patients`        | Patients under care                                                   |
| `care_notes`      | The structured notes produced from each voice transcription           |
| `audit_logs`      | Compliance / forensic trail of who did what                           |
| `voice_recordings`| Pointers to the raw audio in S3 (one row per recording)               |

Primary keys are `CHAR(36)` UUIDs everywhere. `ON DELETE CASCADE` propagates from `voice_recordings → care_notes → patients` so deleting a patient cleanly removes their notes and audio rows.

## How it maps to the Cognito + frontend models

The frontend uses camelCase; the SQL uses snake_case; otherwise the field names line up 1-for-1.

### `users` ↔ Cognito attributes ↔ `UserProfile` (frontend)

| SQL column       | Cognito attribute      | Frontend (`UserProfile`) |
| ---------------- | ---------------------- | ------------------------ |
| `cognito_sub`    | `sub` (built-in)       | _(not exposed)_          |
| `email`          | `email`                | `email` (from `AuthUser`)|
| `first_name`     | `given_name`           | `firstName`              |
| `last_name`      | `family_name`          | `lastName`               |
| `birthdate`      | `birthdate`            | `birthdate`              |
| `occupation`     | `custom:occupation`    | `occupation`             |
| `role`           | _(app-managed)_        | _(not exposed)_          |
| `created_at`     | _(auto)_               | `createdAt`              |

`role` is auth scope (`admin` vs `caregiver`). `occupation` is the clinical role the user identifies as (RN, CNA, Caregiver, Family Member, ...) — see `OCCUPATIONS` in `frontend/src/lib/caresync-store.ts` for the full list. Kept as `VARCHAR(40)` not `ENUM` so adding a new clinical role in the app doesn't require a schema migration.

### `patients` ↔ `Patient` (frontend)

| SQL column          | Frontend          |
| ------------------- | ----------------- |
| `id`                | `id`              |
| `name`              | `name`            |
| `age`               | `age`             |
| `room`              | `room`            |
| `condition_summary` | `conditionSummary`|
| `created_by`        | _(server-side)_   |

`condition_summary` (and not just `condition`) because `CONDITION` is a reserved word in SQL.

### `care_notes` ↔ `Note` / `StructuredNote` (frontend)

The structured fields are flat in SQL and nested under `Note.structured` on the frontend, but the names match:

| SQL column          | Frontend (`Note` / `StructuredNote`)    |
| ------------------- | --------------------------------------- |
| `id`                | `id`                                    |
| `patient_id`        | `patientId`                             |
| `caregiver_id`      | _(server-side)_                         |
| `transcript`        | `transcript`                            |
| `patient_concern`   | `structured.patientConcern`             |
| `care_provided`     | `structured.careProvided`               |
| `patient_status`    | `structured.patientStatus`              |
| `follow_up_needed`  | `structured.followUpNeeded`             |
| `created_at`        | `createdAt`                             |

## Planned

- `migrations/` — versioned schema changes after this initial cut
- `seeds/` — sample data for local dev / staging
- `scripts/` — backup / restore / one-off maintenance scripts
- IaC (CloudFormation or Terraform) for the RDS instance itself — TBD which AWS account hosts it
