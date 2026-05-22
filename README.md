# CareSync

A clinical voice-notes web app built with **TanStack Start**, **React 19**, **Tailwind CSS v4**, and **shadcn/ui**, deployed to **Cloudflare Workers**.

## Tech Stack

- [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) — SSR React framework with file-based routing
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 7](https://vite.dev/) — dev server & build tool
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) — styling
- [TanStack Query](https://tanstack.com/query) — data fetching/cache
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) — forms & validation
- [Cloudflare Workers](https://workers.cloudflare.com/) via [`@cloudflare/vite-plugin`](https://www.npmjs.com/package/@cloudflare/vite-plugin) + [`wrangler`](https://developers.cloudflare.com/workers/wrangler/)

## Prerequisites

- **Node.js `>= 20.19` or `>= 22.12`** (Vite 7 requirement)
- **npm** (this repo also has a `bun.lock` if you prefer Bun)

> If you use [nvm](https://github.com/nvm-sh/nvm), there is a compatible Node already available:
>
> ```bash
> nvm use 22.22.3
> # or to make it the default permanently:
> nvm alias default 22.22.3
> ```

## Getting Started

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd CareSync

# 2. Make sure you are on Node 20.19+ / 22.12+
node --version

# 3. Install dependencies
npm install

# 4. Start the dev server
npm run dev
```

The dev server will be available at:

- Local: <http://localhost:8080/>
- Network: printed in the terminal output

## Available Scripts

| Command             | Description                                       |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server on port `8080`          |
| `npm run build`     | Production build (Cloudflare Workers target)      |
| `npm run build:dev` | Build using `development` mode                    |
| `npm run preview`   | Preview the production build locally              |
| `npm run lint`      | Run ESLint over the project                       |
| `npm run format`    | Format all files with Prettier                    |

## Project Structure

All project files now live at the repository root (previously they were nested under a `caresync/` subfolder).

```
CareSync/
├── src/
│   ├── components/      # UI components (shadcn/ui in src/components/ui)
│   ├── hooks/           # Reusable React hooks
│   ├── lib/             # App utilities (e.g. caresync-store)
│   ├── routes/          # File-based routes (TanStack Router)
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── dashboard.tsx
│   ├── router.tsx       # Router setup
│   ├── server.ts        # SSR / Cloudflare Worker entry
│   ├── start.ts         # TanStack Start bootstrap
│   └── styles.css       # Tailwind entry
├── vite.config.ts       # Uses @lovable.dev/vite-tanstack-config
├── wrangler.jsonc       # Cloudflare Worker config
├── components.json      # shadcn/ui config
├── eslint.config.js
└── package.json
```

## Deploying to Cloudflare Workers

The app is configured for Cloudflare Workers (see `wrangler.jsonc`).

```bash
# Build the worker bundle
npm run build

# Deploy with wrangler
npx wrangler deploy
```

You'll need to be logged in to Cloudflare:

```bash
npx wrangler login
```

## Troubleshooting

### `Vite requires Node.js version 20.19+ or 22.12+`

Your active Node version is too old. Switch versions with `nvm`:

```bash
nvm use 22.22.3
node --version   # confirm
npm run dev
```

### `ERR_REQUIRE_ESM ... lovable-tagger`

Same root cause as above — running on Node 18 will fail to load the Vite config. Use Node 20.19+ / 22.12+.

### Port `8080` already in use

Stop the other process or update the port via the Vite config / environment.

## License

Private — internal project.
