# Publishing Acquire on boardgamers.space

Acquire is already registered as game **`acquire`**, BGS version **`1`**, and is **public**
(verified 29 October 2026). Routine updates must preserve that visibility and the existing
configuration. Start with [AGENTS.md](../AGENTS.md) for repository checks and compatibility
requirements, and [admin/release-check.md](admin/release-check.md) for the latest release record.

The bootstrap file [admin/gameinfo.json](admin/gameinfo.json) intentionally has
`public: false` and blank artifact URLs. Use it as a source for individual declarations or
initial registration only; never upload it wholesale over the live game.

## 1. Prepare the release

Use Node 24 and pnpm 11. Bump the version in the engine and/or viewer `package.json` for the
artifacts being changed. Keep the BGS version integer at **1** for compatible updates to
ongoing games. Changing it is a migration affecting which games use the new code.

From this repository's root:

```bash
pnpm check
# Also required for UI/interaction changes; includes a fresh production build.
pnpm test:browser
```

Inspect the relevant screenshots in `release/qa/`. Finish browser checks before packing
or rebuilding again; a rebuild during a browser run can cause Vite to reload its modules.
Documentation-only changes require formatting and link/command checks, not artifact publishing.

Commit and push the intended changes. A Git push or GitHub Release alone does not update BGS.
Create a fresh ignored record directory for this deployment:

```bash
export ACQUIRE_RELEASE_DIR="$(pwd)/release/publish/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
export BGS_TOKEN_FILE="$HOME/.bgs"
mkdir -p "$ACQUIRE_RELEASE_DIR"
```

`BGS_TOKEN_FILE` must contain an **admin token issued by BGS**, with access to manage Acquire.
Publishing authenticates to the BGS admin API using `Authorization: Bearer <token>`. It is a local secret:
never print it, add it to Git, or include it in release records. On another machine, set the
path to its authorized token file. Preserve a snapshot of the live metadata before changes.

| Artifact | Source                                                                 | Destination                                        |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Engine   | `packages/engine/` → `acquire-engine-<package-version>.tgz`            | `engine.package`; entry point `dist/wrapper.js`    |
| Viewer   | `packages/viewer/dist/acquire-viewer.iife.js` and `acquire-viewer.css` | `viewer.url` and `viewer.dependencies.stylesheets` |
| Rules    | `docs/admin/rules.md`                                                  | CMS page `acquire:rules`, language `en`            |

The engine package contains compiled `dist/`, package metadata and license. BGS installs its
runtime dependency `seedrandom`. The viewer bundles its dependencies; its dev harness does
not ship. Keep source maps out of the upload unless deliberately requested.

## 2. Upload the engine, if changed

Publish the engine before its matching viewer. After the checks have finished:

```bash
pnpm --filter acquire-engine pack --pack-destination "$ACQUIRE_RELEASE_DIR"
```

The raw tarball goes to
`POST https://admin.boardgamers.space/api/admin/gameinfo/acquire/1/engine`, with bearer
authentication and `Content-Type: application/octet-stream`. BGS reads the name and version
from the archive and updates `engine.package`. It preserves the entry point.

This example reads the version from the package, saves before/after metadata, uploads, and
compares the hosted archive with the local file. It performs a live deployment when run:

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const dir = process.env.ACQUIRE_RELEASE_DIR;
const token = (await readFile(process.env.BGS_TOKEN_FILE, 'utf8')).trim();
const base = 'https://admin.boardgamers.space/api/admin/gameinfo/acquire/1';
const pkg = JSON.parse(await readFile('packages/engine/package.json', 'utf8'));
const bytes = await readFile(join(dir, `${pkg.name}-${pkg.version}.tgz`));
async function api(path = '', body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) },
    body, signal: AbortSignal.timeout(60000),
  });
  assert(response.ok, `BGS returned HTTP ${response.status}`);
  return response.json();
}
const before = await api();
await writeFile(join(dir, 'engine-before.json'), JSON.stringify(before, null, 2));
assert.equal(before.engine.entryPoint, 'dist/wrapper.js');
assert.notEqual(before.engine.package.version, pkg.version, 'Bump the engine package version first');
const after = await api('/engine', bytes);
await writeFile(join(dir, 'engine-after.json'), JSON.stringify(after, null, 2));
assert.equal(after.engine.package.name, pkg.name);
assert.equal(after.engine.package.version, pkg.version);
assert.equal(after.engine.entryPoint, before.engine.entryPoint);
assert.equal(after.public, before.public);
const hosted = await fetch(after.engine.package.url, { signal: AbortSignal.timeout(60000) });
assert(hosted.ok, `Hosted archive returned HTTP ${hosted.status}`);
const sha = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(sha(Buffer.from(await hosted.arrayBuffer())), sha(bytes));
console.log(`Uploaded and verified ${pkg.name}@${pkg.version}`);
JS
```

The game server checks for new engines about once a minute, installs and validates them,
then activates them. The previous engine remains active if installation fails. Uploaded
metadata and matching hosted bytes confirm publication, **not** successful server activation;
verify activation through server status or live behavior when accessible. In particular,
coordinate new setup options with availability of the engine that understands them.

## 3. Upload and activate the viewer, if changed

Use the platform repository's publisher. On the usual workstation it is in
`~/code/boardgamers-mono`; adjust the path for another checkout. Run this from the Acquire root:

```bash
node ../boardgamers-mono/scripts/publish-viewer.mjs \
  --game acquire --version 1 \
  --dir "$(pwd)/packages/viewer/dist" \
  --entry acquire-viewer.iife.js --style acquire-viewer.css \
  --token "$BGS_TOKEN_FILE" \
  --record "$ACQUIRE_RELEASE_DIR/viewer-release.json" \
  --apply --activate
