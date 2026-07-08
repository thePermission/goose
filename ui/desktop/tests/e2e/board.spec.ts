import { test, expect } from './fixtures';

/**
 * Navigate the already-running app to the Board route.
 *
 * The app uses a HashRouter and playwright.config.ts sets no `baseURL`
 * (the goosePage fixture connects to an existing Electron window over CDP,
 * whose origin/scheme varies between dev-server and packaged builds), so a
 * plain `page.goto('/#/board')` is not usable here. Instead we drive the
 * hash directly and also dispatch `popstate` so this works regardless of
 * whether react-router's hash history is listening for `hashchange` or
 * `popstate` for externally-triggered hash changes.
 */
async function gotoBoard(goosePage: import('@playwright/test').Page) {
  await goosePage.evaluate(() => {
    window.location.hash = '/board';
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await goosePage.waitForSelector('[data-testid="board-column-waiting"]', { timeout: 10000 });
}

test.describe('Session Board', () => {
  test.beforeEach(async ({ goosePage }) => {
    // Ensure there is at least one session for the board to display: send a
    // single chat message from the Hub, which creates a session before the
    // assistant's reply is needed.
    await goosePage.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    const chatInput = await goosePage.waitForSelector('[data-testid="chat-input"]');
    await chatInput.fill('Board e2e smoke session - please just say hi');
    await chatInput.press('Enter');
    await goosePage.waitForSelector('[data-testid="loading-indicator"]', {
      state: 'visible',
      timeout: 10000,
    });

    await gotoBoard(goosePage);
  });

  test('shows columns and opens a session on card click', async ({ goosePage }) => {
    await expect(goosePage.getByTestId('board-column-waiting')).toBeVisible();
    await expect(goosePage.getByTestId('board-column-working')).toBeVisible();
    await expect(goosePage.getByTestId('board-column-done')).toBeVisible();

    const card = goosePage.getByTestId('board-card').first();
    await card.click();

    await expect(goosePage).toHaveURL(/resumeSessionId=/);
  });

  test('mark done moves card to Done column and back', async ({ goosePage }) => {
    const card = goosePage.getByTestId('board-card').first();
    await card.hover();
    await card.getByRole('button', { name: 'Done' }).click();

    const doneColumn = goosePage.getByTestId('board-column-done');
    await expect(doneColumn.getByTestId('board-card')).toHaveCount(1);

    const doneCard = doneColumn.getByTestId('board-card').first();
    await doneCard.hover();
    await doneColumn.getByRole('button', { name: 'Reopen' }).click();

    await expect(doneColumn.getByTestId('board-card')).toHaveCount(0);
  });
});
