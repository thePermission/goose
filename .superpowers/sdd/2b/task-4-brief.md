### Task 4: Installed section (list + enable/disable toggle + update)

Deliverable: `InstalledSection` lists installed plugins (name, version, source, `Auto-update: on/off` display-only), toggles enable/disable with an optimistic switch, and shows an Update button only for `updatable` plugins with a per-row busy state. Verified with `useMarketplace` and `toastService` mocked.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/InstalledSection.tsx`
- Test: `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx`

**Interfaces:**
- Consumes: `useMarketplace()` → `{ installedPlugins, loading, setPluginEnabled, updatePlugin }` (Task 1); `InstalledPluginInfo` (`@aaif/goose-sdk`); `errorMessage` (`./errorMessage`); `toastService` (`../../toasts`); `Button` (`../ui/button`); `Switch` (`../ui/switch`, Radix — renders with `role="switch"`, controlled via `checked`/`onCheckedChange`); `defineMessages`, `useIntl` (`../../i18n`).
- Produces: `export default function InstalledSection(): JSX.Element`; each row has `data-testid={`installed-plugin-<name>`}`; toggle switch uses `aria-label={`Enable <name>`}`.
- Deferred (do NOT add): a control to change `autoUpdate` — v1 only displays it.

- [ ] **Step 1: Write the failing test**

Create `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx`:

```tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderOptions } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import InstalledSection from './InstalledSection';
import { useMarketplace, type MarketplaceContextValue } from './MarketplaceContext';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(overrides: Partial<MarketplaceContextValue> = {}): MarketplaceContextValue {
  return {
    sources: [],
    catalog: [],
    browsedSource: null,
    installedPlugins: [],
    loading: { sources: false, browse: false, install: false, installed: false },
    errors: { sources: null, browse: null, install: null, installed: null },
    refreshSources: vi.fn().mockResolvedValue(undefined),
    addSource: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    browse: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue([]),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
    updatePlugin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const renderWithIntl = (ui: React.ReactElement, o?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...o });

const plugins = [
  { name: 'demo', version: '1.0.0', source: 'core', enabled: true, autoUpdate: false, updatable: true },
  { name: 'builtin', version: '2.1.0', source: 'local', enabled: false, autoUpdate: true, updatable: false },
];

beforeEach(() => vi.clearAllMocks());

describe('InstalledSection', () => {
  it('lists installed plugins with version and source', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: plugins }));
    renderWithIntl(<InstalledSection />);
    expect(screen.getByTestId('installed-plugin-demo')).toHaveTextContent('demo');
    expect(screen.getByTestId('installed-plugin-demo')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('installed-plugin-builtin')).toHaveTextContent('local');
  });

  it('shows the Update button only for updatable plugins', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: plugins }));
    renderWithIntl(<InstalledSection />);
    const demoRow = screen.getByTestId('installed-plugin-demo');
    const builtinRow = screen.getByTestId('installed-plugin-builtin');
    expect(demoRow.querySelector('[data-slot="button"]')).not.toBeNull();
    expect(builtinRow.querySelector('[data-slot="button"]')).toBeNull();
  });

  it('toggles enable/disable and reflects the new state optimistically', async () => {
    const setPluginEnabled = vi.fn(() => new Promise<void>(() => {}));
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], setPluginEnabled })
    );
    renderWithIntl(<InstalledSection />);
    const toggle = screen.getByRole('switch', { name: 'Enable demo' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enable demo' })).toHaveAttribute('aria-checked', 'false')
    );
    expect(setPluginEnabled).toHaveBeenCalledWith('demo', false);
  });

  it('calls updatePlugin when the Update button is clicked', async () => {
    const updatePlugin = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], updatePlugin })
    );
    renderWithIntl(<InstalledSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(updatePlugin).toHaveBeenCalledWith('demo'));
  });

  it('shows an empty state when no plugins are installed', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: [] }));
    renderWithIntl(<InstalledSection />);
    expect(screen.getByText('No plugins installed yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/components/marketplaces/InstalledSection.test.tsx`
Expected: FAIL — cannot resolve import `./InstalledSection`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/InstalledSection.tsx`:

```tsx
import { useState } from 'react';
import type { InstalledPluginInfo } from '@aaif/goose-sdk';
import { useMarketplace } from './MarketplaceContext';
import { errorMessage } from './errorMessage';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.installed.heading', defaultMessage: 'Installed' },
  empty: { id: 'marketplaces.installed.empty', defaultMessage: 'No plugins installed yet.' },
  loading: { id: 'marketplaces.installed.loading', defaultMessage: 'Loading installed plugins…' },
  autoUpdateOn: { id: 'marketplaces.installed.autoUpdateOn', defaultMessage: 'Auto-update: on' },
  autoUpdateOff: { id: 'marketplaces.installed.autoUpdateOff', defaultMessage: 'Auto-update: off' },
  enableLabel: { id: 'marketplaces.installed.enableLabel', defaultMessage: 'Enable {name}' },
  update: { id: 'marketplaces.installed.update', defaultMessage: 'Update' },
  updating: { id: 'marketplaces.installed.updating', defaultMessage: 'Updating…' },
  updateFailed: { id: 'marketplaces.installed.updateFailed', defaultMessage: 'Failed to update plugin' },
  toggleFailed: { id: 'marketplaces.installed.toggleFailed', defaultMessage: 'Failed to change plugin state' },
});

function InstalledPluginRow({ plugin }: { plugin: InstalledPluginInfo }) {
  const intl = useIntl();
  const { setPluginEnabled, updatePlugin } = useMarketplace();
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await setPluginEnabled(plugin.name, next);
    } catch (e) {
      setEnabled(!next);
      toastService.error({
        title: intl.formatMessage(i18n.toggleFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePlugin(plugin.name);
    } catch (e) {
      toastService.error({
        title: intl.formatMessage(i18n.updateFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <li
      data-testid={`installed-plugin-${plugin.name}`}
      className="flex items-center justify-between border border-border-primary rounded-md px-3 py-2"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {plugin.name} <span className="text-text-secondary">v{plugin.version}</span>
        </div>
        <div className="text-xs text-text-secondary truncate">{plugin.source}</div>
        <div className="text-xs text-text-secondary">
          {plugin.autoUpdate
            ? intl.formatMessage(i18n.autoUpdateOn)
            : intl.formatMessage(i18n.autoUpdateOff)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {plugin.updatable && (
          <Button variant="secondary" size="sm" onClick={handleUpdate} disabled={updating}>
            {updating ? intl.formatMessage(i18n.updating) : intl.formatMessage(i18n.update)}
          </Button>
        )}
        <Switch
          aria-label={intl.formatMessage(i18n.enableLabel, { name: plugin.name })}
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>
    </li>
  );
}

export default function InstalledSection() {
  const intl = useIntl();
  const { installedPlugins, loading } = useMarketplace();

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>
      {loading.installed && installedPlugins.length === 0 ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      ) : installedPlugins.length === 0 ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.empty)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {installedPlugins.map((p) => (
            <InstalledPluginRow key={p.name} plugin={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/InstalledSection.test.tsx`
Expected: PASS (5 tests).
Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/InstalledSection.tsx \
        ui/desktop/src/components/marketplaces/InstalledSection.test.tsx
git commit -m "feat(marketplaces): add Installed section with enable/disable toggle and update"
```

---

