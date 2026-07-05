# Task 6 Report: i18n extraction + locale-catalog parity + full lint gate

## Environment note

`pnpm` was not on `PATH`. Corepack itself was also missing from the default `node`
resolution (`/usr/lib/goose/resources/bin/node`, a goose wrapper script) and from
the pre-existing `/tmp/pnpm-shim/pnpm` (which called a nonexistent `corepack`).
Fixed by prepending the hermit-cached Node 24.15.0 bin dir
(`/home/sascha/.cache/hermit/pkg/node-24.15.0/bin`, which bundles `corepack`) to
`PATH`, then generating a pinned shim at `/tmp/corepack-bin/pnpm` that always
execs `corepack pnpm@10.30.0 "$@"`. This matters because `i18n:extract`'s npm
script internally shells out to a bare `pnpm run i18n:compile`; without the pinned
shim in `PATH`, that nested call failed with `pnpm: not found`. All commands below
were run with:

```bash
export PATH="/tmp/corepack-bin:/home/sascha/.cache/hermit/pkg/node-24.15.0/bin:$PATH"
```

`pnpm --version` resolved to `10.30.0` throughout (matches `engines.pnpm: ">=10.30.0"`
in `package.json`).

## Step 1: RED — `pnpm i18n:check` before extraction

```
> goose-app@1.41.0 i18n:check /home/sascha/Projects/corporategoose/goose-mp-2b/ui/desktop
> node scripts/i18n-check.js && node scripts/i18n-validate-locale.js

Error: src/i18n/messages/en.json is out of date. Run pnpm i18n:extract to update it.
 ELIFECYCLE  Command failed with exit code 1.
```

Matches the brief's expected RED exactly.

## Step 2: `pnpm i18n:extract`

Ran cleanly (only pnpm workspace platform warnings for unrelated `goose-binary-*`
optional deps, no errors). `node scripts/i18n-check.js` afterwards passed silently.
Diff on `en.json`: **+141 lines, 0 deletions** — pure addition of the following
**47 new keys** (all `defaultMessage`s in English, as extracted from the Tasks 1–5
`defineMessages` blocks):

- `marketplaces.browse.*` (15): browseButton, browsing, empty, heading, install,
  installPartial, installSucceeded, no, noSource, resultFailure, resultSuccess,
  resultsHeading, selectLabel, unsupported, yes
- `marketplaces.installed.*` (9): autoUpdateOff, autoUpdateOn, empty, enableLabel,
  heading, loading, toggleFailed, update, updateFailed, updating
- `marketplaces.sources.*` (13): add, addFailed, empty, heading, kindClaude,
  kindCodex, kindLabel, locationPlaceholder, namePlaceholder, remove, removeFailed,
  required
- `marketplaces.trust.*` (7): cancel, confirm, installing, pluginsLabel,
  sourceLabel, title, warning
- `marketplaces.view.*` (2): description, heading
- `navigation.itemMarketplaces` (1)

ICU placeholder-bearing messages confirmed present verbatim in `en.json`:
- `marketplaces.browse.resultFailure`: `"{name}: failed — {error}"`
- `marketplaces.browse.resultSuccess`: `"{name}: installed (skills: {skills}, hooks: {hooks}, MCP: {mcp})"`
- `marketplaces.installed.enableLabel`: `"Enable {name}"`
- `marketplaces.sources.remove`: `"Remove {name}"`

## Step 3: locale-parity RED, then fill

`node scripts/i18n-validate-locale.js` reported, for **every one of the 15
non-English catalogs** (`de, es, fr, hi, id, it, ja, ko, ms, pt, ru, tr, vi,
zh-CN, zh-TW` — listed straight from `src/i18n/messages/`, matches the brief's
15-locale list exactly), the identical set of 47 missing keys shown above.

Ran the one-off fill script from the brief verbatim. Result — **47 keys added to
each of the 15 non-English catalogs**, seeded with the English `defaultMessage`:

| File | Keys added |
|---|---|
| de.json | 47 |
| es.json | 47 |
| fr.json | 47 |
| hi.json | 47 |
| id.json | 47 |
| it.json | 47 |
| ja.json | 47 |
| ko.json | 47 |
| ms.json | 47 |
| pt.json | 47 |
| ru.json | 47 |
| tr.json | 47 |
| vi.json | 47 |
| zh-CN.json | 47 |
| zh-TW.json | 47 |

## Step 4: GREEN gates

`pnpm i18n:check`:
```
i18n locale validation passed for de, es, fr, hi, id, it, ja, ko, ms, pt, ru, tr, vi, zh-CN, zh-TW (1556 messages).
```

