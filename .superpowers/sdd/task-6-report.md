# Task 6 Report: Regenerate ACP schema + TypeScript SDK

## Status: DONE

Commit: `f4f49aece04ee1bc24eaf87317ad59ca18e3eb94`
Subject: `chore(acp): regenerate schema + SDK for marketplace/plugins methods`

## Commands run (chronological) + output

### Toolchain discovery / setup issues encountered

1. `which just` → not found initially (`just` not on default PATH).
2. Exported `PATH="$HOME/.local/bin:$PATH"` and `LD_LIBRARY_PATH` per brief, confirmed
   `cmake` (user-local, v3.28.3) resolvable.
3. `node`/`npx` resolved via `which` already (from `/usr/lib/goose/resources/bin`), but
   this turned out to be a **goose MCP-server wrapper script**
   (`/usr/lib/goose/resources/bin/node-setup-common.sh`) that unconditionally
   `cd`s into `~/.config/goose/mcp-hermit` before exec'ing node/npx — breaking
   relative-path resolution for `generate-schema.ts`. Discovered this the hard way:
   `npx tsx generate-schema.ts` (run from `ui/sdk`) failed with
   `Cannot find module '/home/sascha/.config/goose/mcp-hermit/generate-schema.ts'`.
4. Worked around by calling the hermit-managed binaries directly
   (`~/.config/goose/mcp-hermit/bin/{node,npx}`), which don't `cd`. That got tsx
   running in the right directory, but then failed with
   `ERR_MODULE_NOT_FOUND: Cannot find package '@hey-api/openapi-ts'` — `ui/sdk`
   (and the whole `ui/` pnpm workspace) had **no `node_modules` at all**.
5. `npx pnpm install --frozen-lockfile` (fetching pnpm 11.10.0 via npx, since no
   `pnpm` binary was on PATH) failed:
   `[ERR_PNPM_LOCKFILE_CONFIG_MISMATCH] Cannot proceed with the frozen
   installation. The current "overrides" configuration doesn't match the value
   found in the lockfile` — caused by `text/package.json`'s plain `"overrides"`
   field conflicting with root's `pnpm.overrides` under a newer pnpm.
6. `npx pnpm install --no-frozen-lockfile` (whole workspace) then failed on the
   `desktop` package: `[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency
   "@electron/node-gyp" (resolved via git-repository) is not allowed in
   subdependencies when blockExoticSubdeps is enabled` — a newer-pnpm default
   security policy tripping over an existing git-resolved subdep in the
   committed lockfile. `--filter @aaif/goose-sdk` didn't avoid it either since
   pnpm still validates the whole lockfile graph.
