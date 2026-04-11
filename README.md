# Webster

A Photoshop-like web image editor, built step by step.

## Workspace

```text
webster/
  apps/
    web/      React + TypeScript frontend
    api/      Reserved for a future NestJS backend
  packages/
    shared/   Shared TypeScript contracts
  docker/     Future Docker files
```

## Commands

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev:web
```

The `apps/api` folder is intentionally empty for now. Backend commands will be added later, when the NestJS app is introduced.

Build everything:

```bash
npm run build
```

Type-check everything:

```bash
npm run typecheck
```

