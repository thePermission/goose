FINAL VERIFICATION (bar b): VERIFIED_WITH_CONCERNS.
- Coexistence PROVEN: Proose launched alongside live upstream (pid 3283), E2E add/browse/install green, single-instance not lost, real config untouched.
- .deb built: Package=proose, /usr/bin/proose, resources/bin/proose (distinct from goose).
- Suites: cargo 1355 pass +5 pre-existing (no new); clippy/fmt clean; pnpm test:run 540 (2 load flakes re-passed); lint:check clean.
- REAL BUG: packaged proose.desktop has Exec=/usr/lib/goose/Goose + MimeType=x-scheme-handler/goose -> FIXING.
- Concern: pre-existing real ~/.config/proose (OAuth data) predates session, unrelated to code -> tell user.
- Deferred (level C, cosmetic): "Goose" in package.json description + macOS NS* strings.
