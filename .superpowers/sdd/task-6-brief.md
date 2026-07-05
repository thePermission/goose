### Task 6: Regenerate ACP schema + SDK

**Files:**
- Modify (generated): `crates/goose/acp-schema.json`, `crates/goose/acp-meta.json`, `ui/sdk/src/generated/*`

- [ ] **Step 1: Generate** — from repo root, with the user-local cmake on PATH (needed by the schema binary's feature set) and Node available:

```bash
export PATH="$HOME/.local/bin:$PATH"
just generate-acp-types
```

- [ ] **Step 2: Verify the new client methods exist**

Run: `grep -REn "marketplaceList_unstable|marketplaceInstall_unstable|pluginsList_unstable|pluginsSetEnabled_unstable" ui/sdk/src/generated`
Expected: matches present (camelCased from `_goose/unstable/marketplace/list` → `marketplaceList_unstable`, `.../plugins/set-enabled` → `pluginsSetEnabled_unstable`).

- [ ] **Step 3: check-acp-schema is clean after commit** — `just check-acp-schema` → "up-to-date" (run after staging).

- [ ] **Step 4: Commit generated files**

```bash
git add crates/goose/acp-schema.json crates/goose/acp-meta.json ui/sdk/src/generated
git commit -m "chore(acp): regenerate schema + SDK for marketplace/plugins methods"
```

---

