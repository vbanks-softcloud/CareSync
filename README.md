# CareSync AI

Monorepo for **CareSync**, a clinical voice-notes platform. The repo is organized as multiple workspaces around an **AWS-hosted** stack:

- **Frontend** — TanStack Router SPA (Vite build), served as static assets from **S3 + CloudFront**
- **Backend** — AWS Lambda functions managed by **Serverless Framework**, fronted by API Gateway, with Cognito (MFA) for auth

## Repository structure

```
CareSync/
├── .github/
│   ├── workflows/
│   │   ├── frontend-deploy.yml         # build & sync to S3 / invalidate CloudFront
│   │   ├── backend-deploy.yml          # serverless deploy
│   │   ├── test-workflow.yml           # lint + build + test on push/PR
│   │   ├── security-scan.yml           # npm audit, CodeQL, gitleaks
│   │   └── pull-request-check.yml      # per-area PR checks
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── task_template.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
│
├── frontend/                # TanStack Router SPA (S3 + CloudFront target)
│   ├── index.html           # Vite SPA entry document
│   ├── src/
│   │   ├── main.tsx         # React mount + RouterProvider
│   │   └── routes/          # File-based routes
│   ├── scripts/deploy-s3.mjs# One-shot local deploy helper (aws s3 sync + CF invalidation)
│   ├── vite.config.ts
│   └── package.json         # @caresync/frontend
│
├── backend/                 # AWS Lambda services via Serverless Framework
│   ├── src/handlers/
│   ├── serverless.yml
│   └── package.json         # @caresync/backend
│
├── infrastructure/          # IaC for shared AWS resources
│   └── aws/
│       ├── frontend-cdn.yml             # S3 bucket + CloudFront distribution (OAC)
│       └── github-oidc-deploy-role.yml  # IAM role for GitHub Actions deploys
├── database/                # Schemas, migrations, seeds
├── ci-cd/                   # Shared CI scripts / Dockerfiles
├── docs/                    # Architecture, ADRs, runbooks
├── scripts/                 # Repo-wide helper scripts
│
├── package.json             # npm workspaces root
└── README.md
```

## Tech stack

### Frontend (`frontend/`)

