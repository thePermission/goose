### Task 1: Rename backend config dir + CLI binary

**Files:**
- Modify: `crates/goose/src/config/paths.rs:25`
- Modify: `crates/goose-cli/Cargo.toml:15`

**Interfaces:**
- Produces: a CLI binary named `proose` at `target/{debug,release}/proose`; the backend resolves its config dir to `~/.config/proose` on Linux (via `app_name = "proose"`). Task 2's binary-discovery + copy wiring depends on this binary name.

- [ ] **Step 1: Rename the backend app dir**

In `crates/goose/src/config/paths.rs`, inside `choose_app_strategy(AppStrategyArgs { ... })`:

```rust
// before
                app_name: "goose".to_string(),
// after
                app_name: "proose".to_string(),
```

Leave `top_level_domain: "Block"` and `author: "Block"` unchanged.

- [ ] **Step 2: Rename the CLI binary**

In `crates/goose-cli/Cargo.toml`, the first `[[bin]]` block:

```toml
# before
[[bin]]
name = "goose"
path = "src/main.rs"
# after
[[bin]]
name = "proose"
path = "src/main.rs"
```

- [ ] **Step 3: Build**

Run: `source bin/activate-hermit && cargo build -p goose-cli`
Expected: builds; binary at `./target/debug/proose` exists (`test -x ./target/debug/proose`).

- [ ] **Step 4: Verify the binary works and the app dir is `proose`**

Run:
```bash
./target/debug/proose --version
SB=$(mktemp -d)
HOME="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_DATA_HOME="$SB/.local/share" \
  ./target/debug/proose marketplace add /tmp/nonexistent --kind claude --name probe 2>&1 | head -3 || true
ls -d "$SB/.config/proose" 2>&1
rm -rf "$SB"
```
Expected: `--version` prints a version; the `marketplace add` invocation creates `$SB/.config/proose/` (the config dir now uses `proose`, proving `app_name` took effect). (`add` may print an error about the fake path — that is fine; it still writes the config dir/file.)

- [ ] **Step 5: Regression tests**

Run: `cargo test -p goose --lib`
Expected: pass (no path assertions hardcode `"goose"`; verified none exist in `paths.rs`).

- [ ] **Step 6: Commit**

```bash
git add crates/goose/src/config/paths.rs crates/goose-cli/Cargo.toml
git commit -m "feat(proose): rename backend config dir + CLI binary to proose"
```

---

