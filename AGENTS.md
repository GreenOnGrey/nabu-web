# AGENTS.md — nabu-web

Guide for coding agents and developers working in this repository.

## Workspace

Nabu is `nabu-core` (Go backend), `nabu-web` (this SPA) and `nabu` (docs, charts, deploy), checked
out next to Hammurapi; the specifications are `hammurapi-specs/specs/NAB/CMN/FTR.NAB.CMN-0001/` and
`FTR.NAB.CMN-0002/` (channels and accounts) and `FTR.NAB.CMN-0004/` (agent pods);
`design/mockups.html` of each defines the screens.

- Every change implements the feature specification; refer to it in comments as
  `FTR.NAB.CMN-0001 R12`, `design §3`.
- Deviations from a spec are written into the spec in the same piece of work.
- Do not commit, tag or push unless asked.

## Stack

React 19, TypeScript, Vite, TanStack Query, React Router 7, i18next with ICU. Node 24. The style
and components follow Hammurapi (`styles.css` is shared, Nabu adds its own section at the end).

```sh
npm ci
npm run dev        # http://localhost:5173; /api, /admin/api, /auth go to localhost:8080
npm test           # vitest
npm run lint       # oxlint + tsc (warnings are tolerated, errors are not)
npm run build      # typecheck + production build
```

CI runs lint, tests, `deploy/sync-ref.sh --check` and actionlint.

## Layout

```text
src/api/          client (fetch, nabu_csrf cookie, ApiError), types.ts (mirrors core JSON), queries.ts
src/app/          App (routes), Shell (navigation), ProfileMenu, session
src/chat/         chat page: conversations, agent menu, voice
src/pages/        Tasks, Memory, Space, Connections, Login; admin/ — Administration (paths.ts):
                  Users (archive), Channels, GroupAgents, Settings, …
src/components/   ui, icons (tone icons of the agent), Markdown
src/lib/          sse, i18n, format, errors, llm
locales/*.json    en (default and fallback), ru, de, es, zh — shown as EN RU DE ES ZH
```

## Rules

- **Five locales, identical keys** (`src/lib/i18n.test.ts` checks parity, ICU, Russian plurals and
  that no visible string mentions Hammurapi). Messages are ICU; no apostrophes and no `<…>` in text.
- **Types mirror the core JSON**; stable error codes map to `errors.<code>` translations.
- **Admin links are absolute** (`adminPath(...)`).
- **SSE events** are listed in `src/lib/sse.ts`.
- No `Date.now()` or other impure calls during render (oxlint purity rules): compute in handlers or
  query functions.
- Check UI changes in a browser at desktop and phone width; tests do not cover layout.

## Releases

A tag `vX.Y.Z` builds `ghcr.io/greenongrey/nabu-web` and deploys it through `deploy-component.yml`
of the `nabu` repo pinned by `DEPLOY_WORKFLOW_REF` in `deploy/versions.env` (run
`deploy/sync-ref.sh` after changing it); `CHART_VERSION` is the `hammurapi-infra` release with the
chart `nabu-web`. The container writes `/config.json` with the API address at
start (`deploy/05-nabu-config.sh`), so one image fits any domain.
