# AGENTS.md — nabu-web

Guide for coding agents and developers working in this repository.

## Workspace

Nabu is `nabu-core` (Go backend), `nabu-web` (this SPA) and `nabu` (docs, charts, deploy), checked
out next to Hammurapi; the specifications are `hammurapi-specs/specs/NAB/CMN/FTR.NAB.CMN-0001/` and
`FTR.NAB.CMN-0002/` (channels and accounts), `FTR.NAB.CMN-0003/` (memory of communications) and
`FTR.NAB.CMN-0004/` (agent pods);
`design/mockups.html` of each defines the screens.

- Every change implements the feature specification; refer to it in comments as
  `FTR.NAB.CMN-0001 R12`, `design §3`.
- Deviations from a spec are written into the spec in the same piece of work.
- Do not commit, tag or push unless asked.

## Stack

React 19, TypeScript, Vite, TanStack Query, React Router 7, i18next with ICU. Node 24. The shared
look — tokens, buttons, fields, tables, the top bar, the chat, sign-in, icons — comes from
`@green-on-grey/ui-kit` (FTR.NAB.CMN-0005); `src/styles.css` holds the screens of Nabu only.

```sh
npm ci
npm run dev        # http://localhost:5173; /api, /admin/api, /auth go to localhost:8080
npm test           # vitest
npm run lint       # oxlint + tsc + ui-kit-check (warnings are tolerated, errors are not)
UI_KIT_SRC=../ui-kit npm run dev   # with the kit from its sources, to try a change of the kit
npm run build      # typecheck + production build
```

CI runs lint, tests, `deploy/sync-ref.sh --check` and actionlint; a release also runs `deploy/kit-lag.sh`.

## Layout

```text
src/api/          client (fetch, nabu_csrf cookie, ApiError), types.ts (mirrors core JSON), queries.ts
src/app/          App (routes), Shell (navigation), ProfileMenu, session
src/chat/         chat page: adapter.tsx (requests, events, API → the view types of the kit), ChatPage
                  (the layout around Chat and ConversationList of the kit), agent menu, tones, commitments
src/pages/        Tasks, Memory, Space, Connections, Login; memory/ — the tabs of Memory (FTR.NAB.CMN-0003):
                  Comm (table, note panel), Graph (d3-force), Commitments, MemoryTasks (cards, wizard);
                  admin/ — Administration (paths.ts):
                  Users (archive), Channels, GroupAgents, Settings, …
src/lib/          sse, i18n, format, errors, llm
locales/*.json    en (default and fallback), ru, de, es, zh — shown as EN RU DE ES ZH
e2e/              the screen comparison: mock.mjs (a fixed API), screens.ts, screens.spec.ts (Playwright), compare.mjs
```

## Rules

- **Five locales, identical keys** (`src/lib/i18n.test.ts` checks parity, ICU, Russian plurals and
  that no visible string mentions Hammurapi). Messages are ICU; no apostrophes and no `<…>` in text.
- **Types mirror the core JSON**; stable error codes map to `errors.<code>` translations.
- **Admin links are absolute** (`adminPath(...)`).
- **SSE events** are listed in `src/lib/sse.ts`.
- No `Date.now()` or other impure calls during render (oxlint purity rules): compute in handlers or
  query functions.
- Check UI changes in a browser at desktop and phone width; unit tests do not cover layout.
- **Screens are compared, not eyeballed, when the look must not change** (a move to a new version of the kit, a
  refactoring of styles): the `visual` workflow builds two commits, shoots every screen of `e2e/screens.ts` on the
  fixed API of `e2e/mock.mjs` and compares the shots with zero tolerance. A new screen or a state behind a click is
  added to `e2e/screens.ts`, its data — to `e2e/mock.mjs`. Locally: `npm run build && SHOTS_DIR=shots/after npm run shots`.

## UI kit

- **Take from the kit**: `Icon`, `Modal`, `useToast`, `Avatar`, `Switch`, `Empty`, `Loading`, `TopBar`, `Menu`, `Tabs`,
  `Markdown` from `@green-on-grey/ui-kit`; `Chat`, `ChatLayout`, `ConversationList` from `…/chat`; `LoginScreen` from
  `…/login`. Its showcase lists every class and state: <https://greenongrey.github.io/ui-kit/>.
- **Do not restyle the kit** (R23). A rule in `src/styles.css` styles a class of Nabu: `.mailcard .send`, never
  `.mailcard .btn`. `ui-kit-check` in `npm run lint` fails on a rule whose target is an element of the kit, on a rule
  without a class of Nabu and on a redefined token. Need another look — give the element a class of its own or change the kit.
- **A new shared element** goes to the kit when Hammurapi needs it too; a new icon goes to the kit at once.
- **The chat** never calls the API from the component: `src/chat/adapter.tsx` turns answers and events into the types
  of the kit and gives the handlers. No handler — no control.
- **The version of the kit is exact** (`0.1.3`, no `^`); Dependabot proposes updates; `deploy/kit-lag.sh` stops a release
  that is more than one minor behind.
- The strings of the components of the kit live in the namespace `uikit`; the keys of Nabu stay in `locales/*.json`.

## Releases

A tag `vX.Y.Z` builds `ghcr.io/greenongrey/nabu-web` and deploys it through `deploy-component.yml`
of the `nabu` repo pinned by `DEPLOY_WORKFLOW_REF` in `deploy/versions.env` (run
`deploy/sync-ref.sh` after changing it); `CHART_VERSION` is the `hammurapi-infra` release with the
chart `nabu-web`. The container writes `/config.json` with the API address at
start (`deploy/05-nabu-config.sh`), so one image fits any domain.