7. **Root cause of 5+6**: I was using an ad-hoc pnpm (11.10.0, latest via npx)
   instead of the version this repo actually pins. Found the fix:
   the repo has its own **root-level hermit toolchain** at `./bin/` (used by CI —
   see `.github/workflows/ci.yml` `schema-check` job: `source ./bin/activate-hermit`)
   which provides pinned `just` (1.40.0), `pnpm` (10.30.3 — matches
   `bundle-desktop-windows.yml`'s explicit `pnpm@10.30.3`), `node` (v24.10.0),
   and `cmake` (v4.2.3). This resolves cleanly with none of the above lockfile
   issues.

### Actual generation (successful)

```bash
cd /home/sascha/Projects/corporategoose/goose-desktop-ui
export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.local/opt/cmake-dist/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
source ./bin/activate-hermit   # repo-root hermit: just/pnpm/node/cmake pinned versions
```

Ran the CI-mirrored dependency install (schema-check job steps) to populate
`node_modules` for the `ui/` pnpm workspace (needed once, network access to
npm/pnpm registry worked fine throughout):

```
cd ui/desktop && pnpm install --frozen-lockfile
cd ../sdk && pnpm install --frozen-lockfile
```

Both succeeded (`Done in 35.9s using pnpm v10.30.3` / `Done in 6.9s using pnpm v10.30.3`).
`ui/desktop`'s postinstall hook (`build-goose-sdk`) already ran
`generate-schema.ts` as a side effect and reported:
`Generated Goose extension schema in .../ui/sdk/src/generated`.

Then ran the actual target recipe end-to-end for a clean, authoritative pass:

```
just generate-acp-types
```
→ ran `cd crates/goose && cargo run --features code-mode,local-inference,aws-providers,telemetry,otel,rustls-tls,system-keyring --bin generate-acp-schema`
  (fast — reused cached llama-cpp build from a prior run; no recompilation observed)
→ then `cd ui/sdk && npx tsx generate-schema.ts` (via hermit's pinned node/npx,
  no wrapper cd issue)
→ output: `ACP schema generated: crates/goose/acp-schema.json,
  crates/goose/acp-meta.json` … `ACP TypeScript types generated in
  ui/sdk/src/generated/`

## Verification: new client methods exist

```
grep -REn "marketplaceList_unstable|marketplaceInstall_unstable|pluginsList_unstable|pluginsSetEnabled_unstable" ui/sdk/src/generated
```

```
ui/sdk/src/generated/client.gen.ts:535:  async marketplaceList_unstable(
ui/sdk/src/generated/client.gen.ts:571:  async marketplaceInstall_unstable(
ui/sdk/src/generated/client.gen.ts:583:  async pluginsList_unstable(
ui/sdk/src/generated/client.gen.ts:595:  async pluginsSetEnabled_unstable(
```

All four expected matches present. Broader check also confirmed the full set of
8 marketplace/plugins methods generated (`marketplaceList`, `marketplaceAdd`,
`marketplaceRemove`, `marketplaceBrowse`, `marketplaceInstall`, `pluginsList`,
`pluginsSetEnabled`, `pluginsUpdate` — all `_unstable`), each wired through
`client.gen.ts` (method impls), `index.ts` (method-name registry), `types.gen.ts`
(request/response types), and `zod.gen.ts` (runtime schemas).

## check-acp-schema

Ran `just check-acp-schema` (re-runs generation, then `git diff --exit-code` on
the three generated paths) **before** committing — but *after* `git add`, per
the brief's instruction to run it "after staging":

```
🔍 Checking ACP schema and generated types are up-to-date...
✅ ACP schema and generated types are up-to-date
```

Clean pass.

## Files changed / committed

Staged and committed **only**:
- `crates/goose/acp-schema.json` (+378/-0 net lines in diff stat, i.e. new schema entries)
- `crates/goose/acp-meta.json` (+40)
- `ui/sdk/src/generated/client.gen.ts` (+94)
- `ui/sdk/src/generated/index.ts` (+42/-1)
- `ui/sdk/src/generated/types.gen.ts` (+86/-2)
- `ui/sdk/src/generated/zod.gen.ts` (+93)

Total: 6 files changed, 730 insertions(+), 3 deletions(-).

Working tree for these paths is clean post-commit (`git status --short` on the
6 paths → empty).

Other untracked/modified files in the working tree (`.superpowers/sdd/*` briefs,
reports, review diffs from other tasks) were deliberately **not** touched or
staged — out of scope for this task.

## Concerns

1. **Environment friction, not a code issue**: the default `node`/`npx` on
   PATH in this sandbox (`/usr/lib/goose/resources/bin`) is a goose MCP-server
   installer wrapper that changes cwd and is unsuitable for general dev
   scripting; and an ad-hoc `npx pnpm` fetches the *latest* pnpm, which trips
   over pre-existing lockfile/override quirks and a newer default
   `blockExoticSubdeps` security policy against this repo's committed
   `ui/pnpm-lock.yaml` (git-resolved `@electron/node-gyp` subdep via
   `@electron/rebuild`). None of this reflects a problem introduced by this
   task — it's pre-existing repo/lockfile state, only exposed because
   `node_modules` was absent and I initially reached for the wrong pnpm. Using
   the repo's own pinned hermit toolchain (`./bin/activate-hermit`, pnpm
   10.30.3) — the same one CI uses — avoided all of it cleanly.
2. **`ui/node_modules` and `ui/desktop/node_modules`, `ui/sdk/node_modules`
   were installed locally** as a side effect (not committed — `node_modules`
   is gitignored). `pnpm-lock.yaml` was not modified (confirmed unchanged after
   using the correct pinned pnpm; earlier failed attempts with the wrong pnpm
   version never got far enough to write anything).
3. No hand-editing of any generated file occurred — all changes came from
   the generator tools (`generate-acp-schema` binary + `generate-schema.ts` /
   `@hey-api/openapi-ts`).
