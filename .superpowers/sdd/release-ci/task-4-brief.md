### Task 4: Release job + assemble

**Files:**
- Modify: `.github/workflows/proose-release.yml` (add the `release` job)

**Interfaces:**
- Consumes: artifacts `proose-ubuntu`, `proose-almalinux`, `proose-windows` from Tasks 1-3.
- Produces: a `release` job that publishes all six assets to a GitHub Release.

- [ ] **Step 1: Add the release job**

Append under `jobs:`:
```yaml
  release:
    needs: [build-ubuntu-deb, build-almalinux-rpm, build-windows-zip]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download all build artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist
      - name: Flatten
        run: |
          mkdir -p release-assets
          find dist -type f -exec cp {} release-assets/ \;
          ls -1 release-assets
      - name: Compute tag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "TAG=proose-v${{ github.event.inputs.version }}" >> "$GITHUB_ENV"
          else
            echo "TAG=${{ github.ref_name }}" >> "$GITHUB_ENV"
          fi
      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ env.TAG }}
          files: release-assets/*
          prerelease: false
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Lint the complete workflow**

Run: `actionlint .github/workflows/proose-release.yml`. Expected: no errors across all four jobs.

- [ ] **Step 3: Sanity-check the asset set is six files**

Read the workflow and confirm the union of uploaded files is exactly: `*.deb`, `*.rpm`, `*.zip`, `proose-linux-x86_64-ubuntu`, `proose-linux-x86_64-alma9`, `proose-windows-x86_64.exe`. Confirm `release` `needs` lists all three build jobs and `permissions: contents: write` is present (job-level and top-level).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/proose-release.yml
git commit -m "ci(proose): release job — publish 6 assets to GitHub Release"
```

---

## Final Verification (run before handoff)

- `actionlint .github/workflows/proose-release.yml` — clean.
- Task 1 Step 5 (local Ubuntu deb build) succeeded, producing `proose_*_amd64.deb` (`Package: proose`).
- Task 2 Step 3 (AlmaLinux 9 container build) succeeded if Docker was available (proose rpm produced); otherwise the `dnf` list is recorded as best-effort for the first CI run.
- **Real end-to-end proof (at handoff, needs a push):** tag a test release — `git tag proose-v0.0.1-test && git push origin proose-v0.0.1-test` — watch the Actions run, confirm the Release gets all six assets, then delete the test tag/release. Do this only with the user's go-ahead (it pushes to the fork and creates a public prerelease). Alternatively trigger via `workflow_dispatch` with `version: 0.0.1-test`.
