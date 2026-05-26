# Database

Database schemas, migrations, and seed data.

## Planned contents

- `migrations/` — versioned schema changes
- `seeds/` — sample data for local dev / staging
- `schemas/` — DynamoDB single-table designs, or SQL DDL
- `scripts/` — backup / restore / one-off maintenance scripts

The actual database choice (DynamoDB vs RDS / Aurora) is TBD; this folder is structured so it can hold artifacts for either.
