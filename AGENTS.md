## Communication language

Use English exclusively for all user-facing responses, code comments, documentation, and generated text unless the user explicitly asks otherwise.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verification
- Install: `npm ci --include=dev` (the environment omits devDependencies by default; `.bin` runners need `--include=dev`).
- Build gate: `npm run build` must complete without errors.
- Manual check: `npm run dev` and verify changed routes render correctly.

## Deploy
- Domain: https://teletext.onurcanari.com (Dokploy, sunucu 140.245.6.201 - Traefik 80/443)
- Deploy komutu: project-deploy finance-checks
