# Changelog

All notable changes to praxis-ai are documented here.
This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0-alpha.18] - 2026-09-04

### Fixed - `praxis --version` reported the previous release

alpha.17 shipped announcing itself as alpha.16. The number was typed by hand
into `src/cli/index.ts` as a second copy of what package.json already knew,
and `npm version` moved one without the other. Caught by reading
`praxis --version` against what `npm ls -g` had actually installed.

The test that existed to catch exactly this carried a third copy of the
number, so it passed while asserting the stale value — it locked the bug in
rather than finding it. That is the more interesting half of the failure: a
guard that duplicates the fact it guards is not a guard.

The version now comes from package.json at build time, substituted by tsup,
and the test compares the CLI's output against package.json rather than
against a literal. Running from source with no build reports `0.0.0-dev`,
because admitting there is no version is better than printing a
plausible-looking wrong one.

## [0.1.0-alpha.17] - 2026-09-04

### Changed - a chosen default voice and pace

`FISH_AUDIO_VOICE_ID` fell back to Fish Audio's own default, a neutral
English reader. That is the wrong default for a notification: it sounds like
every other synthesised voice on the machine, and the point of speaking a
finished turn is that the listener recognises it from across the room
without looking. The fallback is now a specific, distinct voice that reads
Spanish and English equally well, and `PRAXIS_VOICE_SPEED` defaults to
`1.15` rather than `1` — a notification is heard while doing something else,
so it wants to be over quickly.

Both remain plain defaults: setting either key in a project's `.env`
overrides it exactly as before, and nothing about the two switches that gate
the feature has changed.

One consequence worth naming: praxis's defaults no longer coincide with the
API's, so the "only send what differs from the default" rule now compares
against Fish Audio's values explicitly. `prosody.speed` travels on a default
request, and a project that asks for speed `1` sends no prosody at all.

## [0.1.0-alpha.16] - 2026-09-04

### Added - speed, expressiveness and volume for the voice

praxis sent only `text`, `format` and `reference_id`, so every clip came out
at Fish Audio's defaults with no way to change the pacing. Three keys now
reach the API:

| Key | Maps to | Range |
| --- | --- | --- |
| `PRAXIS_VOICE_SPEED` | `prosody.speed` | 0.5 to 2.0 |
| `PRAXIS_VOICE_EXPRESSIVENESS` | `temperature` | 0 to 1 |
| `PRAXIS_VOICE_VOLUME` | `prosody.volume` | decibels |

They are different mechanisms, not one knob: speed is post-processed and
changes pacing without regenerating, while temperature changes the
generation itself, so raising it also makes the voice less predictable
between runs.

Values outside the documented range are clamped rather than passed through.
Fish Audio rejects a speed of 3 with a 400, and a notification that fails
because a number was one step too enthusiastic is a worse outcome than one
that speaks slightly slower than asked. Only values that differ from the
API's own defaults are sent, so a default moving upstream cannot break the
request.

## [0.1.0-alpha.15] - 2026-09-04

### Fixed - the Windows player reported success while producing silence

Caught by a user hearing nothing after `praxis voice say` printed
`status: spoken`. The worst shape of bug in a notification feature: it
claimed to have told someone something.

The first version drove the WMPlayer COM object and waited with
`while ($p.playState -eq 3)`. Measured 300ms after `play()` the state is 9
(Transitioning), never 3 (Playing), so the wait fell straight through and
`close()` killed the clip before a sound left it. Waiting *for* state 3 does
not help either: in a non-interactive session it never arrives at all, even
after ten seconds.

WPF's `MediaPlayer` replaces it, with no state machine to race - open the
file, read `NaturalDuration`, sleep exactly that long. A file whose duration
never arrives could not be decoded, and that exits non-zero so the caller
tries the next player instead of claiming to have spoken.

### Changed - CI caches node_modules

A macOS cell spent 422 of its 465 seconds inside `npm ci`, with no output for
seven minutes, against 30 seconds for every other step combined.
better-sqlite3 12 installs its binary through `prebuild-install`, which
downloads from GitHub releases at install time and bypasses the npm cache
entirely, so `cache: npm` never helped. The built tree is cached instead,
keyed on OS, architecture and Node major because it holds a compiled native
module.

Measured on a warm cache: macOS went from 310s average to 31s, the slowest
cell from 465s to 71s, and `npm ci` to zero. macOS is now the fastest of the
three platforms rather than 2.2x the slowest. The tests were never the cost -
they ran in 9 seconds throughout.

### Fixed - a flaky WSL discovery test

Its fake returned `\wsl.localhost\...` paths, and discovery stats each home
to report whether Claude is installed there. Windows treats that as a real
share and starts the distribution: one run took five seconds and failed. The
fake returns local temp paths now.


### Added - optional spoken notifications through Fish Audio

praxis can read a finished turn aloud, so a long build can be started and
walked away from. A `Stop` hook speaks the last thing Claude said; `Stop` is
the event that matches the purpose, where `Notification` would talk over a
permission prompt and `PostToolUse` would be unbearable.

**Off unless a project asks for it.** Two independent switches, both in the
project's own `.env`: `PRAXIS_VOICE_ENABLED=true` and `FISH_AUDIO_API_KEY`.
Either one missing makes the whole feature inert - no network call, no audio,
no error, no cost. A harness whose job is containing irreversible actions has
no business making surprise outbound requests because a stray environment
variable leaked in, and nobody wants a machine that starts talking after an
unrelated upgrade. For the same reason a project `.env` saying `false` beats
an ambient variable saying `true`.

