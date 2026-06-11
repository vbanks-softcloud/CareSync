# CareSync Architecture

## Project Overview

CareSync is a clinical voice-notes web application that allows caregivers to record patient notes and convert them into structured, searchable medical records.

The application is designed using a cloud-native architecture on AWS.

---

## High-Level Architecture

```text
Users
   │
   ▼
CloudFront
   │
   ▼
S3 Frontend
   │
   ▼
API Gateway
   │
   ▼
AWS Lambda
   │
   ▼
Amazon RDS MySQL
```

---

## Frontend Layer

### Amazon S3

The frontend application is hosted as a static website in Amazon S3.

Responsibilities:

* Store HTML, CSS, JavaScript, and application assets
* Serve frontend content
* Integrate with CloudFront

### Amazon CloudFront

CloudFront distributes frontend content globally.

Responsibilities:

* HTTPS access
* Content caching
* Improved application performance
* Global content delivery

---

## Backend Layer

### Amazon API Gateway

API Gateway provides REST API endpoints for frontend communication.

Responsibilities:

* Receive frontend requests
* Route requests to Lambda functions
* Provide secure API access

### AWS Lambda

Lambda executes backend application logic.

Responsibilities:

* Process caregiver requests
* Manage patient records
* Interact with the database
* Return API responses

Current Status:

* Backend Lambda development is in progress

---

## Database Layer

### Amazon RDS MySQL

Amazon RDS stores application data.

Current schema includes:

* users
* patients
* care_notes
* audit_logs
* voice_recordings

Responsibilities:

* Store patient information
* Store care notes
* Store audit activity
* Store voice recording metadata

---

## Voice Recording Storage


Database table:



Stores:

* S3 bucket name
* S3 object key
* Recording metadata


 ## Database Security Groups

- RDS Security Group
- Lambda Security Group
- EC2 Administrative Security Group

The RDS security group allows MySQL traffic on port 3306 only from approved application resources inside the VPC.

---

## Security Design

Planned security controls:

* IAM roles for AWS services
* Security Groups
* HTTPS via CloudFront
* Secrets Manager for database credentials
* Least-privilege access model

## Web Application Firewall (WAF)

CareSync uses AWS WAF to help protect the application from common web threats before traffic reaches the frontend.

AWS WAF is associated with the CloudFront distribution and acts as the first layer of defense for incoming web requests.

Security benefits:

- Filters malicious traffic
- Helps mitigate common web attacks
- Provides managed and custom security rules
- Adds an extra layer of protection before requests reach CloudFront

Traffic flow:

User
↓
AWS WAF
↓
CloudFront
↓
S3 Frontend
↓
Amazon Cognito
↓
Application Services
---

## DevOps Responsibilities

The DevOps team is responsible for:

* Infrastructure documentation
* CI/CD automation
* Deployment management
* Monitoring and logging
* Infrastructure as Code

---

## Planned CI/CD Workflow

```text
Developer Push
        │
        ▼
GitHub Repository
        │
        ▼
CI/CD Pipeline
        │
        ▼
Lint and Testing
        │
        ▼
Frontend Deployment to S3
        │
        ▼
Lambda Deployment
        │
        ▼
CloudWatch Monitoring
```

---

## Monitoring

Planned monitoring services:

* CloudWatch Logs
* CloudWatch Metrics
* Lambda Error Monitoring
* API Gateway Monitoring
* RDS Monitoring

## Logging and Monitoring

CareSync uses a dedicated Amazon S3 bucket for log storage.

Potential log sources include:

- CloudFront access logs
- Security-related logs
- Operational monitoring data

Benefits:

- Troubleshooting
- Auditability
- Security monitoring
- Historical log retention

Architecture:

User
↓
AWS WAF
↓
CloudFront
↓
S3 Frontend

CloudFront Logs
↓
S3 Logs Bucket

---

## Current Project Status

Completed:

* Frontend repository
* S3 hosting
* CloudFront distribution
* Database schema design
* Amazon RDS deployment

In Progress:

* AWS Lambda development
* API Gateway integration

Planned:

* CI/CD automation
* Infrastructure as Code
* Monitoring dashboards
* Automated deployments
