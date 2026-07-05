# SDD Progress — Proose Release CI
Branch: feature/proose-release-ci (off corporate c5f85b670)
Plan: docs/superpowers/plans/2026-07-05-proose-release-ci.md
4 tasks: (1) version script + skeleton + Ubuntu deb, (2) AlmaLinux9 rpm, (3) Windows zip, (4) release job.
Base: c5f85b670
Verify reality: CI YAML — per-task gate = actionlint + local build where feasible (deb fully local; rpm via docker if available; windows only actionlint). True end-to-end proof = proose-v* test tag (needs user go-ahead).

Task 1: complete (commit c5f85b6..1461846, review Approved; + plan fix af67fb7a). scripts/proose-set-version.sh (stamps ui/desktop/package.json + Cargo [workspace.package] version; ^version anchored -> safe) + proose-release.yml (triggers proose-v* + workflow_dispatch, permissions contents:write) + build-ubuntu-deb job. actionlint clean; local build produced proose_1.41.0_amd64.deb (Package: proose).
  KEY FINDING: electron-forge make must NOT get a '--' before --arch/--targets (Commander treats '--' as end-of-options -> --targets ignored -> builds all makers incl rpm -> fails). Correct: `pnpm run make --arch=x64 --targets <maker>`. Plan patched globally (af67fb7a); Tasks 2/3 use the no-'--' form.

Task 2: complete (commit af67fb7a..4d46dbb, review Approved). build-almalinux-rpm job (runs-on ubuntu-latest, container almalinux:9): dnf deps BEFORE checkout, setup-actions (rust/node24/pnpm10.30), version stamp, pnpm --dir ui install, cargo build --bin proose, stage cp, make --arch=x64 --targets maker-rpm (NO --), ELECTRON_ARCH=x64, find-glob rpm + proose-linux-x86_64-alma9, artifact proose-almalinux. actionlint clean. Docker verify: all 12 dnf pkgs installable + rust/node/pnpm/`pnpm install` OK; full cargo compile 20-40min (cold) so rpm-packaging step NOT reached locally -> deferred to first CI run. Reviewer: dnf list satisfies maker-rpm(rpmbuild)+openssl-sys, low risk. dnf: git gcc gcc-c++ make rpm-build openssl-devel pkgconfig perl which findutils tar xz gzip.

Task 3: complete (commit 4d46dbb..dd820e6, review Approved). build-windows-zip job (windows-latest): rust msvc target, node24/pnpm10.30, shell:bash version step, cargo build --target x86_64-pc-windows-msvc --bin proose, pwsh stage/collect, make --arch=x64 --targets maker-zip (NO --), ELECTRON_ARCH=x64, artifact proose-windows = zip + proose-windows-x86_64.exe. actionlint clean (reviewer re-ran). Not locally buildable on Linux sandbox -> first CI run proves.

Task 4: complete (commit dd820e6..4f671bc, review Approved — ready to merge). release job: needs all 3 build jobs, permissions contents:write (top+job), download-artifact all + flatten -> release-assets/, tag computed for tag-push AND workflow_dispatch, softprops/action-gh-release@v2 (files release-assets/*, fail_on_unmatched_files). 6-asset union verified, actionlint clean on full 4-job workflow. Minor(nonblocking): redundant prerelease:false.

== PROOSE RELEASE CI COMPLETE at 4f671bc. Ready to merge to corporate. REAL end-to-end proof still pending (needs a push): tag `proose-v*` or run workflow_dispatch -> confirm Release gets 6 assets. AlmaLinux dnf list to be confirmed by that first run.

FIRST CI RUN (run 28749383866, tag proose-v0.0.1-test): build-ubuntu-deb ✓, build-windows-zip ✓, build-almalinux-rpm ✗ (cargo build: llama-cpp-sys-2 bindgen needs libclang + llama.cpp needs cmake — absent in almalinux:9), release skipped. FIX: added `clang clang-devel cmake` to alma dnf list (validated in local docker almalinux:9: /usr/lib64/libclang.so present, cmake 3.31.8, clang 21.1.8). Re-triggering; expect all 3 green + 6-asset release.

SECOND CI RUN (run 28750943123, after clang/cmake fix 5de2338cb): ALL 4 JOBS SUCCESS — build-ubuntu-deb ✓, build-windows-zip ✓, build-almalinux-rpm ✓, release ✓. GitHub Release published exactly 6 assets (deb, rpm, windows zip + 3 CLI binaries ubuntu/alma9/windows). PIPELINE VERIFIED END-TO-END. Test release + tag proose-v0.0.1-test deleted (cleanup).
