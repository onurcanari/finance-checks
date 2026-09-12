## Communication language

Use English exclusively for all user-facing responses, code comments, documentation, and generated text unless the user explicitly asks otherwise.

## Build & test

- `npm install --include=dev` — install deps (this env's `omit=dev` would otherwise skip devDependencies, breaking `next build`)
- `npm run build` — production build (catches routing, server/client boundary, and TypeScript errors)
- `node --test app/lib/flow.test.js` — unit tests for the flow layer (pure helpers, no network)
- `node --test app/lib/*.test.js` — all pure-helper unit tests (flow, movers, skew, AV client, supply chain)
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

## Supply-chain page

`/supply-chain` layers two data sources and must keep them distinguishable:
- The graph (who supplies whom, at what share) is **curated** in `app/lib/supply-chain.js` — no market API publishes supply allocations. Every edge carries `confidence` (official / research / press / speculation / background) and `sources`; `DATA_DATE` is its vintage. When refreshing it, update `DATA_DATE` and keep `node --test app/lib/supply-chain.test.js` green (it enforces source references, confidence tags and no aggregate "other buyers" rows).
- Prices and headlines are **live** from Yahoo via `/api/supply-chain` and `/api/supply-chain/news`. Both derive their symbol list from the graph, never from the query string.

## Option data
Option data (used by `/api/options/*` routes): `TRADIER_API_KEY` env var required at runtime. Set in `.env.local` for local, in the deploy environment for production. Without it the routes return `500 {error: "config_missing"}`.