The client is written against Fish Audio's published OpenAPI schema rather
than guessed: `POST https://api.fish.audio/v1/tts`, bearer auth, the model in
a header, `text`/`reference_id`/`format` in the body. Each documented failure
is surfaced as itself - 401 is a bad key, 402 an empty wallet, 503 their load
- because "voice failed" tells nobody whether to check their key or their
balance.

Playback uses what the machine already has (`afplay`, PowerShell,
`ffplay`/`mpv`/`paplay`/`aplay`) instead of adding a native audio dependency
most installs would never use. The hook exits 0 and prints nothing whatever
happens: a missing speaker is a disappointment, a broken session is a fault.

A long answer is summarised before it is spoken, not truncated. Blind
truncation was the first version and it was wrong: a written answer puts the
detail in the middle, so cutting at a character count reliably spoke the
throat-clearing and threw away the result. Code blocks, tables, URLs and
absolute paths are removed first, then the remaining sentences are ranked and
re-emitted in their original order.

Three of the rules came from listening to the output rather than from
reasoning about it, which is the only way they would have been found:

- A sentence that says "minor details that do not change the result" is
  telling the listener to skip it, and the first real summary kept exactly
  that while dropping what had been done.
- A question is reserved before anything competes for the budget. Ranking
  alone let a long high-scoring sentence starve "shall I publish?", and that
  is the one thing a listener who walked away cannot afford to miss.
- Removing a path or a URL out of the middle of a sentence leaves a
  grammatical stump — "escribí el módulo en y lo conecté" — that a listener
  hears as a mistake, so the stranded function word is collapsed.

`praxis voice status | scaffold | install | say | uninstall`. `say` prints
what will actually be spoken alongside the input length, which is how
`PRAXIS_VOICE_MAX_CHARS` gets tuned. 65 tests.

## [0.1.0-alpha.14] - 2026-09-03

### Fixed

The Remote Control override scan skips the OS temp directory. On a real
machine it printed ten "repositories that disable Remote Control", every
one a `.claude` fixture left in temp by a test suite, burying the finding
the scan exists to surface.

## [0.1.0-alpha.13] - unreleased, superseded by alpha.14

### Added - `praxis remote-control`

Turns Claude Code's Remote Control on for every session, in every
environment on the machine. Writing `remoteControlAtStartup` by hand is
one line; making it hold for *every* session is not, and that gap is what
the command closes. Three facts, all read out of the Claude Code binary
rather than assumed:

- **A repo can switch it off and win.** Resolution returns
  `{value: false, source: "project_or_local_false"}` the moment a project
  or local settings file says `false`, before user settings are consulted.
  A repo cannot switch it *on*: the binary logs "repo-scoped settings
  cannot enable Remote Control" and ignores it. So the only way a
  machine-wide "on" quietly fails is a repo saying `false`, and Claude
  Code surfaces that only in a debug log. `enable` scans for those and
  reports them; without that the command would promise a guarantee the
  machine does not keep.
- **One machine holds several Claude installations.** Each WSL
  distribution has its own home, binary and settings.json. Discovery walks
  the host home plus every registered distro, translating each POSIX home
  through `wslpath`. A distro with no Claude yet is still written, so a
  later install starts with the setting on.
- **It is a security-sensitive setting**, and an organization policy can
  pin it. Where policy has pinned it, writing user settings changes
  nothing and says nothing, so the command says so rather than claiming a
  success it cannot verify.

Deliberately not wired into `praxis install`: Remote Control opens a
bridge that lets another device drive the session, and a tool whose
purpose is containing irreversible actions should not switch on remote
access as a side effect of being installed. `status` is the default and
changes nothing.

### Fixed - the hook ran whatever PATH found, not its own engine

Updating a real machine surfaced it. WSL had praxis alpha.12 installed
natively, yet its firewall was running the Windows alpha.8 engine.

`resolveAstHookCommand` returned the bare name `praxis-ast-hook` for npm
installs, which is a bet on PATH resolving to *this* praxis. Inside WSL it
does not: Windows puts its npm global directory on the Linux PATH through
/mnt/c and its shims come first. A WSL install therefore wrote
`praxis-ast-hook` and every WSL session ran a Windows binary - a different
build, possibly a different version, which disappears the moment the
Windows install is removed, taking layer 2 with it and saying nothing.

It resolves module-relative to this package's own bin now, falling back to
the bare name only when even that cannot be found.

## [0.1.0-alpha.12] - unreleased, superseded by alpha.13

### Fixed - the firewall's own verification could not be trusted

Three faults found by running `praxis doctor --verify` against a real
installation instead of a fixture.

**`--verify` never ran on a partial install.** The verify block sat below
an early `process.exit(0)` on the not-fully-installed path, so the
command printed one warning and exited 0 having executed nothing. A stale
OpenCode rule count was enough to skip the Claude Code check too. A
partially upgraded machine is exactly where "does layer 2 actually
block?" has a non-obvious answer, and reporting success without running
the check is the one outcome a verification command must never produce.
Verify now runs before the health verdict, which is printed after.

**The verifier could not parse a quoted command.** It split the hook
command on whitespace, which keeps the quote characters inside the token,
so `node "C:/path/ast-hook.js"` exec'd node against a filename beginning
with a double quote. node failed, stdout came back empty, and verify
reported `Hook stdout was not JSON` - blaming the hook for a fault in the
checker.

