# SDD Progress — Proose Rebrand
Branch: feature/proose-rebrand (off corporate b29b945b3)
Plan: docs/superpowers/plans/2026-07-05-proose-rebrand.md
Level C, direct rename. 3 tasks + Final Verification (bar b).
Base: b29b945b3

Task 1: complete (commit b29b945..056cb9d, review Approved). 2-line rename: paths.rs app_name + goose-cli [[bin]] name -> proose. Sandboxed check confirmed ~/.config/proose created, real ~/.config/goose untouched. 5 cargo -p goose failures verified PRE-EXISTING/unrelated (JWT CryptoProvider + insta feature-gate). Binary: target/debug/proose.

OUT-OF-SCOPE FOLLOW-UP (surfaced during Task 2, decide with user): beyond the fixed Justfile/gitignore, these still reference the old `goose` binary name (--bin goose / src/bin/goose) and would break CI/packaging if run: 6 .github/workflows/*.yml (bundle-desktop{,-intel,-windows,-linux}, build-cli, pr-smoke-test), scripts/{test_subrecipes,test_subagents,test_mcp,test_compaction,run-benchmarks}.sh, ui/sdk/scripts/build-native.ts, ui/desktop/tests/integration/test_providers_lib.ts, ui/scripts/publish.sh, documentation automation. NOT in spec (bar-b = local build/dev-run only). A full CI/scripts rebrand is a separate opt-in pass.

Task 2: complete (commits 056cb9d..bd65a33 impl + b89093b fix, review Approved). gooseServe.ts/test binaryName -> proose (variable-driven; all discovery paths auto-resolve); Justfile release-binary/copy-binary{,-intel,-windows}/release-windows/run-server -> --bin proose; .gitignore now ignores src/bin/proose (843MB). Crate names/-p goose/URLs/goosed-cleanup untouched. vitest gooseServe 10/10.

Task 3: complete (commit b89093b..f12f3f5, review Approved). package.json productName=Proose + name=proose-app; forge.config protocol ProoseProtocol/['proose'], deb+rpm name/bin=Proose, flatpak id=io.github.thepermission.Proose; main.ts all goose://->proose:// + reset-protocol-handler arg + setAsDefaultProtocolClient('proose'); stale flatpak-compat comment dropped. grep clean; typecheck+lint:check green (i18n 1556). homepage/icon/NS*/GOOSE_* untouched.

== ALL 3 CODE TASKS DONE at f12f3f59c. Next: bar-b Final Verification (build, isolated dev-run as Proose alongside upstream, pnpm make .deb metadata, suites) + whole-branch diff sanity, then merge to corporate.

FIX (post-final-verification, commit 3279b53f7): forge.deb.desktop + forge.rpm.desktop launchers rebranded Goose->Proose (Name=Proose, Exec=/usr/lib/proose/Proose, Icon=proose.png, MimeType=x-scheme-handler/proose). desktopTemplate files are copied verbatim by maker-deb/rpm (verified), so the next 'pnpm make' produces a correct launcher.
== PROOSE REBRAND COMPLETE at 3279b53f7. Concerns for user (non-blocking): (a) a pre-existing real ~/.config/proose (OAuth data) predates this work; inspect/remove if unwanted. (b) cosmetic "Goose" strings remain in package.json description + macOS NS* usage strings (Level C = identity only, not cosmetic). (c) CI workflows + scripts still reference --bin goose/src/bin/goose (out-of-scope follow-up).
