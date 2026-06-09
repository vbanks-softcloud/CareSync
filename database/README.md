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

## Architecture: Cognito for identity, RDS for app data

CareSync uses a strict split between auth/identity data and application data:

| Concern                                      | Lives in                            |
| -------------------------------------------- | ----------------------------------- |
| Email, password, MFA                         | **Cognito** user pool               |
| Name, date of birth, clinical role           | **Cognito** standard + custom attrs |
| Authorization (admin vs caregiver)           | **Cognito** groups (TBD)            |
| Patients, care notes, audit, voice recordings | **RDS** (MySQL)                     |
| Link between the two                         | `users.cognito_sub` in RDS          |

This keeps Cognito as the single source of truth for *who* a user is and prevents profile drift between two stores. The RDS `users` table holds nothing but the join key, so the frontend can attribute a patient/note row to a Cognito identity without RDS needing to know any personal details.

To display a user's name on a note created by someone else, the backend either:
1. Caches a `{cognito_sub → display_name}` map in memory / Redis, refreshed on demand, or
2. Joins lazily by calling `AdminGetUser` for unfamiliar subs.

Either pattern is fine; pick when we actually have multi-user surfaces.

## What's in `001_initial_mysql_schema.sql`

| Table             | What it holds                                                       |
| ----------------- | ------------------------------------------------------------------- |
| `users`           | Minimal — one row per Cognito user, linked via `cognito_sub`         |
| `patients`        | Patients under care                                                 |
| `care_notes`      | The structured notes produced from each voice transcription         |
| `audit_logs`      | Compliance / forensic trail of who did what                         |
| `voice_recordings`| Pointers to the raw audio in S3 (one row per recording)             |

Primary keys are `CHAR(36)` UUIDs everywhere. `ON DELETE CASCADE` propagates from `voice_recordings → care_notes → patients` so deleting a patient cleanly removes their notes and audio rows.

## Field mapping: frontend ↔ SQL

The frontend uses camelCase; the SQL uses snake_case; otherwise the field names line up 1-for-1.

### `patients` ↔ `Patient` (frontend)

| SQL column          | Frontend            |
| ------------------- | ------------------- |
| `id`                | `id`                |
| `name`              | `name`              |
| `age`               | `age`               |
| `room`              | `room`              |
| `condition_summary` | `conditionSummary`  |
| `created_by`        | _(server-side)_     |

`condition_summary` (not just `condition`) because `CONDITION` is a reserved word in SQL.

### `care_notes` ↔ `Note` / `StructuredNote` (frontend)

The structured fields are flat in SQL and nested under `Note.structured` on the frontend, but the names match:

| SQL column         | Frontend (`Note` / `StructuredNote`) |
| ------------------ | ------------------------------------ |
| `id`               | `id`                                 |
| `patient_id`       | `patientId`                          |
| `caregiver_id`     | _(server-side, derived from JWT)_    |
| `transcript`       | `transcript`                         |
| `patient_concern`  | `structured.patientConcern`          |
| `care_provided`    | `structured.careProvided`            |
| `patient_status`   | `structured.patientStatus`           |
| `follow_up_needed` | `structured.followUpNeeded`          |
| `created_at`       | `createdAt`                          |

### `users` — intentionally minimal

| SQL column     | Where the rest of "this user" lives                       |
| -------------- | --------------------------------------------------------- |
| `id`           | RDS-internal UUID for FK joins                            |
| `cognito_sub`  | The `sub` claim from the user's Cognito JWT (the link)    |
| `created_at`   | When we first saw this user                                |
| _(email)_      | Cognito `email` attribute                                  |
| _(first_name)_ | Cognito `given_name` attribute                             |
| _(last_name)_  | Cognito `family_name` attribute                            |
| _(birthdate)_  | Cognito `birthdate` attribute                              |
| _(occupation)_ | Cognito `custom:occupation` attribute                      |
| _(role)_       | Cognito group membership (e.g. `admins`, `caregivers`)     |

## Outstanding work for end-to-end RDS

In order to actually have application data persisted to RDS, the following still needs to happen — none of it is in the repo yet:

1. **Provision the instance** — CloudFormation template at `infrastructure/aws/rds.yml` (TBD) for an Aurora Serverless v2 MySQL cluster + subnet group + security group.
2. **Apply this schema** — connect to the instance once and run `001_initial_mysql_schema.sql`.
3. **Migration runner** — pick a tool (e.g. `umzug`, `node-pg-migrate`-equivalent for MySQL, or hand-rolled). Establishes the pattern for future numbered migrations.
4. **User upsert on sign-in** — Cognito post-confirmation Lambda OR backend middleware that inserts a `users` row the first time it sees a new `cognito_sub`.
5. **Backend API** — `POST /patients`, `GET /patients`, `POST /patients/:id/notes`, etc., backed by `mysql2` + a thin query helper or ORM.
6. **Frontend wiring** — swap `frontend/src/lib/caresync-store.ts` localStorage reads for `apiClient.*` calls; profile reads continue to hit Cognito directly.

## Planned

- `migrations/` — versioned schema changes after this initial cut
- `seeds/` — sample data for local dev / staging
- `scripts/` — backup / restore / one-off maintenance scripts