- [TanStack Router](https://tanstack.com/router) (file-based routes, client-side only — no SSR)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 7](https://vite.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/)
- [TanStack Query](https://tanstack.com/query), [React Hook Form](https://react-hook-form.com/), [Zod](https://zod.dev/)
- Build output is a static SPA bundle in `frontend/dist/`, hosted from a private S3 bucket behind CloudFront.

### Backend (`backend/`)

- [AWS Lambda](https://aws.amazon.com/lambda/) (Node.js 20.x)
- [Serverless Framework v4](https://www.serverless.com/) + `serverless-esbuild` + `serverless-offline`
- API Gateway (HTTP API)
- Amazon Cognito (MFA), DynamoDB / RDS (TBD), S3, EventBridge (planned)

## Prerequisites

- **Node.js `>= 20.19` or `>= 22.12`**
- **npm 10+**
- **AWS CLI** configured (`aws configure` or SSO) for deployments

If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use 22.22.3
# or make it default:
nvm alias default 22.22.3
```

## Getting started

```bash
# 1. Clone and enter the repo
git clone https://github.com/vbanks-softcloud/CareSync.git
cd CareSync

# 2. Confirm Node version
node --version

# 3. Install all workspaces (frontend + backend) in one go
npm install

# 4. Run the frontend dev server
npm run dev:frontend
# -> http://localhost:8080/

# 5. Run the backend locally (serverless-offline)
npm run dev:backend
# -> http://localhost:3000/health
```

## Available scripts (root)

| Command                    | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run dev`              | Alias for `dev:frontend`                                           |
| `npm run dev:frontend`     | Start the Vite dev server (port `8080`)                            |
| `npm run dev:backend`      | Run Lambda functions locally with `serverless offline` (port `3000`)|
| `npm run build`            | Build every workspace (if a `build` script is defined)             |
| `npm run build:frontend`   | Production build of the frontend                                   |
| `npm run build:backend`    | Package the backend with `serverless package`                      |
| `npm run lint`             | Lint every workspace                                               |
| `npm run format`           | Prettier-format the whole monorepo                                 |
| `npm run deploy:frontend`  | (stub) Deploy frontend to S3 + CloudFront                          |
| `npm run deploy:backend`   | `serverless deploy` to the configured AWS account                  |

## Git branching strategy

```
main          ← production, protected, deploys to prod
└── develop   ← integration branch, deploys to dev/staging
    ├── feature/frontend-ui
    ├── feature/authentication
    ├── feature/cognito-mfa
    ├── feature/api-gateway
    ├── feature/lambda-functions
    ├── feature/dashboard
    ├── feature/database
    ├── feature/security
    ├── feature/testing
    └── hotfix/*           ← branched from main, merged back to main + develop
```

- Open PRs against `develop` for normal work; PRs to `main` only from `develop` (releases) or `hotfix/*`.
- Branch protection: require PR review, passing CI, and CODEOWNERS approval on `main` and `develop`.

## Deployment overview

| Target           | Tool                     | Triggered by                                   |
| ---------------- | ------------------------ | ---------------------------------------------- |
| Frontend (S3+CF) | GitHub Actions + AWS CLI | Push to `main` touching `frontend/`            |
| Backend (Lambda) | Serverless Framework     | Push to `main` touching `backend/` (or manual) |
| Infra (shared)   | CloudFormation           | Manual `aws cloudformation deploy`             |

Configure AWS credentials in GitHub Actions via OIDC + an IAM role (`role-to-assume`) — no long-lived access keys.

### Frontend hosting (S3 + CloudFront)

The frontend is a pure static SPA. `npm run build:frontend` produces a `frontend/dist/` directory that is uploaded to a private S3 bucket and served through a CloudFront distribution using Origin Access Control.

1. **Provision the bucket + distribution** (one-time, in `us-east-1`):

   ```bash
   aws cloudformation deploy \
     --stack-name caresync-frontend-prod \
     --template-file infrastructure/aws/frontend-cdn.yml \
     --region us-east-1 \
     --parameter-overrides BucketName=caresync-frontend-prod
   ```

   See [`infrastructure/aws/README.md`](infrastructure/aws/README.md) for adding a custom domain + ACM certificate.

2. **Provision the GitHub Actions deploy role** (one-time):

   ```bash
   aws cloudformation deploy \
     --stack-name caresync-frontend-deploy-role \
     --template-file infrastructure/aws/github-oidc-deploy-role.yml \
     --region us-east-1 \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       GitHubOrg=vbanks-softcloud \
       FrontendBucketName=caresync-frontend-prod \
       CloudFrontDistributionArn=arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DIST_ID>
   ```

3. **Set GitHub Actions secrets** on the repo:

   | Secret                | Value                                                                      |
   | --------------------- | -------------------------------------------------------------------------- |
   | `AWS_DEPLOY_ROLE_ARN` | Output `RoleArn` from the OIDC role stack                                  |
   | `FRONTEND_BUCKET`     | Bucket name (e.g. `caresync-frontend-prod`)                                |
   | `CF_DISTRIBUTION_ID`  | CloudFront distribution ID (output `DistributionId` from the CDN stack)    |

   After that, every push to `main` that touches `frontend/` will build, sync to S3, and invalidate CloudFront automatically.

4. **Deploy manually from your workstation** if needed:

   ```bash
   cd frontend
   npm run build
   CARESYNC_FRONTEND_BUCKET=caresync-frontend-prod \
   CARESYNC_CF_DISTRIBUTION_ID=<DIST_ID> \
   npm run deploy
   ```

## Troubleshooting

### `Vite requires Node.js version 20.19+ or 22.12+`

Switch with `nvm`:

```bash
nvm use 22.22.3
```

### `Permission denied` when moving files on Windows

Stop the dev server (`npm run dev`) and any lingering `esbuild.exe` / `node.exe` processes before restructuring files.

## License

Private — internal project.
