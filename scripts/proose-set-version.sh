#!/usr/bin/env bash
set -euo pipefail
ver="${1:?usage: proose-set-version.sh <version>}"
node -e 'const fs=require("fs");const p="ui/desktop/package.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));j.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$ver"
# Root Cargo.toml: only the [workspace.package] `version = "..."` line is anchored at col 0.
perl -0pi -e 's/^version = "[^"]*"/version = "'"$ver"'"/m' Cargo.toml
echo "stamped version $ver into ui/desktop/package.json + Cargo.toml"
grep -m1 '"version"' ui/desktop/package.json
grep -m1 '^version = ' Cargo.toml
