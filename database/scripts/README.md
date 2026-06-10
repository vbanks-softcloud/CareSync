# Database scripts

One-off Node scripts for applying schema, seeding, and similar operations against the RDS instance. Not part of the deployed Lambda code.

## `apply-schema.mjs`

Connects to the RDS instance over a regular MySQL connection and runs `../schemas/001_initial_mysql_schema.sql` against it. Use this for the initial setup and whenever you bump the schema during development.

### Prerequisites (one-time)

The RDS instance is in a private subnet by default, so your laptop can't reach it. You have two options:

#### Option A — Temporarily make the RDS reachable from your laptop (fastest)

1. **Get your public IP.** Visit https://checkip.amazonaws.com or run `curl https://checkip.amazonaws.com`. It'll look like `203.0.113.42`.
2. **RDS console** → your instance → **Modify** → scroll to **Connectivity** → **Public access** → **Publicly accessible** → flip to **Yes** → at the bottom, choose **Apply immediately** → **Modify DB instance**. Wait ~2 min for status to return to "Available".
3. **EC2 console → Security Groups → `CareSync-rds-sg` (sg-0db524e8abe4974c3)** → **Inbound rules** → **Edit inbound rules** → **Add rule**:
   - Type: `MYSQL/Aurora`
   - Source: `My IP` (auto-fills your `/32`)
   - Description: `temp: schema apply from laptop`
   - Save rules.
4. Run the script (below).
5. **Undo both changes when done** — delete the inbound rule, flip `Publicly accessible` back to `No`. The script will remind you.

#### Option B — Run from an EC2 in the VPC

If you have an EC2 instance in one of the SGs already allowed by `CareSync-rds-sg`, SSH there, `git clone` the repo, install Node 20, and run the script with the same env vars. Skip the public-access flipping.

### Running the script

From the repo root:

```powershell
cd database/scripts
npm install
$env:DB_HOST = "caresync-db.cmf2m8o2079n.us-east-1.rds.amazonaws.com"
$env:DB_USER = "admin"
$env:DB_PASSWORD = "<paste it here in your terminal — never commit>"
npm run apply-schema
```

You should see:

```
Connected to caresync-db.<...>.rds.amazonaws.com as admin.
Applying .../001_initial_mysql_schema.sql (...)
Schema applied successfully.

Tables in `caresync`:
  - audit_logs
  - care_notes
  - patients
  - users
  - voice_recordings
```

If it fails with "table already exists", the schema is partially applied from a previous run. To start fresh during development, add `DROP_FIRST=true`:

```powershell
$env:DROP_FIRST = "true"
npm run apply-schema
```

**Never** set `DROP_FIRST=true` once real data is in the DB — it drops the entire `caresync` database.

### Clearing the password from your shell

After you're done:

```powershell
Remove-Item Env:\DB_PASSWORD
```

This is good hygiene — keeps the password from sitting in your shell history / environment.
