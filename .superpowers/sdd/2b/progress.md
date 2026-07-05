# Plan 2b — SDD progress ledger
Branch: feature/marketplace-desktop-ui-2b
Plan: docs/superpowers/plans/2026-07-05-marketplace-desktop-plan-2b-frontend.md
Branch base: cbd6dfa64 (plan commit)

Task 1: complete (commits cbd6dfa..124a7de, review Approved, spec OK, no Critical/Important).
  Minors (plan-mandated, defer to final): (a) "browse failure clears catalog" test starts empty -> trivially true; (b) addSource/removeSource/setPluginEnabled/updatePlugin throw with NO errors.* surface -> Tasks 2/4 MUST try/catch; (c) no unmount guard; (d) no browse() sequencing.

Task 2: complete (commits 124a7de..9381188, review Approved after 1 fix: Remove aria-label disambiguation + 2-source test).
  Minors (plan-mandated, defer to final): triple errorMessage(e) in catch; kind resets to 'claude' after add; no double-click guard on Add button.

Task 3: complete (commits 9381188..febaeb8a, review Approved, no Critical/Important).
  Minors (defer to final fix wave): (a) BrowseSection empty-state "No plugins" shows stacked with error alert on browse failure -> add `&& errors.browse === null`; (b) full-success install toast passes empty msg (no installed plugin names).

Task 4: complete (commits febaeb8a..c754ed9, review Approved, no Critical/Important; +2 tests for optimistic-revert & update-failure).
  Minors (defer to final): (a) enable/disable Switch not disabled during in-flight setPluginEnabled -> double-click race can stomp revert (add disabled guard); (b) no unmount guard on row async handlers.

Task 5: complete (commits c754ed9..63242c0, review Approved, NO issues at any severity). ChatProvider omission verified correct (ambient hub-level ChatProvider already wraps the layout route).

Task 6: complete (commit 63242c0..9d66a30, review Approved; reviewer verified all 4 parity checks by reconstructing every key/value pair from the diff — 47 new keys in en.json, same 47 English-seeded into all 15 non-English catalogs, no pre-existing value altered, ICU placeholders byte-identical). [Resumed post-crash: verdict was lost, re-ran the review gate; all gates green per report: tsc/eslint --max-warnings 0/i18n:check/533 tests.]
  PLAN-MANDATED — HUMAN DECISION at merge (final-review triage): brief Step 3 fill script re-sorts every non-English catalog into en.json key order -> inflates diff for 7 locales (es,hi,ja,ko,ru,tr,zh-CN) to ~563 lines each (~74-75 pre-existing entries reordered; 8 others touched only 1: appsView.retry). Data-safe + functionally inert (JSON key order irrelevant to i18n:check/runtime), reviewer confirmed no value altered. Deferred fix (do NOT apply without asking — contradicts plan script): amend fill to append-in-place. NOT blocking.
  Minor (follow-up): `pnpm test:run -- <paths>` filter args ignored in this repo's vitest config -> full 58-file/533-test suite ran anyway (still green, superset).

Task 7: complete (commit 9d66a30..a3dfe84, review Approved; reviewer independently re-verified ALL selectors against Tasks 2-4 components + confirmed fixture mirrors backend Rust E2E fixture install.rs:220-241 field-for-field + env-failure diagnosis legitimate). Status DONE_WITH_CONCERNS: E2E not green in THIS sandbox — shared pre-existing tests/e2e/fixtures.ts goosePage fixture has hardcoded 10s CDP-connect timeout (fixtures.ts:79-80) vs measured ~12.7s cold start; reproduced identical ECONNREFUSED on UNRELATED pre-existing loading-state.spec.ts => environmental, NOT a spec/UI bug. Plan's documented runbook fallback (MARKETPLACES-RUNBOOK.md) invoked per Global Constraint (Tests). Gates green: pnpm test:run 533 tests, pnpm lint:check.
  Minor/follow-up: (a) spec navigates via window.location.hash directly (unprecedented pattern) + assumes OnboardingGuard satisfied (active provider) -> add note in runbook/spec comment. (b) shared fixtures.ts 10s CDP timeout too tight for slow cold-starts; follow-up (out of Plan-2b scope, affects ALL e2e specs) could bump maxRetries/retryDelay or pre-warm build-goose-sdk/i18n:compile.

== ALL 7 Plan-2b tasks COMPLETE at a3dfe847e. Resumed post-crash (Task 6 verdict re-run + Task 7 done).

== FINAL whole-branch review (opus): Ready to merge = WITH FIXES ==
No Critical. Deferred scope correctly absent; ACP-only honored (no ui/desktop/src/api); generated files untouched; Trust dialog gates EVERY install (no bypass path); partial per-plugin install failures handled; tests verify real behavior; E2E env-diagnosis legitimate (no masked spec bug). Task 1(b) confirmed RESOLVED (Sources/Installed try/catch + toast).
Important #1: mount-time refreshSources/refreshInstalled failures are captured in errors.sources/errors.installed but NEVER surfaced (no toast, no component reads them; only errors.browse is rendered) -> silent, misleading empty states when goosed is down. Deviates from plan's "errors surface via toasts" architecture. FIXING NOW (+ test).
Minor #2 (folded into fix wave): BrowseSection empty-state "No plugins" stacks under the error alert on browse failure -> add `&& errors.browse === null`. FIXING NOW.
Minor #3 (folded into fix wave): InstalledSection enable/disable Switch not disabled during in-flight setPluginEnabled -> add per-row disabled guard. FIXING NOW.
ACCEPTABLE FOLLOW-UPS (reviewer triage, non-blocking): #4 clear `selected` on re-browse; #5 re-sync row enabled on refresh; #6 triple errorMessage(e); #7 empty install-success toast msg; #8 TrustDialog no Esc/backdrop/focus-trap (plan-accepted); #9 remove w/o confirm + no Add in-flight guard; #10 weak "browse-clear" test; Task6 key-reorder (HUMAN decision at merge, data-safe); Task7 hash-nav/OnboardingGuard note + shared 10s CDP timeout (out of scope).

Fix wave (final review): commit a3dfe84..143f13c0 — Important #1 (mount-load errors now surfaced via inline role="alert" in Sources/Installed, mirroring errors.browse; NO new i18n key -> zero catalog churn, 1556 msgs unchanged) + Minor #2 (browse empty-state guard) + Minor #3 (in-flight toggle: per-row disabled + finally cleanup). Re-review APPROVED (sonnet): all 3 fixed, tests exercise real failure paths (30/30 focused re-run), 540/540 full + lint:check green, clean scope.
Follow-on (surfaced by fix re-review): commit 143f13c0..f78b5172f — Sources/Installed empty-state text now guarded by `&& errors.X === null` (was re-manifesting Important #1's false-empty-state on the error path). Controller-verified diff: exactly 2 guard lines + 2 test asserts, no stray/i18n/generated files; 540/540 + lint:check green pristine.

== PLAN 2b COMPLETE at f78b5172f. Ready to merge into corporate (mirror Plan 2a merge+persist commit 518a7a46a). Open items to raise with human at merge: (1) Task6 plan-mandated key-reorder [data-safe, non-blocking]; (2) accepted follow-ups list above.