**The hook command praxis writes was unquoted.** Claude Code runs it
through a shell, so any path containing a space was split into separate
arguments and node reported `Cannot find module 'C:\Users\First'`. The
hook then emitted no decision, Claude Code had nothing to act on, and the
command proceeded: layer 2 off with nothing saying so. A space in the
home directory is ordinary on Windows, which is where this shipped
untested. Quoting the path is also why the parser fix had to land in the
same change - it makes every verify hit the parser bug.

The synthetic verify payload now puts the danger on a second line, so it
fails against any engine predating the newline-separator fix. It is a
floor rather than a freshness test: an engine that handles newlines but
predates a later fix still passes.

## [0.1.0-alpha.11] - unreleased, superseded by alpha.12

### Fixed - `engines` promised a Node version that needs a compiler

`engines` admitted `>=22.13.0` while CI ran only 22 and 24, so two
admitted majors shipped untested. Mapping the real Node ABI table against
better-sqlite3's published prebuilds shows the range was wrong in the
other direction too:

| Node | ABI | prebuild |
| --- | --- | --- |
| 22 (LTS) | 127 | yes |
| **23** | **131** | **none** |
| 24 (LTS) | 137 | yes |
| 25 | 141 | yes |
| 26 (current) | 147 | yes |

Node 23 has no prebuilt binary, so installing praxis there falls through
to `node-gyp` and needs a C++ toolchain - the same failure that killed
the better-sqlite3 13 attempt, except this one was promised by our own
metadata. Node 23 is also out of support.

`engines` becomes `^22.13.0 || >=24.0.0`, which is what actually installs
without a compiler. The CI matrix gains 26, so the current Node release
is proven rather than assumed: 18 cells, all green. 25 stays out of the
matrix because vitest 5 does not run there, but it keeps its prebuild and
stays admitted.

### Added

`.env.example`. Nothing in it is required to build or test praxis. The
entry that earns its place is `PRAXIS_HOME`, which points `install` and
`uninstall` at a scratch directory instead of a real configuration.

## [0.1.0-alpha.10] - 2026-09-03

### Fixed — an upgrade from a pre-ledger version could never uninstall

Shipped in alpha.9 and found by driving real installs rather than the
units underneath them.

An alpha.8 machine has the overlay installed and no ownership ledger. On
upgrade, `praxis install` runs again, finds all 70 deny entries already
present, claims none of them, and writes a ledger saying it owns nothing.
The absent-ledger fallback never fires, because the file now exists. The
following `praxis uninstall` removed 0 rules and reported 70 preserved,
leaving a firewall with no supported way to take it off. Every user
upgrading from alpha.8 hits this.

An install that finds praxis present but no ledger to inherit now marks
the ledger as inherited, and uninstall sweeps the full list for it -
exactly what the pre-ledger versions did. The mark is sticky, because a
later install cannot recover authorship the older version never wrote
down. A clean uninstall followed by a fresh install produces a precise
ledger again.

`removedFirewallEntries` also stops reporting the whole list length and
reports what was really removed, alongside a new
`preservedFirewallEntries` count so a rule surviving uninstall reads as a
decision rather than a leak.

Eight integration tests now drive whole installs through the clean,
coexisting and upgrade paths.

### Changed — dependency majors, taken after checking each one

- **vitest 4 to 5.** Installs clean and the suite passes unchanged.
- **better-sqlite3 13 tried and rejected.** On paper it is the better
  dependency: 12 relies on the deprecated `prebuild-install` to download
  a per-Node-ABI binary from GitHub during install, while 13 ships eight
  Node-API prebuilds inside the tarball with no install script at all.
  It installed cleanly here, loaded its native module, and passed the
  whole suite. A cold `npm ci` on the CI matrix then failed on Windows
  with Node 22: npm ignored the bundled prebuild, fell through to
  `node-gyp rebuild`, and died for want of Visual Studio. Windows with
  Node 24 passed, so it is not a platform gap but a Node-version-specific
  one, squarely inside the range praxis supports. Needing a compiler on a
  supported configuration is the exact failure this repo has fixed once
  before, so 12.11.1 stays until 13 installs from its own prebuilds
  across the matrix. A warm local tree is not evidence about a clean
  install; only the matrix is.
- **TypeScript 7 deliberately not taken.** typescript-eslint refuses it
  outright (`typescript-eslint does not support TS 7.0`; its peer range
  is `>=4.8.4 <6.1.0`, tracked upstream as typescript-eslint#10940 for TS
  >=7.1). `tsc --noEmit`, the build and the whole suite pass under TS 7,
  so this is a lint-toolchain block and nothing more; it reopens when
  typescript-eslint ships support.

The remaining low-severity esbuild advisory is not reachable here. It
concerns esbuild's development server; esbuild arrives only through tsup
and vite, and praxis runs neither as a server.

### Verified against the upstream sources

- **gentle-ai.** `scripts/install.sh` is byte-identical between 2.4.0 and
  2.5.0, and none of the 300 files that changed touch praxis's
  integration surface. `full-gentleman` is still the default preset with
  the same nine components. Both commands praxis drives were dry-run
  against the real binary and plan correctly.
- **mattpocock/skills.** At `6654f6b` all five live lifted files differ
  editorially only.
