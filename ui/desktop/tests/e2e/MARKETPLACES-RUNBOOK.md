# Manual runbook — Marketplaces (fallback for `marketplaces.spec.ts`)

Use this when Playwright + `goosed` are unstable in CI (per Plan 2b, the automated
E2E is the goal; this runbook is the documented fallback). It mutates ambient user
config and installs a plugin into the user's plugin dir — run against a disposable
`HOME`/goose config, or remove the source and plugin afterward.

1. Build the fixture: `node -e "require('./tests/e2e/marketplace-fixture').createMarketplaceFixture()"`
   prints nothing; instead call it from a REPL and note the printed path, or copy the
   `createMarketplaceFixture` body to create a local git repo with
   `.claude-plugin/marketplace.json` + `plugins/demo`.
2. `pnpm start-gui`, open the sidebar, click **Marketplaces**.
3. **Sources:** enter a unique Name, paste the fixture repo path as Location, Kind = Claude, click **Add**. The source appears in the list.
4. **Browse:** select the source, click **Browse**. The `demo` plugin appears (installable, not Unsupported).
5. Tick `demo`, click **Install selected**, review the **Trust dialog** (shows source name · kind · location + hooks/MCP warning), click **Install**.
6. Verify the **Installation results** show `demo: installed (skills: 1, hooks: no, MCP: no)` and the **Installed** section lists `demo` with an enable/disable toggle and (if git) an **Update** button.
7. Toggle enable/disable and confirm it persists. **Cleanup:** click the source's Remove button.
