# Contributing

Thanks for taking a look at TableGather Hub. The project is a React/Vite app plus a small in-memory WebSocket room server. Keep changes focused, readable, and aligned with the existing game-module structure.

## Local Setup

Requirements:

- Node.js `>=22.12.0`
- npm

Install dependencies and start both development processes:

```bash
npm install
npm run dev:all
```

Useful commands:

```bash
npm run dev
npm run server:dev
npm run lint
npm run test
npm run build
```

## Contribution Guidelines

- Start from the relevant docs in `README.md` and `docs/`.
- Keep changes scoped to the requested behavior or documentation issue.
- Add or update tests when behavior, room privacy, i18n, or UI contracts change.
- Keep user-facing text in the English and German i18n bundles.
- Do not add dependencies, broad refactors, or new architecture layers unless they clearly solve the change.
- By submitting a contribution, you agree that it is licensed under AGPL-3.0-only unless you explicitly state otherwise before it is accepted.

## Verification

Before opening a pull request, run the checks that match the change. For most code changes, use:

```bash
npm run lint
npm run test
npm run build
```

Documentation-only changes should at least be re-read for accuracy and checked against source paths or message names they reference.
