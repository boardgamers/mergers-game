# Acquire for boardgamers.space

An unofficial implementation of Sid Sackson's Acquire for [boardgamers.space](https://www.boardgamers.space),
for 2 to 6 players. Not affiliated with or endorsed by Hasbro, Avalon Hill, Renegade Game
Studios or any other publisher of Acquire.

- [AGENTS.md](AGENTS.md): agent instructions, current BGS status and publishing workflow.
- `packages/engine`: the rules engine. `wrapper.ts` implements the BGS Engine API.
- `packages/viewer`: the Svelte viewer, built as one IIFE bundle for the BGS iframe.
- `rules.md`: the rules the engine follows. Tests cite its section numbers.
- `docs/registering.md`: how to publish the engine and viewer to BGS.
- `docs/admin/`: the text, pictogram and screenshots for the BGS admin panel.

## Setup

Requires Node 24 and pnpm 11 (`corepack enable pnpm` provides pnpm).

```bash
pnpm install
pnpm check
```

`pnpm check` checks formatting, lints, type-checks, runs the tests and builds both packages. To run it
before every commit, enable the hook with `git config core.hooksPath .githooks`.

## Playing locally

```bash
pnpm build
pnpm dev
```

Open http://localhost:5173. The test page runs the engine in the browser and shows the viewer
as each player sees it. With hot seat on, it switches to whoever must act, so one person can
play every seat. The toolbar plays random moves, jumps to the next merger, and switches
player, theme and language.

URL parameters: `players=2..6`, `seed=...`, `publicHoldings=1`, `teamPlay=1`, `autoEnd=1`,
`endSize=31`, `twoPlayerMode=fourHands`, `stockSwap=3` (or `5`, `7`, `unlimited`), `twoTiles=1`, `limitedLog=1`, `theme=light|dark`, `locale=de`, `moves=50` (random
moves on load), `merger=1` (continue to the next merger).

## What ships

The test page (`packages/viewer/index.html`, `src/dev.ts`, `dev-badge.svg`) is never part of
what BGS runs, so nothing needs removing for live:

- The viewer build bundles only `src/viewer.ts` and what it imports, into
  `acquire-viewer.iife.js` and `acquire-viewer.css`.
- The engine package (`pnpm pack` in `packages/engine`) contains only `dist/` and
  `package.json`.

Each GitHub Release has the built engine package and viewer files attached, ready to upload.

## Licence

AGPL-3.0. See [LICENSE](LICENSE).

## Interactive tutorials and browser checks

After `pnpm build`, open the dev server with `?bundle=1&tutorial=founding` (or
`mergers`, `scoring`). Add `&locale=fr` to switch languages. Tutorials use the real
engine, remember progress locally and support replaying a step or restarting.

`pnpm test:browser` starts its own Vite server on port 5191 and checks the compiled
viewer, not a source-only preview. Install Chromium once with
`pnpm exec playwright install chromium`. Screenshots and the report go to ignored
`release/qa/`. Set `ACQUIRE_TEST_URL` to reuse an existing dev server.