```

Omit `--apply --activate` for a dry run. The publisher uploads to a content-addressed bundle,
verifies public JS/CSS bytes, records the previous viewer, detects concurrent viewer changes,
and activates the new URLs while preserving the other viewer settings. Use a new record file
for every deployment. This tool lives in the platform repository, not the Acquire repository.

If that checkout is unavailable, use the BGS admin version form's **Upload bundle…** action
with the JS and CSS together. Preserve the existing top-level variable `acquire`, chat,
integrated controls, replay, tutorials and other settings. Uploading files without saving or
activating their URLs is not a viewer release.

## 4. Update declarations or CMS text only when needed

Fetch `GET /api/admin/gameinfo/acquire/1` immediately before changing settings and save a
snapshot. PUT a minimal body to that same route, containing only the changed field. For
array fields such as `options`, merge the intended entry into the freshly fetched array;
do not replace other declarations from an old local snapshot.

Current declaration sources are in [admin/gameinfo.json](admin/gameinfo.json):

- Setup options include public holdings, team play, two-player mode, automatic ending, end size,
  **Shares per turn: 3 (standard) / 4 / 5**, **Stock swap: Off / 3 / 5 / 7 / Unlimited**,
  two tiles per turn and limited game log.
  Stock swaps, two tiles per turn and limited logs default Off.
- The **sound** preference, default on, also honoring BGS's global sound setting.
- Three interactive tutorial chapters: founding, mergers and scoring.

### Adding a setup option

A setup option needs both a BGS declaration and an engine implementation. Adding the
declaration alone renders a control without implementing the rule.

1. Add or update one entry in `options` in [admin/gameinfo.json](admin/gameinfo.json).
   Choose a stable `name` matching the engine key. For `checkbox`, use a boolean `default`;
   for `select`, use string item names and a `default` matching one of them.
2. Update `GameOptions` and `normalizeOptions` in
   [options.ts](../packages/engine/src/options.ts), then implement the rule in the engine.
   BGS passes the creator's choices as the third argument to `wrapper.init`, which forwards
   them to `initGame`. Unticked checkboxes can be absent; selects arrive as strings. Handle
   missing, invalid and inapplicable values using the existing normalization conventions.
   Validate restrictions in the engine even when metadata hides an inapplicable control.
3. Preserve old defaults, saved states and init-log shape. New optional fields may need to
   remain absent when disabled: `stockSwap` deliberately does this so old games replay
   identically. Do not rename or repurpose an existing option/item key or rewrite ongoing
   games. Player-count restrictions belong in normalization; metadata also supports
   `requiredPlayers`, `requiredExpansion` and `requiredOption` for conditional setup controls.
4. Update the affected viewer controls and add the key to the explicit query-parameter
   lists in [dev.ts](../packages/viewer/src/dev.ts). Local `?stockSwap=3` works because that
   parser forwards it; arbitrary new query parameters are not forwarded automatically.
   Update `rules.md`, the CMS rules, and applicable tutorial explanations. Translate new
   viewer/log text in all catalogs; translate BGS field and item labels separately.
5. Add engine coverage for the missing/default value, every supported value, invalid input,
   relevant player counts, rule effects and replay. See
   [options.spec.ts](../packages/engine/src/options.spec.ts) and
   [stock-swap.spec.ts](../packages/engine/src/stock-swap.spec.ts). Run the release checks and
   exercise any affected UI with the option enabled and disabled.
6. Publish and verify the supporting engine/viewer first. With the BGS admin token, fetch
   fresh metadata, merge only this declaration by `name` into its `options` array, and PUT
   `{ "options": [...] }` to `/api/admin/gameinfo/acquire/1`. Preserve the array's other entries,
   order and fields. Re-fetch to verify, then inspect the BGS creation form and selected
   values in a test game. Setup choices apply to newly created games.

For reference, this is the existing stock-swap declaration:

```json
{
	"name": "stockSwap",
	"label": "Stock swap (shares per turn, optional variant)",
	"type": "select",
	"default": "off",
	"items": [
		{ "name": "off", "label": "Off" },
		{ "name": "3", "label": "3" },
		{ "name": "5", "label": "5" },
		{ "name": "7", "label": "7" },
		{ "name": "unlimited", "label": "Unlimited" }
	]
}
```

### Preferences, settings and other declarations

Choose the declaration according to who consumes the value:

| Field         | Purpose                                   | Implementation                                            |
| ------------- | ----------------------------------------- | --------------------------------------------------------- |
| `options`     | Rules chosen by the creator at setup      | Engine `init` and option normalization                    |
| `preferences` | Each user's presentation preferences      | Viewer `onPreferences` in `packages/viewer/src/viewer.ts` |
| `settings`    | A player's in-game automation or behavior | Engine `setPlayerSettings` and `playerSettings`           |

These fields share the checkbox/select declaration shape. Preferences must not change game
rules. `sound` is a shared BGS preference; keep honoring the global value. Acquire currently
has no in-game `settings` declarations or engine handlers: implement both before adding one.
Settings updates can contain the full validated settings object; do not assume only one key
arrives. Test changes against private turn drafts, saved state, and player ownership.

Allowed player counts use the top-level `players` array, not an option. Expansions have their
own `expansions` declarations and are passed separately to engine `init`; Acquire currently
has none. Tutorial chapters require both `tutorial.chapters` metadata and matching content
in `packages/viewer/src/tutorial/lessons.ts`. Preserve stable chapter IDs and follow existing
chapter-version handling when revising lessons.

The platform's detailed field schema and event contracts are in its
`apps/docs/docs/guide/game-options.md`, `engine-api.md` and `viewer-api.md` (normally under
`../boardgamers-mono/`). Merge updates to `preferences`, `settings`, `expansions` and
`tutorial` into fresh live metadata just as for options; never upload the bootstrap file.

### CMS text

English rules are read and updated at
`https://admin.boardgamers.space/api/admin/page/acquire:rules/en` using GET and PUT.
Compare the current content with the saved baseline, then PUT `{ "content": "..." }` only.
Preserve title, visibility and other page fields. See [admin/README.md](admin/README.md) for
credits, descriptions and gallery assets. CMS translations and setup labels are separate from
the 17 viewer catalogs; do not use automated translation APIs as part of routine publishing.

