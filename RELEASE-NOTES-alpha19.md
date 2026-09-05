## Added — a spoken summary can be told to keep everything

`PRAXIS_VOICE_MAX_CHARS=0` now means no budget at all: the whole answer is
spoken, minus the fenced code, tables, URLs and long paths that stripping
removes anyway. Any other value behaves as before, and an unset one still gets
the 350-character default.

The 2000-character clamp stays for every positive value. It protects someone
who never thought about an API billed per character; someone who writes `0` has
thought about it, and quietly holding them to 2000 dropped the end of every
long turn without ever saying so.

### Why

Reported from a headless-VPS setup where the machine running Claude Code has no
audio device, so a relay carries the turn text to a laptop that speaks it. At
350 characters the summary was dropping version numbers and test counts — the
details a listener who walked away actually needs.

`summariseForSpeech` already returned the cleaned text whole when it fit the
budget, so an infinite budget needed no change there; only `config.ts` was
clamping.

### Note on alpha.18

The `v0.1.0-alpha.18` tag exists but was never published as a Release, and this
workflow publishes on `release: published` rather than on a tag push — so
alpha.18 never reached npm. Publishing this release ships both changes.

**507 tests, typecheck and lint green.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
