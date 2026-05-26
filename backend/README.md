# Backend

AWS Lambda functions for CareSync AI, managed with the [Serverless Framework](https://www.serverless.com/).

## Services planned

- API Gateway (HTTP API) in front of Lambda handlers
- Amazon Cognito for auth (with MFA)
- DynamoDB / RDS for persistence (decide per service)
- S3 for media (voice notes)
- EventBridge / SQS for async workflows

## Local development

```bash
# From repo root
npm install                       # installs workspaces
npm run dev:backend               # runs `serverless offline`
```

The local API is served at <http://localhost:3000>.

Health check:

```bash
curl http://localhost:3000/health
```

## Deployment

```bash
# Configure AWS credentials first (aws configure / SSO / etc.)
npm run deploy:backend            # deploys to dev stage
npm run deploy --workspace=@caresync/backend -- --stage prod
```

## Layout

```
backend/
├── src/
│   └── handlers/
│       └── health.ts            # GET /health
├── serverless.yml               # Serverless config (functions, IAM, plugins)
├── tsconfig.json
└── package.json
```

## Adding a new function

1. Create `src/handlers/<name>.ts` exporting `handler`.
2. Add it under `functions:` in `serverless.yml` with the relevant `httpApi` event(s).
3. Test locally with `npm run dev:backend`, then deploy.
