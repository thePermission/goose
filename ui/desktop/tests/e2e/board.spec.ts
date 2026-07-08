import { test, expect } from './fixtures';

/**
 * Navigate the already-running app to the Board route.
 *
 * The app uses a HashRouter and playwright.config.ts sets no `baseURL`
 * (the goosePage fixture connects to an existing Electron window over CDP,
 * whose origin/scheme varies between dev-server and packaged builds), so a
 * plain `page.goto('/#/board')` is not usable here. Instead we drive the
 * hash directly, same as marketplaces.spec.ts (react-router's hash history
 * reacts to the resulting `hashchange` on its own; no extra event needed).
 */
async function gotoBoard(goosePage: import('@playwright/test').Page) {
  await goosePage.evaluate(() => {
    window.location.hash = '/board';
  });
  await goosePage.waitForSelector('[data-testid="board-column-waiting"]', { timeout: 10000 });
}

/**
 * Extracts the `resumeSessionId` query param from a HashRouter URL of the
 * form `.../index.html#/pair?resumeSessionId=<id>`. `URL#searchParams` only
 * parses the part before `#`, so the query string living inside the hash
 * fragment has to be pulled out manually.
 */
function extractResumeSessionId(pageUrl: string): string | null {
  const hash = new URL(pageUrl).hash; // e.g. "#/pair?resumeSessionId=<id>"
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('resumeSessionId');
}

test.describe('Session Board', () => {
  // Assigned fresh in beforeEach for every test (each test also gets a fresh
  // Electron app from the goosePage fixture), so there's no cross-test leakage.
  let sessionId: string;

  test.beforeEach(async ({ goosePage }) => {
    // This harness runs against the REAL, persistent local Goose profile with
    // no CI isolation (see fixtures.ts), so the board may already contain
    // unrelated sessions -- including a stale `done` card left behind by an
    // interrupted prior run (the board's done column has a 48h TTL). Every
    // assertion in this file must therefore target the ONE session created
    // here, identified by its real session id, never by column counts or
    // un-scoped role queries.
    //
    // Note: unlike marketplaces.spec.ts's source name, the board card's
    // title is an LLM-generated summary produced asynchronously by the
    // backend (see generate_session_name in
    // crates/goose/src/session/session_naming.rs) -- it does not echo back
    // the literal message text, so a unique substring in the chat message
    // would not reliably (or ever) show up on the card. We still send a
    // recognizable, timestamped message for traceability/manual cleanup,
    // but rely on the session id (surfaced via the `resumeSessionId` URL
    // param the app sets right after creating the session, and mirrored
    // onto the card via `data-session-id`, see BoardCard.tsx) as the actual
    // unique handle.
    const uniqueMarker = `board-e2e-${Date.now()}`;
    await goosePage.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    const chatInput = await goosePage.waitForSelector('[data-testid="chat-input"]');
    await chatInput.fill(`Board e2e smoke session ${uniqueMarker} - please just say hi`);
    await chatInput.press('Enter');

    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 15000 });
    const resumedId = extractResumeSessionId(goosePage.url());
    if (!resumedId) {
      throw new Error(`Could not parse resumeSessionId from URL: ${goosePage.url()}`);
    }
    sessionId = resumedId;

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

    const card = goosePage.locator(`[data-testid="board-card"][data-session-id="${sessionId}"]`);
    await expect(card).toBeVisible();
    await card.click();

    await expect(goosePage).toHaveURL(new RegExp(`resumeSessionId=${sessionId}`));
  });

  test('mark done moves card to Done column and back', async ({ goosePage }) => {
    const card = goosePage.locator(`[data-testid="board-card"][data-session-id="${sessionId}"]`);
    await card.hover();
    await card.getByRole('button', { name: 'Done' }).click();

    // Scope to OUR card inside the Done column -- do not assert on the
    // column's total count, which would break if a stray `done` card from a
    // previous run is already sitting there.
    const doneColumn = goosePage.getByTestId('board-column-done');
    const doneCard = doneColumn.locator(
      `[data-testid="board-card"][data-session-id="${sessionId}"]`
    );
    await expect(doneCard).toBeVisible();

    // Scoped to the specific card, so this can't hit Playwright's
    // strict-mode ambiguity even if another `done` card's Reopen button is
    // also on the page.
    await doneCard.hover();
    await doneCard.getByRole('button', { name: 'Reopen' }).click();

    await expect(doneCard).toHaveCount(0);
  });
});
