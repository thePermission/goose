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
