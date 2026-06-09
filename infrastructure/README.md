# Infrastructure

Infrastructure-as-code for shared AWS resources that aren't owned by a single Lambda service.

Most per-service AWS resources (Lambda, API Gateway, IAM roles, etc.) are defined in `backend/serverless.yml`. This folder is for resources that span services or are managed independently, e.g.:

- S3 buckets + CloudFront distribution for the frontend (S3 + CloudFront hosting)
- Cognito User Pool + Identity Pool (with MFA)
- DynamoDB tables shared across services
- VPC / networking
- Route 53 records
- ACM certificates

## Tooling

To be decided. Likely candidates given the rest of the stack:

- Serverless Framework "compose" or extra `serverless.yml` files
- AWS CDK (TypeScript)
- Terraform

For now this folder is a placeholder.
