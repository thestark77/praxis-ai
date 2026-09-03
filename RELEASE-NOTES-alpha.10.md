**alpha.9 shipped a bug that every upgrading user hits.** If you installed
alpha.9, upgrade to this release before running `praxis uninstall`.

## The upgrade path stranded the whole firewall

An alpha.8 machine has the overlay installed and no ownership ledger. On
upgrade, `praxis install` found all 70 deny entries already present,
claimed none of them, and wrote a ledger saying it owned nothing. The
absent-ledger fallback never fired, because the file now existed.

```
alpha.8 box, upgraded to alpha.9
  install   -> firewall rules added: 0
               ledger claims: 0 entries
  uninstall -> firewall rules removed: 0
               rules stranded on the machine: 70
```

Every piece was individually correct; only the composition was wrong,
which is why the unit suite stayed green. It took driving real installs
against an isolated `PRAXIS_HOME` to see it.

An install that finds praxis present but no ledger to inherit now marks
the ledger as inherited, and uninstall sweeps the full list for it —
exactly what pre-ledger versions did. The mark is sticky, because a later
install cannot recover authorship the older version never wrote down. A
clean uninstall followed by a fresh install produces a precise ledger
again.

`removedFirewallEntries` also stops reporting the whole list length, and
a new `preservedFirewallEntries` makes a rule surviving uninstall read as
the deliberate decision it is rather than a leak.

Eight integration tests now drive whole installs through the clean,
coexisting and upgrade paths.

## Dependencies

- **vitest 4 → 5.** Clean install, suite unchanged, green on the whole
  matrix.
- **better-sqlite3 13 tried and rejected.** On paper it is the better
  dependency — 12 relies on the deprecated `prebuild-install` to download
  a per-Node-ABI binary during install, 13 ships Node-API prebuilds in
  the tarball with no install script. It passed locally, then a cold
  `npm ci` failed on Windows with Node 22: npm ignored the bundled
  prebuild, fell through to `node-gyp rebuild`, and died for want of
  Visual Studio. Needing a compiler on a supported configuration is the
  failure this repo has fixed once already, so 12.11.1 stays.
- **TypeScript 7 held back**, and not because of praxis: typescript-eslint
  refuses it outright (peer `>=4.8.4 <6.1.0`, upstream issue #10940).
  Typecheck, build and all 385 tests pass under TS 7 — it is purely a
  lint-toolchain block, and reopens when support ships.

## Upstream verified, not assumed

- **gentle-ai 2.4.0 → 2.5.0**: `scripts/install.sh` is byte-identical, and
  none of the 300 changed files touch praxis's integration surface.
  `full-gentleman` is still the default preset with the same nine
  components. Both commands praxis drives were dry-run against the real
  binary and plan correctly.
- **mattpocock/skills @ 6654f6b**: all five live lifted files differ
  editorially only.
- **The published package**: installed from npm into a clean sandbox and
  its hook driven the way Claude Code drives it — ten cases correct,
  native module and telemetry working with no compiler present.

385 tests, green on Linux, macOS and Windows across Node 22 and 24.