- **The published package.** alpha.9 was installed from npm into a clean
  sandbox and its hook binary driven the way Claude Code drives it: ten
  cases, all correct, native module and telemetry working without a
  compiler.

## [0.1.0-alpha.9] - 2026-09-03

### Fixed — the AST hook could be walked past with a newline

Replaying the deny spool of a live install turned up two structural gaps
in the tokeniser, pulling in opposite directions.

A newline never separated commands. Only `;`, `&&`, `||`, `|` and `&`
did, so a multi-line Bash call was read as a single command, the rules
were matched against its first word, and every later line went
unexamined. `echo hi` followed by a recursive delete on the next line was
allowed. Claude Code sends multi-line commands routinely, so layer 2 was
open by default.

Heredoc bodies were tokenised as commands. That denied commit messages
that merely named a bypass flag — two such denials sit in the spool, and
one of them blocked the command that wrote the test fixture for this
change — while allowing a shell heredoc whose body performed a recursive
delete, because the opening word was `bash` and the body was never
reached.

Both are fixed together, because fixing either alone makes the other
worse. Bodies are now lifted out before tokenising and handed back tagged
with whether a shell consumes them: `bash`, `sh`, `eval` and `ssh` get
their bodies inspected, while `git commit -F -`, `python -` and
`cat > file` receive data. Herestrings are left alone and an escaped
newline stays a line continuation. 26 regression tests; latency unchanged
for ordinary commands and under 2 ms for a 200-line script.

### Fixed — uninstall could leave a machine less protected than it found it

The firewall list is a set of desired rules, not a record of authorship,
and uninstall treated it as both: it removed every entry currently denied,
whoever had written it. Where gentle-ai, a team settings file, or the user
had independently denied the same thing, `praxis uninstall` deleted their
protection. The bundled OpenCode fixture already showed the collision —
gentle-ai ships a `.env` deny.

Install now records what it actually wrote to
`~/.praxis/owned-permissions.json`, and uninstall gives back only that. A
box with no praxis footprint at all has its permission block left
untouched. Where a footprint exists but no ledger does, the old sweep
still runs, because a half-installed firewall is worse than over-removal;
one reinstall makes the machine precise. `firewallEntriesAdded` also stops
reporting the whole list length and reports what was really added.

### Added — firewall coverage for classes it never saw

- `.env` and its environment-specific siblings, plus home-anchored SSH,
  AWS and gcloud credentials. `Read(.ssh/id_*)` anchors at the working
  directory, so it never covered the keys that actually matter. The
  suffixes are enumerated rather than globbed: `Read(.env.*)` also matches
  `.env.example`, and a deny rule cannot carry an allowlist exception, so
  the glob had no way to spare the file that documents a project's
  variables.
- Infrastructure teardown: `terraform destroy`, `apply -auto-approve`,
  bucket removal, and migration reset.
- MCP tools that destroy remote state. Both firewall layers only ever saw
  Bash; a server can delete a repository or drop a database in one call,
  and neither the globs nor the AST hook were consulted. Only irreversible
  operations are listed — moving something to a trash bin is recoverable
  and left out — and entries stay parenthesis-free, because Claude Code
  silently skips any `mcp__` rule containing parentheses.

### Changed — `sync-pocock` records a per-file review

Upstream moved to `6654f6b` and all five live lifted files reported as
drifted. Every diff is editorial: an em-dash sweep across the repo and a
restatement of skill invocation in Skill-tool terms. The manifest had no
way to say "read, still faithful" per file, so those reviews were either
redone every run or hidden by bumping the lift SHA, which would make
NOTICE.md attribute a revision the file was never lifted from.

Files now carry an optional `reviewedBlobSha` and a note. The lift SHA
still drives attribution; the reviewed SHA drives the report. The drift
report reads 0 changed, 8 settled. Upstream's move to a Claude Code plugin
is recorded too: it does not change what praxis lifts, and the plugin can
be installed alongside.

### Added — OpenCode support (`--agent`)

praxis is no longer Claude-Code-only. `install`, `uninstall` and `doctor`
take `--agent auto | both | claude-code | opencode`; `auto` (the default)
targets every harness initialised on the machine, so a dual-harness box is
covered by the same single command and a Claude-Code-only box behaves
exactly as before.

The overlay is the same design expressed in OpenCode's vocabulary:

- **Layer 1** — the firewall deny list is translated into the native
  `permission` block of `opencode.json` (`bash` / `read` / `edit` maps of
  glob → `deny`). `FIREWALL_DEFAULTS` stays the single source: the
  translation lives in `src/lib/opencode/permissions.ts`, so a new rule is
  still written once.
- **Layer 2** — `~/.config/opencode/plugins/praxis-firewall.ts`, generated
  at install time, hooks `tool.execute.before` and throws to block. It
  **imports** the built engine (`dist/firewall.js`, a new side-effect-free
  bundle entry) rather than forking the rules — one AST rule set for both
  harnesses.
- **Layer 3** — `instructions[]` points at `~/.praxis/main.md`, OpenCode's
  analogue of the CLAUDE.md `@-import`: the overlay content stays in
  `~/.praxis/`, so `praxis update` never has to re-patch the config.
- The six lifted skills are installed into `~/.config/opencode/skills/`.