`pnpm lint:check` (tsc --noEmit && eslint --max-warnings 0 --no-warn-ignored && i18n:check), exit code 0:
```
> goose-app@1.41.0 lint:check ... 
> pnpm run typecheck && eslint "src/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored && pnpm run i18n:check
...
> goose-app@1.41.0 typecheck ...
> tsc --noEmit
(no output = success)
(eslint: no output = success, 0 warnings/errors)
> goose-app@1.41.0 i18n:check ...
> node scripts/i18n-check.js && node scripts/i18n-validate-locale.js
i18n locale validation passed for de, es, fr, hi, id, it, ja, ko, ms, pt, ru, tr, vi, zh-CN, zh-TW (1556 messages).
```

`pnpm test:run -- src/components/marketplaces src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`:
The `--` filter args did not actually narrow vitest's file selection in this repo's
setup — it ran the **full suite**: `58 test files, 533 tests, all passed`. Confirmed
the target files are part of that suite and part of the passing run:
`src/components/marketplaces/{BrowseSection,InstalledSection,MarketplaceContext,
MarketplacesView,SourcesSection}.test.tsx`, `src/utils/navigationUtils.test.ts`,
`src/hooks/useNavigationItems.test.ts`. All green (superset of what was asked,
zero failures).

## Data-integrity self-review

Ran a verification pass (not part of the brief, done as due diligence) comparing
every locale file's pre-existing key/value pairs against the post-fill state:
- No existing translation value was altered or lost in any of the 15 catalogs.
- All 47 new keys present in all 16 catalogs (including en.json) with identical
  key sets across every file (1556 keys each).
- The 4 keys with ICU placeholders (`resultFailure`, `resultSuccess`,
  `enableLabel`, `sources.remove`) carry byte-identical placeholder text
  (`{name}`, `{error}`, `{skills}`, `{hooks}`, `{mcp}`) in every locale (since all
  non-English catalogs were seeded from the English `defaultMessage`, per the
  brief — no premature/incorrect translation was introduced).
- `prettier --check "src/i18n/messages/*.json"` — all files formatted correctly.
- All 16 JSON files parse successfully.

## Concern: key-reordering side effect of the brief's fill script

The brief's fill script rewrites every non-English catalog "in en.json key order
... so diffs stay minimal." For **8 locales** (de, fr, id, it, ms, pt, vi, zh-TW)
this was indeed minimal (only ~3 positions out of 1509 pre-existing keys differed
from en.json's order, so the diff is just the 47 new keys, ~147 diff lines each).

For **7 locales** (es, hi, ja, ko, ru, tr, zh-CN) the pre-existing key order
already diverged substantially from `en.json`'s order (337 of 1509 positions,
pre-dating this task) — for these files the rewrite normalized that order,
producing much larger diffs (~563–565 lines each, mostly reorder-only, not
content changes). Verified byte-for-byte that no values were altered — this is
pure key reordering, not a content or translation change, and does not affect
`i18n:check`/`lint:check` (JSON key order is irrelevant to the validator or to
runtime message lookup). Flagging per the "no stray reformatting of unrelated
catalog entries" self-review instruction: the reordering is a side effect of the
exact script given in the task brief (Step 3), not something introduced ad hoc —
but it does touch more of es/hi/ja/ko/ru/tr/zh-CN than the marketplace feature
alone would strictly require. If a smaller diff is preferred for those 7 files,
a follow-up could redo the fill by appending only the new keys in-place instead
of full reordering; not done here since the brief's script was applied verbatim
as instructed and the result is functionally correct and green on every gate.

## Files changed (commit `9d66a304c`)

```
ui/desktop/src/i18n/messages/de.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/en.json    | 141 ++++++++
ui/desktop/src/i18n/messages/es.json    | 565 ++++++++++++++++++++------------
ui/desktop/src/i18n/messages/fr.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/hi.json    | 565 ++++++++++++++++++++------------
ui/desktop/src/i18n/messages/id.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/it.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/ja.json    | 565 ++++++++++++++++++++------------
ui/desktop/src/i18n/messages/ko.json    | 563 +++++++++++++++++++------------
ui/desktop/src/i18n/messages/ms.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/pt.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/ru.json    | 565 ++++++++++++++++++++------------
ui/desktop/src/i18n/messages/tr.json    | 563 +++++++++++++++++++------------
ui/desktop/src/i18n/messages/vi.json    | 147 ++++++++-
ui/desktop/src/i18n/messages/zh-CN.json | 565 ++++++++++++++++++++------------
ui/desktop/src/i18n/messages/zh-TW.json | 147 ++++++++-
16 files changed, 3762 insertions(+), 1506 deletions(-)
```

No `.ts`/`.tsx` component/source files were touched. No SDK/acp files touched.
Working tree is clean except the untracked `.superpowers/sdd/2b/` task-brief
directory (not part of this task's deliverable).

## Status

DONE_WITH_CONCERNS — all gates green; sole concern is the key-reordering side
effect described above (data-safe, functionally inert, but inflates the diff for
7 of the 15 locale files beyond the minimal 47-key addition).
