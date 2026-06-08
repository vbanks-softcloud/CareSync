# CareSync this is a test 

CareSync is a clinical voice-notes web app: caregivers press a button, dictate a note about a patient, and the app turns it into a structured, searchable medical record.

This guide gets a brand-new teammate from a fresh laptop all the way to "the app is running on my machine" — even if you've never opened a terminal before. If you get stuck on any step, ask the team (or jump to [Troubleshooting](#troubleshooting) at the bottom).

**The live demo:** <https://caresync.fyi/>

---

## Part 1 — First-time setup (~20 min, do this once)

You only do these steps the very first time you set up your computer. After this, starting the app each day is just two commands.

### Step 1. Install the tools

You need three things installed on your computer. The links below take you to the official download pages.

#### 1a. Node.js (the JavaScript runtime the app uses)

- **Windows or macOS:** go to <https://nodejs.org/> and click the **"LTS"** big green button (it'll say something like "22.x.x LTS"). Run the installer. Click "Next" through every screen — the defaults are fine.

To check it worked, open a terminal:
- **Windows:** press the Windows key, type `Git Bash`, hit Enter. (You'll get Git Bash after Step 1b. For now use **PowerShell**.)
- **macOS:** press Cmd+Space, type `Terminal`, hit Enter.

Then paste this and press Enter:

```bash
node --version
```

You should see something like `v22.22.3`. If you see `command not found`, close the terminal and reopen it (the installer added Node to your PATH but the old terminal won't see it yet).

#### 1b. Git (the tool that downloads + tracks code)

- **Windows:** go to <https://git-scm.com/download/win> — the download starts automatically. Run the installer. Again, click "Next" through every screen with the defaults. This also gives you **Git Bash**, a terminal that works just like the one on macOS.
- **macOS:** open Terminal and run `git --version`. macOS will prompt to install developer tools — click Install. (Or install via <https://git-scm.com/download/mac>.)

To check it worked:

```bash
git --version
```

You should see something like `git version 2.46.0`.

#### 1c. A code editor — Cursor or VS Code

You can edit code in any text editor, but these two are designed for the job. Pick one:

- **Cursor** (recommended — has an AI assistant built-in): <https://cursor.com/>
- **VS Code** (the industry standard): <https://code.visualstudio.com/>

Run the installer and accept the defaults.

### Step 2. Download the project

Open a terminal (Git Bash on Windows, Terminal on macOS) and pick a folder to put the project in. For example, your Documents folder:

```bash
cd ~/Documents
```

> `cd` means "change directory". `~` means "my home folder". So this command says: "go to my Documents folder."

Now download (clone) the project from GitHub:

```bash
git clone https://github.com/vbanks-softcloud/CareSync.git
```

You'll see something like `Receiving objects: 100%... done.`. This created a new folder called `CareSync` with all the project files in it.

Move into that folder:

```bash
cd CareSync
```

> From here on, **every command in this guide assumes you are inside the `CareSync` folder.** If a command doesn't work, the first thing to check is that you're in the right folder — run `pwd` (Print Working Directory) and make sure it ends in `/CareSync`.

### Step 3. Install the project's libraries

The project depends on a bunch of open-source libraries (React, TypeScript, etc.). One command pulls them all down:

```bash
npm install
```

You'll see a progress indicator and lots of text scrolling. It can take **2–5 minutes** the first time. When it's done, it'll print something like `added 748 packages in 14s`.

You'll also notice a new folder appeared: `node_modules/`. That's where all the downloaded libraries live. It's huge (~500 MB) and it's already in `.gitignore` so it's never uploaded to GitHub.

### Step 4. Open the project in your editor

In your terminal:

```bash
cursor .          # if you installed Cursor
# or
code .            # if you installed VS Code
```

> The `.` means "the current folder". This opens the whole `CareSync` project in the editor.

---

## Part 2 — Run the app every day

Now you can run the app. From inside the `CareSync` folder, in a terminal:

```bash
npm run dev:frontend
```

After a couple of seconds you'll see:

```
  VITE v7.3.3  ready in 1242 ms
  ➜  Local:   http://localhost:8080/
```

**Open <http://localhost:8080/> in your browser.** You should see the CareSync landing page.

**Hot reload:** while the dev server is running, open any file under `frontend/src/` in your editor and save a change (e.g. change a heading). The browser will refresh automatically with your edit — no need to restart anything.

### To stop the dev server

In the terminal window where it's running, press **`Ctrl + C`** (on both Windows and Mac). You'll get back to a normal prompt.

### To start it again tomorrow

```bash
cd ~/Documents/CareSync
npm run dev:frontend
```

That's it. Two commands.

---

## Part 3 — Common commands cheat sheet

Run all of these from inside the `CareSync` folder.

| Command | What it does |
| --- | --- |
| `npm run dev:frontend` | Start the website locally on http://localhost:8080 |
| `npm run dev:backend` | Start the backend API locally on http://localhost:3000 |
| `npm run build:frontend` | Make a production-ready build (used by deploy) |
| `npm run lint` | Check the code for style/syntax mistakes |
| `npm run format` | Auto-fix formatting across the project |
| `git status` | See which files you've changed |
| `git pull` | Download the latest changes from teammates |

If a command fails, scroll down to [Troubleshooting](#troubleshooting).

---

## Part 4 — Daily git workflow (saving your changes)

When you've made changes you want to share:

```bash
git pull                                 # get teammates' latest changes first
git checkout -b feature/my-change        # make a new branch for your work
# ...edit some files...
git status                               # see what you changed
git add .                                # stage all your changes
git commit -m "describe your change"     # save them to the branch
git push -u origin feature/my-change     # upload the branch to GitHub
```

Then open <https://github.com/vbanks-softcloud/CareSync/pulls> and create a Pull Request from your branch into `develop`. A teammate reviews it, and once approved it gets merged.

> **Never edit `main` directly.** Always work on a feature branch and open a PR.

---

## Repository structure (reference)

```
CareSync/
├── .github/                # GitHub Actions workflows, issue & PR templates
│
├── frontend/               # The web app you see in the browser
│   ├── index.html          # Entry HTML page
│   ├── src/
│   │   ├── main.tsx        # Where React starts
│   │   └── routes/         # Each file = one page (e.g. index.tsx = "/")
│   ├── scripts/            # Helper scripts (deploy, etc.)
│   ├── vite.config.ts      # Build tool config
│   └── package.json        # Frontend's dependencies
│
├── backend/                # The API (runs on AWS Lambda)
│   ├── src/handlers/       # Each file = one Lambda function
│   ├── serverless.yml      # Backend infrastructure config
│   └── package.json        # Backend's dependencies
│
├── infrastructure/aws/     # CloudFormation templates for AWS resources
├── database/               # Database schemas, migrations
├── docs/                   # Architecture notes, ADRs
├── scripts/                # Repo-wide helper scripts
│
├── package.json            # Top-level config (npm workspaces)
└── README.md               # This file
```

## Tech stack (reference)

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

## Deployment

| Target           | Tool                     | Triggered by                                   |
| ---------------- | ------------------------ | ---------------------------------------------- |
| Frontend (S3+CF) | GitHub Actions + AWS CLI | Push to `main` touching `frontend/`            |
| Backend (Lambda) | Serverless Framework     | Push to `main` touching `backend/` (or manual) |
| Infra (shared)   | CloudFormation           | Manual `aws cloudformation deploy`             |

**You almost never need to think about this** — pushing to `main` deploys automatically. The infrastructure was set up once; the details below are for whoever is responsible for AWS.

### Frontend hosting (S3 + CloudFront)

The frontend is a pure static SPA. `npm run build:frontend` produces a `frontend/dist/` directory that is uploaded to a private S3 bucket and served through a CloudFront distribution using Origin Access Control.

1. **Provision the bucket + distribution** (one-time):

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

   | Secret                | Value                                                                   |
   | --------------------- | ----------------------------------------------------------------------- |
   | `AWS_DEPLOY_ROLE_ARN` | Output `RoleArn` from the OIDC role stack                               |
   | `FRONTEND_BUCKET`     | Bucket name (e.g. `caresync-frontend-2026`)                             |
   | `CF_DISTRIBUTION_ID`  | CloudFront distribution ID (output `DistributionId` from the CDN stack) |

   After that, every push to `main` that touches `frontend/` will build, sync to S3, and invalidate CloudFront automatically.

4. **Deploy manually from your workstation** if needed:

   ```bash
   cd frontend
   npm run build
   CARESYNC_FRONTEND_BUCKET=caresync-frontend-2026 \
   CARESYNC_CF_DISTRIBUTION_ID=<DIST_ID> \
   npm run deploy
   ```

### Authentication (Amazon Cognito)

CareSync uses **AWS Cognito** for sign-up, sign-in, and required TOTP MFA (authenticator app). All free under Cognito's free tier (50,000 monthly active users / month).

Until you deploy the Cognito stack, the app falls back to a local-mock login (any email + password + 4+ digit "MFA" code). So `npm run dev:frontend` works out of the box; real Cognito only activates once you set the env vars.

1. **Deploy the Cognito User Pool** (one-time):

   ```bash
   aws cloudformation deploy \
     --stack-name caresync-cognito-prod \
     --template-file infrastructure/aws/cognito.yml \
     --region ca-central-1 \
     --parameter-overrides AppName=caresync Environment=prod
   ```

2. **Read the outputs** — you need three values:

   ```bash
   aws cloudformation describe-stacks \
     --stack-name caresync-cognito-prod \
     --region ca-central-1 \
     --query 'Stacks[0].Outputs' \
     --output table
   ```

   Look for `UserPoolId`, `UserPoolClientId`, and `Region`.

3. **Local development** — copy `frontend/.env.example` to `frontend/.env.local` and paste those three values:

   ```env
   VITE_COGNITO_USER_POOL_ID=ca-central-1_aBcD1234
   VITE_COGNITO_USER_POOL_CLIENT_ID=7abc...xyz
   VITE_COGNITO_REGION=ca-central-1
   ```

   Restart `npm run dev:frontend` — the landing page now shows a real Sign in / Sign up tabbed form and the dashboard requires a real Cognito session.

4. **Production deploys** — add the same three values as GitHub Actions secrets so the build picks them up:

   | Secret                             | Value (from step 2)        |
   | ---------------------------------- | -------------------------- |
   | `VITE_COGNITO_USER_POOL_ID`        | `UserPoolId` output        |
   | `VITE_COGNITO_USER_POOL_CLIENT_ID` | `UserPoolClientId` output  |
   | `VITE_COGNITO_REGION`              | `ca-central-1`             |

   Push to `main` and the deploy workflow injects them into the Vite build.

5. **Create your first user** — open the live site (or local), click **Sign up**, enter your email + a strong password (10+ chars, upper + lower + number), check your inbox for the 6-digit confirmation code, then sign in. On the first sign-in Cognito asks you to add CareSync to an authenticator app (Google Authenticator, Authy, 1Password — anything that does TOTP); after that, every sign-in needs a 6-digit code from the app.

> **Note**: `frontend/.env.local` should never be committed. It's already covered by the default `.gitignore` (`.env*` patterns).

---

## Troubleshooting

### `command not found: node` (or `git`, or `npm`)

You either haven't installed it yet (see [Step 1](#step-1-install-the-tools)), or your terminal was open before the install finished. **Close every terminal window and reopen one.** That picks up the new install.

### `npm install` fails with an error mentioning `EACCES` or `permission denied`

Try these in order:

1. Make sure you're not running the terminal "as Administrator" / `sudo`. Just open it normally.
2. Delete `node_modules/` and `package-lock.json` and try again:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### `Vite requires Node.js version 20.19+ or 22.12+`

Your Node version is too old. Reinstall the LTS version from <https://nodejs.org/> (it'll update in-place).

If you're using [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
nvm alias default 22
```

### `Port 8080 is already in use` when running `npm run dev:frontend`

Another dev server is still running somewhere. Find and stop it:

- **macOS/Linux:** `lsof -i :8080` shows what's using the port. `kill -9 <PID>` stops it.
- **Windows (Git Bash):**
  ```bash
  netstat -ano | findstr :8080
  # then in PowerShell or cmd:
  taskkill //PID <PID> //F //T
  ```

Or just close every terminal window and reopen one — that usually kills lingering Node processes.

### `Permission denied` moving/deleting files on Windows

A dev server is still holding the file open. Stop it with `Ctrl + C`, then close any leftover `node.exe` / `esbuild.exe` processes via Task Manager.

### My change isn't showing up in the browser

1. Make sure the dev server is still running (look at the terminal — if it says `[vite] hmr update ...` after you save, it picked up your change).
2. Hard-refresh the page: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (macOS).
3. Check the terminal for red error messages — a typo can break the build.

### Git says `Please tell me who you are`

You haven't told Git your name/email yet. One-time setup:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### Anything else

Ask in the team chat with:
- The exact command you ran
- The full error message (copy-paste, don't summarize)
- Your operating system (Windows / macOS / Linux)

---

## License

Private — internal project.
