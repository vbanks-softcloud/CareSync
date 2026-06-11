# Database

This folder contains database schema files, migration files, seed data, and database-related scripts for the CareSync application.
CareSync uses a MySQL database hosted on Amazon RDS to store caregiver users, patients, care notes, audit logs, and optional voice recording metadata.

## Database Purpose 
1. A caregiver sign in.
2. The caregiver adds or selects a patient.
3. The caregiver records or type a care note.
4. The app structures the note into clinical section.
5. The note is saved to the patient record.
6. Imprtant actions are tracked in aduit logs.

## Folder Structure 
```text
database/
├── README.md
├── img/
│   └── ERD.jpg
└── schemas/
    └── 001_initial_mysql_schema.sql
```
## Main Schema File 
The initial MySQL schema is stored in: 
`database/schemas/001_initial_mysql_schema.sql`
The file creats the caresync database and the main tables:
`users
patients
care_notes
audit_logs
voice_recordings`
## Table Overview 
#  Users 
Stores CareSync users such as caregivers and admins.
Authentication is handled by AWS Cognito, so passwords are not stored in this table.

#  patients
Stores patient profile information such as name, age, room, and condition summary.
Each patient can be connected to the user who created the patient record.

#  care_notes
Stores the main clinical documentation for each patient.
Each note belongs to one patient and can be connected to the caregiver who wrote it.
The table stores:
` Original transcript`
` Patient concern`
` Care provided`
` Patient status`
` Follow-up needed`
# audit_logs
Stores important system actions for accountability and security.
Examples:
`User created a patient`
`User saved a care note`
`User updated a record`

# voice_recordings
Optional table for storing audio recording metadata.
The actual audio file should be stored in Amazon S3. This table stores the S3 bucket and object key.

## Table Relationship 
`users.id → patients.created_by`
`users.id → care_notes.caregiver_id`
`patients.id → care_notes.patient_id`
`users.id → audit_logs.user_id`
`care_notes.id → voice_recordings.note_id`
![CareSync ERD](img/ERD.jpg)





