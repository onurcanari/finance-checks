## Communication language

Use English exclusively for all user-facing responses, code comments, documentation, and generated text unless the user explicitly asks otherwise.

## Build & test

- `npm install --include=dev` — install deps (this env's `omit=dev` would otherwise skip devDependencies, breaking `next build`)
- `npm run build` — production build (catches routing, server/client boundary, and TypeScript errors)
- `node --test app/lib/flow.test.js` — unit tests for the flow layer (pure helpers, no network)
- `node scripts/smoke-flow.mjs` — integration smoke test for `/api/flow` and `/api/flow/breadth` with canned chart data; verifies the assembled JSON shape and ranking/breadth/RVOL invariants without depending on Yahoo
- `npm run dev` then `curl -s http://127.0.0.1:3000/api/flow | head -c 200` — manual smoke against the live data source

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deploy
- Domain: https://teletext.onurcanari.com (Dokploy, sunucu 140.245.6.201 - Traefik 80/443)
- Deploy komutu: project-deploy finance-checks
