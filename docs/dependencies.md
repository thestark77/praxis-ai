# Dependencies

`praxis install` runs a dependency preflight before any side-effect.
gentle-ai's own installer aborts if `curl`/`git` are missing but does not
install system dependencies itself, and it never installs Go (Go is
optional — the binary-download path is used when brew/go are absent).
praxis surfaces every missing requirement up front, with install links, so
you never get a half-finished install that fails midway.

## Required

These are checked when the gentle-ai bootstrap will run (the default
`praxis install`). If any are missing, the install **aborts** and prints
the list below with fixes.

| Tool | Why | Install |
|------|-----|---------|
| `node` (>=18) | praxis-ai and several gentle-ai components run on Node.js | https://nodejs.org/en/download (or `nvm install --lts`) |
| `npm` | Installs praxis-ai and npm-based components | Ships with Node.js |
| `git` | Required by the gentle-ai installer and for repo operations | https://git-scm.com/downloads · macOS `brew install git` · Debian/Ubuntu `sudo apt install git` |
| `curl` | The gentle-ai installer downloads its binary via curl | https://curl.se/download.html · macOS `brew install curl` · Debian/Ubuntu `sudo apt install curl` |
| `bash` | praxis runs the gentle-ai `install.sh` via bash | Preinstalled on macOS/Linux. On Windows use WSL or Git Bash: https://gitforwindows.org |

When you run `praxis install --no-gentle-ai` (overlay only), only `node`
and `npm` are required — the bootstrap-only tools (`git`, `curl`, `bash`)
are not checked.

## Optional

| Tool | Why | Install |
|------|-----|---------|
| `go` | Only used if you force the gentle-ai or engram install through the Go toolchain (`--method go`). The default binary-download path does not need it. | https://go.dev/dl/ (safe to skip) |

A missing optional dependency produces a warning, never an abort.

## What gets installed by whom

praxis does **not** install system dependencies — it validates them and
aborts with guidance if they are missing. The actual software installs are:

| Component | Installed by | Source |
|-----------|--------------|--------|
| gentle-ai binary | gentle-ai `scripts/install.sh` (driven by praxis) | brew tap or GitHub Releases binary |
| gentle-ai ecosystem (9 components) | `gentle-ai install` | gentle-ai downloads them |
| engram | `gentle-ai install` (preset includes it) | binary download / go install |
| praxis-ai | `npm install -g praxis-ai` (or `npx`) | npm registry |
| lifted skills | `praxis install` (from the npm package) | mechanism-pure rewrites; refresh via `praxis sync-pocock` |

## Error example

If `git` and `curl` are missing, `praxis install` prints:

```
praxis install aborted — missing required dependencies:

  ✗ git
      Required by the gentle-ai installer and for repo operations.
      install: https://git-scm.com/downloads (macOS: `brew install git`, Debian/Ubuntu: `sudo apt install git`)
  ✗ curl
      The gentle-ai installer downloads its binary via curl.
      install: https://curl.se/download.html (macOS: `brew install curl`, Debian/Ubuntu: `sudo apt install curl`)

Install the tools above, then re-run `praxis install`.
To install the praxis overlay only (no gentle-ai bootstrap), use:
  praxis install --no-gentle-ai
```
