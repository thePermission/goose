### Task 7: Playwright E2E — add → browse → install against a local git fixture marketplace

Deliverable: a Playwright spec that launches the app (via the existing `goosePage` fixture, which spawns `goosed`), navigates to `/marketplaces`, adds a local git fixture marketplace (kind `claude`), browses its catalog, installs the `demo` plugin behind the Trust dialog, and asserts it appears in the Installed section — plus a fixture builder and a documented manual-runbook fallback.

**Files:**
- Create: `ui/desktop/tests/e2e/marketplace-fixture.ts`
- Create: `ui/desktop/tests/e2e/marketplaces.spec.ts`
- Create: `ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md` (manual fallback)

**Interfaces:**
- Consumes: `test`, `expect` from `./fixtures` (existing; provides `goosePage: Page` after launching electron + `goosed`); the app's HashRouter (navigate via `window.location.hash`); the `data-testid` hooks produced in Tasks 2-4 (`marketplace-source-name`, `marketplace-source-location`, `marketplace-source-kind`, `marketplace-source-add`, `marketplace-browse-select`, `marketplace-browse`, `marketplace-install`, `marketplace-trust-confirm`, `marketplace-source-remove-<name>`, `installed-plugin-<name>`) and the catalog checkbox `aria-label={plugin.name}`.
- The fixture repo layout mirrors the backend's expected Claude marketplace format (`.claude-plugin/marketplace.json` + `plugins/demo/.claude-plugin/plugin.json` + `plugins/demo/skills/x/SKILL.md`), matching the core `e2e_register_fetch_install_from_local_git_marketplace` test in `crates/goose/src/marketplace/install.rs`.
- Note: `tests/e2e` is outside the `tsconfig.json` `include`, so these files are not part of `pnpm typecheck`; Playwright compiles them itself.

- [ ] **Step 1: Write the fixture builder and the failing spec**

Create `ui/desktop/tests/e2e/marketplace-fixture.ts`:

```ts
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Build a local git-repo Claude marketplace with one installable plugin ("demo"). */
export function createMarketplaceFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'goose-mp-e2e-'));

  mkdirSync(join(repo, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(repo, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'e2e-market',
      owner: { name: 'e2e' },
      plugins: [{ name: 'demo', source: './plugins/demo', description: 'a demo plugin' }],
    })
  );

  const demoMeta = join(repo, 'plugins', 'demo', '.claude-plugin');
  mkdirSync(demoMeta, { recursive: true });
  writeFileSync(
    join(demoMeta, 'plugin.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', description: 'a demo plugin' })
  );

  const skill = join(repo, 'plugins', 'demo', 'skills', 'x');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: x\ndescription: does x\n---\nBody.\n');

  const git = (args: string[]) => execFileSync('git', args, { cwd: repo });
  git(['init']);
  git(['config', 'user.email', 'e2e@example.com']);
  git(['config', 'user.name', 'e2e']);
  git(['add', '.']);
  git(['commit', '-m', 'init']);

  return repo;
}
```

Create `ui/desktop/tests/e2e/marketplaces.spec.ts`:

```ts
import { test, expect } from './fixtures';
import { createMarketplaceFixture } from './marketplace-fixture';

test.describe('Marketplaces', () => {
  test('add a source, browse the catalog, and install a plugin', async ({ goosePage }) => {
    const fixture = createMarketplaceFixture();
    const sourceName = `e2e-market-${Date.now()}`;

    // Navigate to the Marketplaces view (HashRouter listens to hashchange).
    await goosePage.evaluate(() => {
      window.location.hash = '#/marketplaces';
    });
    await goosePage.waitForSelector('[data-testid="marketplace-source-name"]', { timeout: 30000 });

    // Add the local git fixture as a Claude marketplace source.
    await goosePage.fill('[data-testid="marketplace-source-name"]', sourceName);
    await goosePage.fill('[data-testid="marketplace-source-location"]', fixture);
    await goosePage.selectOption('[data-testid="marketplace-source-kind"]', 'claude');
    await goosePage.click('[data-testid="marketplace-source-add"]');

    // Browse the new source's catalog (network/git — allow generous timeout).
    await goosePage.selectOption('[data-testid="marketplace-browse-select"]', sourceName);
    await goosePage.click('[data-testid="marketplace-browse"]');
    const demoCheckbox = goosePage.getByRole('checkbox', { name: 'demo' });
    await expect(demoCheckbox).toBeVisible({ timeout: 30000 });

    // Select the plugin and install it via the Trust dialog.
    await demoCheckbox.check();
    await goosePage.click('[data-testid="marketplace-install"]');
    await goosePage.click('[data-testid="marketplace-trust-confirm"]');

    // The Installed section should list the demo plugin.
    await expect(goosePage.getByTestId('installed-plugin-demo')).toBeVisible({ timeout: 60000 });

    // Best-effort cleanup: remove the source we added (ambient user config).
    await goosePage.click(`[data-testid="marketplace-source-remove-${sourceName}"]`).catch(() => {});
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"`
Expected: FAIL — the app has no Marketplaces view yet at the branch point where this task starts, or (once Tasks 1-6 are merged) the spec passes; if run before the UI exists it fails at `waitForSelector('[data-testid="marketplace-source-name"]')` (timeout). This confirms the spec exercises the real UI.

- [ ] **Step 3: Add the manual-runbook fallback**

Create `ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md`:

```markdown
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
```

- [ ] **Step 4: Verify the spec passes when the UI is present**

Run (with Tasks 1-6 in the working tree): `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"`
Expected: PASS — the Installed section shows `installed-plugin-demo`. If Playwright + `goosed` are unstable in the CI environment, record that and rely on `MARKETPLACES-RUNBOOK.md` (Plan 2b fallback).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/tests/e2e/marketplace-fixture.ts \
        ui/desktop/tests/e2e/marketplaces.spec.ts \
        ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md
git commit -m "test(marketplaces): add Playwright E2E (add/browse/install) with local git fixture + manual runbook"
```

---

## Final verification (run before handoff)

From `ui/desktop/`:

- `pnpm test:run` — all Vitest suites green (marketplace hook, three sections, view, navigation).
- `pnpm lint:check` — `tsc --noEmit` + `eslint --max-warnings 0` + `i18n:check` all green.
- `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"` — green, or documented fallback to `MARKETPLACES-RUNBOOK.md`.
