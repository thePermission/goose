### Task 5: `MarketplacesView` composition + navigation registration

Deliverable: `MarketplacesView` composes the three sections in `MainPanelLayout`; a `/marketplaces` route (wrapped in `MarketplaceProvider`) is registered in `App.tsx`; `'marketplaces'` is added to the `View` union + `createNavigationHandler`; a `Marketplaces` sidebar item is added to `NAV_ITEMS`. Verified with a rendered-view test (child sections mocked) plus unit tests for the navigation registration.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/MarketplacesView.tsx`
- Test: `ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx`
- Modify: `ui/desktop/src/utils/navigationUtils.ts` (View union lines 5-20; `createNavigationHandler` switch, after the `extensions` case ~line 75)
- Test: `ui/desktop/src/utils/navigationUtils.test.ts`
- Modify: `ui/desktop/src/hooks/useNavigationItems.ts` (imports line 1-11; `NAV_ITEMS` after the `extensions` entry ~line 30; `navItemMessages` ~line 65)
- Test: `ui/desktop/src/hooks/useNavigationItems.test.ts`
- Modify: `ui/desktop/src/App.tsx` (imports near line 34-47; add `MarketplacesRoute` after `ExtensionsRoute` ~line 305; add `<Route>` after the `extensions` route ~line 657)

**Interfaces:**
- Consumes: `MainPanelLayout` (`../Layout/MainPanelLayout`, named export); child sections `./SourcesSection`, `./BrowseSection`, `./InstalledSection` (default exports, Tasks 2-4); `MarketplaceProvider` (`./MarketplaceContext`, Task 1); `createNavigationHandler`/`View` (`../../utils/navigationUtils`); `NAV_ITEMS`/`getNavItemLabel`/`NavItem` (`../hooks/useNavigationItems`); `createIntl` (`react-intl`); `Store` (`lucide-react`).
- Produces: `export default function MarketplacesView(): JSX.Element`; `View` union member `'marketplaces'`; nav item `{ id: 'marketplaces', path: '/marketplaces', label: 'Marketplaces', icon: Store }`; route `path="marketplaces"`.

- [ ] **Step 1: Write the failing tests**

Create `ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx` (no `import React` — the repo relies on the JSX automatic runtime + the global `React`; an unused `import React` would trip `noUnusedLocals`. We mock `useMarketplace`/`toastService` and let the real sections render so the test also proves all three mount):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import MarketplacesView from './MarketplacesView';
import { useMarketplace, type MarketplaceContextValue } from './MarketplaceContext';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(): MarketplaceContextValue {
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
  };
}

describe('MarketplacesView', () => {
  it('renders the heading and all three sections', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx());
    render(<MarketplacesView />, { wrapper: IntlTestWrapper });
    expect(screen.getByRole('heading', { level: 1, name: 'Marketplaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Installed' })).toBeInTheDocument();
  });
});
```

Create `ui/desktop/src/utils/navigationUtils.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createNavigationHandler } from './navigationUtils';

describe('createNavigationHandler', () => {
  it('navigates to /marketplaces for the marketplaces view', () => {
    const navigate = vi.fn();
    createNavigationHandler(navigate)('marketplaces');
    expect(navigate).toHaveBeenCalledWith('/marketplaces', { state: undefined });
  });
});
```

Create `ui/desktop/src/hooks/useNavigationItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createIntl } from 'react-intl';
import { NAV_ITEMS, getNavItemLabel } from './useNavigationItems';

describe('marketplaces nav item', () => {
  it('registers a Marketplaces item at /marketplaces', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'marketplaces');
    expect(item).toBeDefined();
    expect(item?.path).toBe('/marketplaces');
  });

  it('localizes the Marketplaces label', () => {
    const intl = createIntl({ locale: 'en', messages: {} });
    const item = NAV_ITEMS.find((i) => i.id === 'marketplaces')!;
    expect(getNavItemLabel(item, intl)).toBe('Marketplaces');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/components/marketplaces/MarketplacesView.test.tsx src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`
