# Task 4 Report: Release job + assemble

## Status: DONE

## Branch
`feature/proose-release-ci` (confirmed, not switched).

## What was done
Appended the `release` job to `.github/workflows/proose-release.yml`, exactly per the brief:
- `needs: [build-ubuntu-deb, build-almalinux-rpm, build-windows-zip]`
- `runs-on: ubuntu-latest`
- job-level `permissions: contents: write` (in addition to the existing top-level `permissions: contents: write`)
- Steps: `actions/download-artifact@v4` (path `dist`) → flatten via `find dist -type f -exec cp {} release-assets/ \;` → compute `TAG` (branch on `github.event_name == 'workflow_dispatch'` → `proose-v${{ github.event.inputs.version }}`, else tag push → `${{ github.ref_name }}`) → `softprops/action-gh-release@v2` with `tag_name: ${{ env.TAG }}`, `files: release-assets/*`, `prerelease: false`, `fail_on_unmatched_files: true`.

## Verification

### actionlint
```
$ actionlint .github/workflows/proose-release.yml; echo "EXIT_CODE=$?"
EXIT_CODE=0
```
Clean across all four jobs (`build-ubuntu-deb`, `build-almalinux-rpm`, `build-windows-zip`, `release`).

### Sanity checks
- `release.needs` = `[build-ubuntu-deb, build-almalinux-rpm, build-windows-zip]` — all three build jobs present. ✅
- `contents: write` present at top level (lines 11-12) and job level for `release` (lines 143-144). ✅
- Tag computed for both trigger types:
  - `workflow_dispatch` → `TAG=proose-v${{ github.event.inputs.version }}`
  - tag push → `TAG=${{ github.ref_name }}`
- Asset union across the three build jobs' upload-artifact steps (verified by reading each job's "Collect artifacts" step and artifact name):
  - `build-ubuntu-deb` (artifact `proose-ubuntu`): `*.deb` + `proose-linux-x86_64-ubuntu`
  - `build-almalinux-rpm` (artifact `proose-almalinux`): `*.rpm` + `proose-linux-x86_64-alma9`
  - `build-windows-zip` (artifact `proose-windows`): `*.zip` + `proose-windows-x86_64.exe`
  - Total: exactly 6 files, matching the required set: `*.deb`, `*.rpm`, `*.zip`, `proose-linux-x86_64-ubuntu`, `proose-linux-x86_64-alma9`, `proose-windows-x86_64.exe`. ✅
- `download-artifact@v4` with `path: dist` (no `name:` filter) downloads all artifacts from the three build jobs into `dist/<artifact-name>/...` subdirectories; the flatten step copies every file (regardless of subdir) into `release-assets/`, so all 6 files land there for the release.

## Commit
```
4f671bcd82eeb7f6f66480e49b905cbb96aee43c ci(proose): release job — publish 6 assets to GitHub Release
```
1 file changed, 29 insertions(+).

## Concerns
- None for the job definition itself. Per the brief's "Final Verification" section, the real end-to-end proof (tagging a test release e.g. `proose-v0.0.1-test`, pushing, watching the Actions run, confirming 6 assets land on the Release, then deleting the test tag/release) was **not** performed — it requires a push to the fork and creates a public prerelease, which the brief says should only be done with the user's explicit go-ahead. This was out of scope for a local, non-destructive task run.
- Not independently re-verified: Task 1 Step 5 (local Ubuntu deb build) and Task 2 Step 3 (AlmaLinux 9 container build) results — those are Tasks 1-3 concerns, reported as already done per the task description ("Tasks 1-3 (deb/rpm/zip build jobs) are done").

## Files touched
- `/home/sascha/Projects/corporategoose/goose/.github/workflows/proose-release.yml`
