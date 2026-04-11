# Webster

A Photoshop-like web image editor, built step by step.

## Workspace

```text
webster/
  apps/
    web/      Next.js + React + TypeScript frontend
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

Open the app at `http://localhost:3000`.

The `apps/api` folder is intentionally empty for now. Backend commands will be added later, when the NestJS app is introduced.

Build everything:

```bash
npm run build
```

Type-check everything:

```bash
npm run typecheck
```

## Next Step

Step 2 is the editor UI layout: top toolbar, left tools panel, tabs bar, canvas placeholder, layers panel, properties panel, and history panel. The editor UI lives under `apps/web/src/editor` and is rendered by the Next.js App Router in `apps/web/src/app`. Do not implement WebGL, image upload, backend save/load, or editor tools yet.
