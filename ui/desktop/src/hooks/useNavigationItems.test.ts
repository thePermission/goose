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