Merging, not overwriting: `opencode.json` is shared with gentle-ai (agents,
MCP servers, its own permission entries) and all of it survives install and
uninstall. A praxis pattern found at a weaker `ask` is raised to `deny` and
reported in the install output. `opencode.json` is now backed up with
`CLAUDE.md` and `settings.json`, so `praxis rollback` restores the
pre-praxis config byte for byte.

`praxis doctor --agent opencode --verify` loads the engine module the
emitted plugin imports and asserts a synthetic `rm -rf` is denied — a
plugin whose import target has gone missing loads as a silent no-op inside
OpenCode, so the check executes it instead of trusting the file's presence.

Verified against a real OpenCode 1.18.16 session driven by a local
OpenAI-compatible stub: layer 1 denies `rm -rf <dir>` through OpenCode's
own permission engine, layer 2 blocks `echo hi && rm -rf <dir>` (the chained
form layer 1's globs cannot match) with the target directory intact, and an
ordinary command still runs. 69 new tests (325 total).

### Changed — re-lifted `prototype` and `handoff` from upstream

The four files `praxis sync-pocock` had been reporting as drifted are
re-lifted, so the drift report is back to 0 changed / 0 removed.

- **prototype** — the LOGIC branch is no longer a terminal app. It is now a
  single self-contained HTML demo: free-play buttons plus tabbed guided
  walkthroughs, so a non-developer can drive the state model. The purity
  boundary is unchanged, only restated ("no terminal code in the module"
  becomes "no DOM in the module"), and the run rule widens from "one
  command" to "trivial to run" because the two branches now start
  differently. Both branches now treat the prototype as a **primary
  source**: the validated decision is absorbed, the prototype itself goes
  to a throwaway branch with a pointer from the implementation issue,
  rather than being deleted.
- **handoff** — "PRDs" becomes "specs" in the do-not-duplicate list, and
  upstream's `disable-model-invocation: true` is adopted.

`PocockSkill` gained an optional `repoCommit`. Skills are re-lifted one at
a time, so a single global commit SHA would have to either lie about the
skills that were not re-lifted or block the ones that were.

### Fixed — explicit skills now refuse auto-invocation natively

The four `invocation: explicit` skills (`grill-with-docs`, `handoff`,
`prototype`, `zoom-out`) also declare Claude Code's
`disable-model-invocation: true`. An earlier lift had dropped that field
on the grounds that praxis's own `invocation:` vocabulary said the same
thing — but `invocation: explicit` is only enforced by overlay prose,
while `disable-model-invocation` is enforced by the harness ("prevent
Claude from automatically loading this skill"). A phase-marking skill must
not depend on the model choosing to obey. Both are kept: the native key
enforces, the praxis field keeps the policy readable across harnesses, and
a test now asserts the pairing.

### Fixed — praxis-ai is installable again on machines without a C++ toolchain

`better-sqlite3` is back on `^12.11.1`. The 13.x line publishes **no**
prebuilt binaries (0 release assets, versus 138 for 12.11.1), so `npm i -g
praxis-ai` fell back to `node-gyp rebuild` and failed on any machine
without Visual Studio Build Tools or Xcode CLT — that is, on most of the
Windows users an install tool exists to serve. Reproduced locally: a clean
`npm ci` on Windows/Node 22 aborts at `Could not find any Visual Studio
installation to use`; with 12.11.1 it downloads the prebuild and succeeds.

### Added — `praxis update` command
Updates the external pieces praxis depends on, modularly, **without
touching the rest of the praxis overlay** (CLAUDE.md block, firewall,
AST hook, telemetry, `~/.praxis/` skeleton are untouched).

- **gentle-ai** — updated via gentle-ai's own config-preserving
  primitives: `gentle-ai upgrade` (binary self-update; brew installs
  get a `brew upgrade` note) + `gentle-ai sync` (re-applies all
  components incl. **engram** for installed agents, from persisted
  state, so persona / preset / model assignments are preserved). Strict
  TDD is preserved by reading the current state and passing
  `--strict-tdd` only when it is already enabled. Skipped with guidance
  if gentle-ai is not installed.
- **skills** — the six lifted mattpocock skills are refreshed from the
  praxis-ai repo (the canonical source of the lifted, mechanism-pure
  artifacts). Only the six praxis-managed skill dirs are overwritten;
  any other skill in `~/.claude/skills/` is left alone. "Latest" means
  the latest re-lift on praxis-ai `main`, so a mattpocock change reaches
  users as soon as we re-lift + push — no npm release required.
- Modular flags: `praxis update --gentle-ai`, `praxis update --skills`.
  No flag = update both.
- New module `src/lib/update.ts` + 11 tests (mocked runner + fetcher).

### Changed — handoff skill re-lifted from upstream
mattpocock updated the `handoff` skill. Re-lifted mechanism-pure: saves
to the OS temp directory (not the workspace), adds an explicit
redaction step (no API keys / passwords / tokens / PII in the handoff),
and frames suggested skills as a dedicated section. Manifest blob SHA
and repo commit refreshed in `src/data/pocock-skills.ts`; all eight
lifted files are back in sync with upstream (`praxis sync-pocock` →
in-sync 8, changed 0).

### Fixed — `npx praxis-ai@latest install` (could not determine executable to run)
The package exposes two bins (`praxis`, `praxis-ast-hook`), neither
matching the package name. npx's `getBinFromManifest` refuses to run a
multi-bin package when no bin matches the package name, so the
README's primary command `npx praxis-ai@latest install` failed with
`could not determine executable to run` on any machine without a prior
global install. (Global `npm install -g` was unaffected, which is why
it went unnoticed.)

Fix: added a `praxis-ai` bin alias pointing to the same shim as
`praxis`. `npx praxis-ai@latest install` now resolves. A regression
test asserts the package always exposes a bin matching its name.

### Added — Plug-and-play gentle-ai bootstrap (`praxis install`)
`praxis install` no longer just *detects* gentle-ai — it installs and
configures the whole stack from gentle-ai's source of truth, then layers
the praxis overlay. Opt-out with `--no-gentle-ai`.

- `src/lib/gentle-ai-bootstrap.ts` drives, in order:
  1. gentle-ai `scripts/install.sh` (fetched at runtime, executed, discarded — never vendored). Skipped when the binary is present, unless `--force`.
  2. `gentle-ai install --agents claude-code --persona neutral --preset full-gentleman` (9 components incl. engram; balanced models by default).
  3. `gentle-ai sync --agents claude-code --strict-tdd` (Strict TDD; `install` does not expose it, `sync` does).
- Respects an existing gentle-ai config (skips bootstrap unless `--force`). Idempotent — doubles as an updater.
- Non-fatal: bootstrap failures become warnings; the praxis overlay still installs.
- New CLI flags: `--no-gentle-ai`, `--force`, `--ga-persona`, `--ga-preset`, `--ga-agents`, `--no-strict-tdd`.
- Library `runInstall` defaults `bootstrapGentleAi` to false (test hermeticity); the CLI flips it true.

### Added — Dependency preflight
`src/lib/dependency-check.ts` verifies `git`, `curl`, `bash`, `node`, `npm`
before any install side-effect when the gentle-ai bootstrap will run (Go is
optional). If a required tool is missing, `praxis install` **aborts** with
the exact tools and their install links/commands — no half-finished state.
`--no-gentle-ai` only requires `node` + `npm`. Documented in
[docs/dependencies.md](docs/dependencies.md).

### Documentation refresh
- `docs/dependencies.md` (new) — required/optional deps, who installs what, error example.
- `docs/coexistence-with-gentle-ai.md` — plug-and-play bootstrap, applied config table, respecting existing config, failure handling.
- `docs/architecture.md` — install orchestration phases + new modules.
- README — plug-and-play install flow, full sequence, install flags, adaptive modes.

### Tests
- 15 new tests: `gentle-ai-bootstrap` (mocked runner: ordering, skip-when-configured, force, overrides, graceful failure) and `dependency-check` (required/optional gating, abort message). Total 238/238 passing. CLI install test pinned to `--no-gentle-ai` for hermeticity.

### Added — Tier 4 end-to-end test runner
- `tests/scenarios/tier4/` with five Tier 4 scenarios that spawn a real `claude --print` subprocess in a fresh sandbox HOME with `praxis install` applied. Auth is seeded from the real HOME (`.credentials.json` + `.claude.json` only). Scenarios cover TRIVIAL classifier, NON-TRIVIAL classifier, firewall intercept of a real LLM-driven Bash call, skill discovery from a clean install, and `praxis doctor --verify` smoke from a fresh session.
- New runner script `tests/scenarios/tier4/run.sh` + `npm run test:tier4` opt-in. Defaults to Haiku 4.5 (~$0.05–0.10 per full run) but overridable via `PRAXIS_TIER4_MODEL`.
- First Tier 4 run (alpha.4 dogfood): **5 / 5 PASS**. Documented in `tests/scenarios/tier4/results-2026-05-19.md`.

### Added — L1 mirrors M3.10 rules
Three new entries in `FIREWALL_DEFAULTS` matching the L2 AST rules
added in M3.10: history-rewrite (`git update-ref refs/heads/*`,
`git update-ref refs/tags/*`, `git filter-branch*`) and package-manager
lockfile bypass (`npm install --force*`, `npm i -f *`, `pnpm install
--force*`, `yarn add --force*`).

Defence in depth: L2 catches these via the AST hook; L1 is the fallback
if the hook crashes or fails open.

### Added — Hook latency benchmark + CI integration
- `scripts/bench-hook.sh` times the praxis-ast-hook over N invocations across cold-allow, warm-allow, deny-with-telemetry, and deny-without-telemetry paths. Machine-readable `BENCH:<...>` lines per measurement.
- `npm run bench:hook` for local runs.
- CI now runs the bench on every matrix cell (ubuntu-latest + macos-latest × Node 18 / 20 / 22), so cross-platform numbers ship on every push without manual runs.

### Added — M3.10 — three new AST rules
Extends the L2 rule set from 14 to 17:

- `git-update-ref` (history-rewrite): `git update-ref refs/heads/*` or `refs/tags/*` bypasses the porcelain layer.
- `git-filter-branch` (history-rewrite): bulk history rewrite across every commit on every touched ref.
- `npm-install-force` (exec-bypass): `npm install --force`, `npm i -f`, `pnpm install --force`, `yarn add --force`. Skips peer-dependency conflict resolution and writes a misleading lockfile.

14 new tests across the three rules. Total 223/223 passing.

### Fixed — M3.9 — `praxis uninstall` stdout reflects actual filesystem state
`runUninstall` now returns `praxisDirFullyRemoved` (boolean) which the
CLI uses to print one of three accurate messages:

- `~/.praxis/ removed: true (no user data was present)`
- `~/.praxis/ install artefacts removed; backups preserved for `praxis rollback``
- `~/.praxis/ left in place (--keep-skeleton)`

The rollback Tip is suppressed when no backups remain. Replaces the
misleading "~/.praxis/ removed: true" that surfaced in alpha.3 even
when backups survived. Cosmetic-only; functional behaviour unchanged.

### Fixed — M3.8 — `praxis uninstall` preserves `~/.praxis/backups/`
Caught by scenario T14 (install / uninstall / rollback round-trip).

The previous `uninstall` wiped the whole praxis directory, including
`backups/`. That orphaned `praxis rollback` — its only data source was
the directory uninstall had just deleted.

`uninstallSkeleton` now walks the praxis dir and skips a preserve set
(`backups`, `telemetry.db`). When nothing user-owned remains, the dir
is removed entirely so the empty-case behaviour is unchanged. P2
(minimal footprint, reversibility) is restored for the install
lifecycle.

### Fixed — M3.8 — Rules tokens helper is quote-aware
Token-based rules (`rm-recursive-force`, `no-verify`, etc.) split on
whitespace without honouring quotes, so `git commit -m "..."` with
the dangerous keywords inside the body produced those keywords as
separate tokens and the rules tripped on the commit message itself.

`stripQuoted` is now applied before whitespace tokenisation.
Regression tests added for `rm`-pattern and `--no-verify` mentions
inside `git commit -m "..."` bodies.

### Added — End-to-end test scenarios
- `tests/scenarios/` directory with 14 scenarios (T1–T14): firewall L1, AST chain bypass, substitution body, git force-push, --no-verify, encoded-execution, allow path, telemetry deny_hit, skill discovery, doctor --verify, F0 TRIVIAL classifier, F0 NON-TRIVIAL classifier, context-usage threshold, install/uninstall/rollback round-trip.
- `tests/scenarios/results-2026-05-19.md` — aggregate first-run + alpha.3 re-run. 13/14 PASS, 1 ANOMALY (T1 spec-order correction applied), 0 FAIL.
- `docs/firewall.md` corrected: for Bash tool calls the AST PreToolUse hook fires before the permission check; the regex deny list is the fallback. Both layers remain active.

### Added — M3.7 + polish

#### M3.7 — encoded-execution rule tightened
Same false-positive pattern as the curl-pipe-shell fix in M3.6: the
encoded-execution rule required only that `base64`/`xxd`/`openssl` AND
a shell keyword appear anywhere in the command, which triggered on
prose mentions in commit messages and docstrings.

The rule now requires:
- a decoder piped into a shell (`base64 ... | bash`), OR
- `eval`/`exec` of a `$(...)` body containing the decoder, OR
- hex-encoded printf piped into a shell.

Regression test: a commit message body discussing the pattern verbatim no
longer triggers the hook.

#### `praxis doctor --verify`
New flag spawns the registered AST hook with a synthetic `rm -rf`
payload and asserts deny. Useful smoke test after install. Output
includes the resolved hook command for debugging.

#### Hook perf audit
Documented in `docs/firewall.md`:
| Path | Latency |
|---|---|
| Allow (cold) | ~41 ms |
| Allow (warm) | ~43 ms |
| Deny + telemetry | ~60 ms |
| Deny, telemetry disabled | ~39 ms |

Dominant cost is Node startup; rule evaluation is sub-ms. The deny
path adds ~17 ms for the SQLite open+insert+close. `PRAXIS_TELEMETRY_DISABLED=1`
skips the DB write for very hot loops.

#### README polish
Install command is now `npx praxis-ai@latest install`. The local-checkout
path is preserved as a "development install" section.

### Added — M3.6 AST rule coverage extension
- Five new AST PreToolUse rules to close documented coverage gaps:
  - `chmod-recursive-permissive` — `chmod -R 777`, `-R 666`, `-R a+w`, etc. Catches world-writable trees that are hard to walk back without an audit.
  - `chown-recursive` — `chown -R user /`, `/usr`, `/etc`, `/var`. Catches catastrophic ownership flips of system trees.
  - `tar-absolute-names` — `tar -x --absolute-names` or `tar -xPf` (extract with `-P`). Catches path-traversal extraction.
  - `curl-pipe-shell` — `curl | sh`, `wget | bash`, etc. RCE pattern over the network.
  - `pip-install-target-root` — `pip install --target /` / `/usr` / `/etc`. Overwrites system files.
- Total rules now 14 (was 9). All rules ship with a reversibility class surfaced in the deny reason.
- 21 new tests covering pass + fail per rule. Total 203/203 passing (was 182).

### Added — M3.5 Hook ↔ Telemetry tie-in
- `praxis-ast-hook` now writes a `deny_hit` event to `~/.praxis/telemetry.db` for every rule that fires on a denied command. One row per hit (so a chained command that trips multiple rules produces multiple rows). The deny decision is emitted FIRST; telemetry is best-effort after — failure to open or write the DB does not turn a deny into an allow.
- Honours `PRAXIS_TELEMETRY_DISABLED=1` to suppress writes (useful for tests).
- `praxis stats` will now show deny-hit counts populated automatically when the hook fires (was zero pending this tie-in).

### Changed — Hook command resolution
- `praxis install` now resolves the AST hook command to an absolute `node <abs path>` when invoked from a local checkout (sibling `praxis-ast-hook.js` exists next to `process.argv[1]`). When invoked from an npm install, the bare `praxis-ast-hook` PATH lookup is preserved. This fixes a regression where the dogfood install registered a non-resolvable bare name.

### Added — M5 Docs + version bump
- README rewritten for alpha state: real install instructions, CLI surface listing, "how it works" overview, status badges.
- `docs/philosophy.md` — long-form rationale for the 8 operating principles.
- `docs/architecture.md` — install layout, CLAUDE.md block model, settings.json modifications, module map, tsup build, anti-claims.
- `docs/firewall.md` — two-layer firewall model: regex deny list + AST PreToolUse hook. Per-rule table with reversibility classes.
- `docs/coexistence-with-gentle-ai.md` — domain ownership, precedence rules, detection logic, what praxis touches and does not.
- `docs/references.md` — bibliography of frontier-lab, academic, and practitioner work that shaped the design.
- Version bumped 0.1.0-alpha.0 → 0.1.0-alpha.1 (pending npm publish; package still has `"private": true`).

### Added — M3 AST PreToolUse Hook
- `praxis-ast-hook` binary — second line of defence against creative bypasses the regex deny list silently misses. Reads Claude Code PreToolUse JSON via stdin, inspects Bash commands, emits a `permissionDecision` JSON on stdout.
- Custom dependency-light bash tokeniser (`src/lib/ast/tokeniser.ts`) splits on `;`, `&&`, `||`, `|`, `&` while respecting quote and substitution contexts. `$(...)` and backtick bodies are also extracted and rule-checked.
- Rules: `rm-recursive-force`, `find-delete`, `git-force-push` (incl. `--force-with-lease`), `git-reset-hard`, `no-verify` / `no-gpg-sign`, `sudo-escalation`, `encoded-execution` (base64/xxd/openssl/printf-hex piped into sh/bash/eval), `dd-block-device`, `mkfs`. Each rule maps to a reversibility class (history-rewrite, data-loss, exec-bypass, etc.) the user sees in the deny reason.
- Hook is auto-registered on `praxis install` via a new `hooks.PreToolUse` block in settings.json with a `#praxis-ast-hook#` marker. Idempotent; existing user hooks preserved. Removed on `praxis uninstall`.
- 41 new tests (tokeniser 12, rules+inspect 22, settings-patcher hook 7, hook binary 6 — all sandboxed). Total 178/178 passing.
- New package bin: `praxis-ast-hook` (in addition to `praxis`). tsup config produces two entries.

### Added — M4 Telemetry Foundation
- SQLite telemetry at `~/.praxis/telemetry.db` via `better-sqlite3`. Single events table with typed JSON payload (`session_start`, `session_end`, `phase_transition`, `tool_invocation`, `deny_hit`, `context_sample`). WAL mode, schema_version stamping, idempotent migrations.
- `src/lib/telemetry/` module: `schema.ts` (DDL + event kinds), `db.ts` (lazy open + migration), `events.ts` (typed record helpers), `queries.ts` (`statsSummary`, `latestContextSample`, `resetEvents`).
- `praxis stats` — real implementation. Reports total events, sessions, tool invocations grouped by outcome, deny hits, phase transitions, context samples, time bounds. `--json` for machine-readable output. `--reset` to truncate events.
- `praxis context-usage` — real implementation. `--record <used> --budget <budget>` to append a sample, default reads latest sample and warns when usage crosses the balanced-preset 75% threshold. `--json` for machine-readable output.
- 17 new tests (4 db, 7 events, 6 queries + 5 CLI smoke for telemetry + reset), all sandboxed via `mkdtemp`. Total 130/130 tests passing.

### Added — M2 Skill Lifts
- Lifted six skills from `mattpocock/skills` with mechanism-pure body rewrite, per-file blob SHA pin, and per-skill `NOTICE.md`: `grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`, `handoff`. Each skill ships with praxis-specific `invocation:` frontmatter (`explicit` for phase-marking skills; `reflex` with objective triggers for `caveman` and `diagnose`).
- `praxis sync-pocock` command — checks per-file blob SHAs against an upstream ref, reports drift, exits non-zero when any lifted file has changed upstream. Does not auto-rewrite (mechanism-pure rewrites require human review).
- `installClaudeSkills` / `uninstallClaudeSkills` in the skeleton installer, plus a new `claudeSkillsDir` path resolution to `~/.claude/skills/`. Wired into `praxis install` / `praxis uninstall` (with `--keep-skills` opt-out). Idempotent and `HOME`-sandbox-safe.
- 22 new tests across `pocock-sync`, `lifted-skills`, `skeleton-installer` (claude-skills branch), and CLI smoke tests. All exercise `mkdtemp + HOME` sandbox; no test touches the real `~/.claude`.

### Added — M0 Foundation
- TypeScript Node CLI scaffolding with commander.js.
- Build toolchain: tsup, tsc, vitest, eslint, prettier.
- GitHub Actions CI workflow (typecheck, build, test on Node 18/20/22).
- Seven CLI command stubs: `install`, `uninstall`, `upgrade`, `doctor`, `rollback`, `stats`, `context-usage`.
- MIT LICENSE and NOTICE with attribution to gentle-ai, mattpocock/skills, RTK, and research influences.
- README skeleton describing phased autonomy model and adaptive install behavior.

## [0.1.0-alpha.0] — Pending

First release with installable functionality. See roadmap in README.
