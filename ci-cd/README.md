# CI/CD

Shared CI/CD configuration that isn't already in `.github/workflows/`.

Use this folder for:

- Reusable shell scripts called from workflows (e.g. `deploy-frontend.sh`)
- Dockerfiles used by self-hosted runners
- Build-tool configs shared across services (e.g. shared esbuild/tsconfig presets)
- Notes on deployment runbooks

> Active GitHub Actions workflows live in `../.github/workflows/`.
