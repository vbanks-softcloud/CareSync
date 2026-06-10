# CareSync Database Deployment Guide

## Overview

CareSync uses Amazon RDS MySQL as the primary relational database for storing application data.

The database schema is located at:

```text
database/schemas/001_initial_mysql_schema.sql
```

This schema creates the CareSync database and the core tables required by the application.

---

## Database Engine

Target database:

```text
Amazon RDS MySQL
```

Default database:

```text
caresync
```

---

## Database Tables

### users

Stores application users.

Fields include:

* id
* cognito_sub
* email
* role
* created_at

Purpose:

* Store caregiver accounts
* Store administrator accounts
* Support user authentication mapping

---

### patients

Stores patient information.

Fields include:

* id
* name
* age
* room
* condition_summary
* created_by
* created_at
* updated_at

Purpose:

* Maintain patient records
* Track patient ownership

---

### care_notes

Stores structured patient care notes.

Fields include:

* id
* patient_id
* caregiver_id
* transcript
* patient_concern
* care_provided
* patient_status
* follow_up_needed
* created_at

Purpose:

* Store caregiver notes
* Support patient history tracking

---

### audit_logs

Stores application audit events.

Fields include:

* id
* user_id
* action
* entity_type
* entity_id
* created_at

Purpose:

* Activity tracking
* Compliance monitoring
* Audit reporting

---

### voice_recordings

Stores metadata about voice recordings.

Fields include:

* id
* note_id
* s3_bucket
* s3_key
* duration_seconds
* created_at

Purpose:

* Store S3 location of recordings
* Support audio retrieval

---

## Deployment Process

The schema can be applied to Amazon RDS using a MySQL client.

Example deployment:

```bash
mysql -h <RDS_ENDPOINT> -u <USERNAME> -p < database/schemas/001_initial_mysql_schema.sql
```

Replace:

* RDS_ENDPOINT
* USERNAME

with actual deployment values.

---

## Lambda Database Connection

The backend Lambda function will require:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

Recommended storage:

```text
AWS Secrets Manager
```

Database credentials should never be hardcoded.

---

## Networking Requirements

Lambda and RDS should reside within the same VPC.

Required configuration:

* Private subnets
* Security groups
* MySQL port 3306

Security group rules should allow Lambda access to RDS.

---

## Security Recommendations

Recommended controls:

* Store credentials in Secrets Manager
* Restrict RDS access to application services only
* Enable encryption at rest
* Enable automated backups
* Follow least-privilege access principles

---

## Backup Strategy

Recommended configuration:

* Automated backups enabled
* Snapshot before schema updates
* Backup retention policy configured

---

## Monitoring

Use Amazon CloudWatch to monitor:

* Database connections
* CPU utilization
* Storage usage
* Performance metrics
* Database errors

---

## Future Enhancements

Planned improvements:

* Automated schema deployment
* Infrastructure as Code support
* CloudFormation or Terraform integration
* CI/CD database migration process
* Enhanced monitoring and alerting

