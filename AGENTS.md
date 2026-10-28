# Acquire — agent instructions

## Repository and live status

- This is **Acquire**, in `boardgamers/mergers-game`; the BGS game id is `acquire`, version **1**.
- **The BGS game is public**, verified 28 October 2026. Preserve the live visibility and
  unrelated metadata on updates. Fetch fresh metadata before publishing; this file is not a
  substitute for checking the live configuration.
- `docs/admin/gameinfo.json` is a bootstrap template. Its `public: false` and blank artifact
  URLs are intentional for initial registration. Never PUT that whole file over the live game.
- `packages/engine/` contains deterministic rules and the BGS adapter (`wrapper.ts`).
  `packages/viewer/` contains the Svelte UI, local harness, translations and tutorials.
- `rules.md` is the engine rules reference. `docs/admin/rules.md` is the reader-facing CMS copy.
  [docs/registering.md](docs/registering.md) is the detailed publishing procedure;
  [docs/admin/release-check.md](docs/admin/release-check.md) records validation and remaining gaps.

## Development and checks

Use Node 24 and pnpm 11. Inspect the working tree before editing and preserve unrelated work.

- `pnpm install` installs dependencies when needed.
- `pnpm check` checks formatting, lint, TypeScript/Svelte, tests, and builds both packages.
  It does **not** fix formatting; use `pnpm fmt` or format only the edited files first.
- For UI or interaction changes, also run `pnpm test:browser`. It builds and exercises the
  shipped IIFE/CSS, including mobile, both themes, translations and tutorials. Inspect the
  relevant screenshots in ignored `release/qa/` rather than relying only on assertions.
- Do not rebuild or pack while browser checks are running: engine rebuilds can trigger Vite
  reloads during the checks. Pack the engine afterward.
- Documentation-only changes need formatting, link/command checks and `git diff --check`;
  they do not require a game rebuild, package-version bump or BGS artifact deployment.
- Local play: `pnpm build && pnpm dev`. Use `?bundle=1` to inspect the built viewer.
  Useful parameters include `players=4`, `publicHoldings=1`, `stockSwap=3`, `locale=fr`,
  `theme=dark`, and `tutorial=founding|mergers|scoring`.

## Behavior to preserve

- Saved games and replay logs must remain compatible. New options default to existing
  behavior; changes to normalized init options can break exact historical replay comparisons.
- Keep opponents' private cash, shares, hands and future draws out of public views, scores
  and inferred UI behavior. Public net worth is an estimate; two-player bank bonuses are
  unknown until payout and are excluded from forecasts.
- Undo uses private turn drafts: `type: "turn"`, `from`, `moves`. Reversible previews return
  `toSave: undefined`; only the acting player receives the stripped preview. Revisions must
  not append saved history or award time. Commit boundaries include another player's
  decision, hidden information being revealed, draws and game end. Keep atomic moves working
  for older viewers, tutorials and analysis.
- Preserve two-player bank mode, four hands, team play and dropped-player behavior when changing rules.
- Put new UI/log/tutorial text in all 17 catalogs under `packages/viewer/src/lib/locales/`.
  Keep chain names and tile coordinates unchanged. CMS text and setup labels have separate
  translations; do not claim they are translated merely because viewer catalogs are complete.
- Honor BGS theme, sound, chat, replay and supporter player colors. Chain letters already
  identify chains independently of color. Ongoing hidden-information analysis is not enabled.
- Stock swaps are an optional house rule: Off / 3 / 5 / 7 / Unlimited. The per-turn limit is
  shared across exchanges, separate from the three-share purchase allowance; prices apply
  after all merger resolution. Keep the default Off.
- Two tiles per turn and limited game log are optional, default Off. Two-tile turns retain
  private undo and one turn increment. Limited logs must filter both entries and BGS summaries;
  four-hands spectators use the active player's window. Replay unlocks at game end.

## Setup options and player preferences

For a new setup option, update `docs/admin/gameinfo.json`, the engine's `GameOptions` and
`normalizeOptions` in `packages/engine/src/options.ts`, the affected rules/UI, and the local
URL parser in `packages/viewer/src/dev.ts`. Test missing/default/invalid values and replay
compatibility. A metadata declaration only adds a control; the engine must implement its effect.
UI-only preferences use the viewer's `onPreferences`; in-game automation needs engine-backed
player settings. Follow [the configuration checklist](docs/registering.md#adding-a-setup-option)
for examples, translations, tests and publishing the declaration after its implementation.

## Publishing

A Git push does not publish to BGS. Follow the user's delivery scope, including any request
for local review before publication. For an authorized release:

1. Bump the package version for each changed artifact, update the release notes, and run the
   applicable checks above. Commit/push the intended changes. No npm registry publication is needed.
2. Read and save the current `GET https://admin.boardgamers.space/api/admin/gameinfo/acquire/1`.
   Authenticate with an **admin token issued by BGS**, granted access to Acquire. The local
   token file is normally `~/.bgs`; never print, commit or embed the token in docs.
   Keep deployment records and tarballs in an ignored directory such as `release/publish/`.
3. For an engine change, run `pnpm --filter acquire-engine pack --pack-destination <release-dir>`.
   POST the raw tarball to `/api/admin/gameinfo/acquire/1/engine` with bearer authentication
   and `Content-Type: application/octet-stream`. Keep `engine.entryPoint` as `dist/wrapper.js`.
   Upload the engine before the viewer when they change together.
4. For a viewer change, use the platform repository's `scripts/publish-viewer.mjs` (normally
   `../boardgamers-mono/scripts/publish-viewer.mjs`), with `--game acquire --version 1`, the
   built viewer directory, entry `acquire-viewer.iife.js`, style `acquire-viewer.css`, token
   file and a fresh record file. `--apply --activate` uploads and activates. It verifies hosted
   bytes, checks for concurrent viewer changes, and preserves other viewer settings. Exact
   commands are in [docs/registering.md](docs/registering.md).
5. Update options, preferences, tutorials or CMS content only when the change requires it.
   Merge targeted changes into freshly fetched values; preserve other fields. The rules page
   is `/api/admin/page/acquire:rules/en`. Sound and stock-swap declarations already exist.
6. Verify hosted artifacts and the final metadata. Engine installation is asynchronous,
   normally around a minute; a successful upload alone does not prove server activation.
   Check live behavior when practical without making moves in someone else's ongoing game.
   Keep BGS version integer **1** for compatible updates so ongoing games receive fixes.
   Treat changing that integer as a deliberate migration, not a routine package-version bump.

Report the commit, checks and actual deployment result accurately. Keep `AGENTS.md`, the
publishing guide and relevant admin docs updated when the workflow or live status changes;
avoid copying version numbers and option lists into multiple instructions.