Expected: FAIL — `MarketplacesView.test.tsx` cannot resolve `./MarketplacesView`; `navigationUtils.test.ts` fails `expect(navigate).toHaveBeenCalledWith('/marketplaces', …)` (handler falls through to `navigate('/')`); `useNavigationItems.test.ts` fails `expect(item).toBeDefined()`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/MarketplacesView.tsx`:

```tsx
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import SourcesSection from './SourcesSection';
import BrowseSection from './BrowseSection';
import InstalledSection from './InstalledSection';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.view.heading', defaultMessage: 'Marketplaces' },
  description: {
    id: 'marketplaces.view.description',
    defaultMessage:
      'Manage plugin marketplaces, browse their catalogs, install plugins, and manage installed plugins.',
  },
});

export default function MarketplacesView() {
  const intl = useIntl();
  return (
    <MainPanelLayout>
      <div className="flex flex-col min-w-0 flex-1 overflow-y-auto">
        <div className="bg-background-primary px-8 pb-4 pt-16">
          <h1 className="text-4xl font-light mb-1">{intl.formatMessage(i18n.heading)}</h1>
          <p className="text-sm text-text-secondary mb-6">{intl.formatMessage(i18n.description)}</p>
        </div>
        <div className="px-8 pb-16 flex flex-col gap-10">
          <SourcesSection />
          <BrowseSection />
          <InstalledSection />
        </div>
      </div>
    </MainPanelLayout>
  );
}
```

In `ui/desktop/src/utils/navigationUtils.ts`, add `'marketplaces'` to the `View` union (e.g. after `'extensions'`):

```ts
  | 'extensions'
  | 'marketplaces'
```

and add a case in `createNavigationHandler`, immediately after the `extensions` case:

```ts
      case 'marketplaces':
        navigate('/marketplaces', { state: options });
        break;
```

In `ui/desktop/src/hooks/useNavigationItems.ts`, add `Store` to the lucide-react import:

```ts
import {
  AppWindow,
  Clock,
  FileText,
  History,
  MessageSquarePlus,
  Puzzle,
  Settings,
  Store,
  Zap,
} from 'lucide-react';
```

add the nav item after the `extensions` entry in `NAV_ITEMS`:

```ts
  { id: 'marketplaces', path: '/marketplaces', label: 'Marketplaces', icon: Store },
```

and add the message to `navItemMessages` after `extensions`:

```ts
  marketplaces: {
    id: 'navigation.itemMarketplaces',
    defaultMessage: 'Marketplaces',
  },
```

In `ui/desktop/src/App.tsx`, add the imports near the other view imports (~line 34-47):

```tsx
import MarketplacesView from './components/marketplaces/MarketplacesView';
import { MarketplaceProvider } from './components/marketplaces/MarketplaceContext';
```

add the route component after `ExtensionsRoute` (~line 305):

```tsx
const MarketplacesRoute = () => {
  return (
    <MarketplaceProvider>
      <MarketplacesView />
    </MarketplaceProvider>
  );
};
```

and register the route after the `extensions` `<Route>` (~line 657, inside the layout `<Route path="/">`):

```tsx
              <Route path="marketplaces" element={<MarketplacesRoute />} />
```

- [ ] **Step 4: Run the tests + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/MarketplacesView.test.tsx src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`
Expected: PASS (4 tests).
Run: `pnpm typecheck`
Expected: PASS (App.tsx route + View union compile).
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" src/App.tsx src/utils/navigationUtils.ts src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.ts src/hooks/useNavigationItems.test.ts --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/MarketplacesView.tsx \
        ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx \
        ui/desktop/src/utils/navigationUtils.ts \
        ui/desktop/src/utils/navigationUtils.test.ts \
        ui/desktop/src/hooks/useNavigationItems.ts \
        ui/desktop/src/hooks/useNavigationItems.test.ts \
        ui/desktop/src/App.tsx
git commit -m "feat(marketplaces): compose MarketplacesView and register /marketplaces route + sidebar item"
```

---