## 5. Verify and record the result

- Fetch the final metadata: check engine name/version/entry point, viewer URLs, intended
  declaration changes, and preservation of visibility, tutorials, preferences and other fields.
- Confirm hosted JS/CSS/tarball bytes match the built files. The viewer publisher and engine
  example above do these comparisons. Verify the rules page separately if it changed.
- Inspect the relevant UI in a refreshed browser and exercise behavior locally or in an
  appropriate test game. Do not make test moves in someone else's ongoing game.
- Record the source commit, package versions, validation and any remaining limitations in
  [admin/release-check.md](admin/release-check.md). Keep deployment snapshots outside Git.
- To recover from a bad upload, use the recorded previous artifact references and update only
  the affected fields after checking the current metadata. Check saved-state compatibility
  before reverting an engine; newer moves may require the newer engine.

## Compatibility notes

Live moves support private turn drafts (`type: "turn"`, `from: <saved log length>`,
`moves: [...]`). The engine validates the entire sequence against the saved state.
Reversible choices return `toSave: undefined`; the acting player receives a stripped
`preview` in the log response. Undo drops cached actions/views, not published log entries.
A draft commits when a decision passes to another player, information is revealed, tiles
are drawn or the game ends. Refreshing discards unfinished choices. `timeIncrements` counts
completed turns and other players' merger disposal decisions, never individual revisions.
Atomic moves remain supported for older viewers, tutorials and analysis.

Finished-game analysis uses BGS's default adapters at move boundaries. Ongoing analysis
remains disabled until hidden-information scenarios are implemented. See the release record
for outstanding analysis, translation and playtesting work; public availability does not
mean those gaps are resolved.

## Initial registration only

If setting up a separate new registration, begin private, use the individual fields from
[admin/gameinfo.json](admin/gameinfo.json), and upload its own artifacts. The live Acquire
registration described above already exists and is public; do not recreate or privatize it
as part of an ordinary update.
