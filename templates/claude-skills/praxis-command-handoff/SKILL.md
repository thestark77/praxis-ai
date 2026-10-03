---
name: praxis-command-handoff
description: Use when handing the user a command to run themselves (including `! <command>` suggestions), or when a secret (API key, token, password, .env content) could end up in a command, a log or a reply. Holds the absolute-path, placeholder and never-print-secrets rules.
invocation: contextual
praxis-native: true
---

# Praxis-ai — Commands Handed to the User

When you hand the user a command to run themselves — including a `!
<command>` suggestion — the user runs it in an unknown shell, in an unknown
directory, at an unknown later time. Write it so it works regardless.

## Absolute paths

Always use absolute paths in a handed-off command. Never rely on `~`, a
relative path, or the user's current working directory: you do not know
what it will be when they run the command. Expand `~` to the real home
path yourself before handing the command over. A `~`-relative or
cwd-dependent path is acceptable only when there is genuinely no absolute
alternative (for example, a tool that only accepts a path relative to its
own working directory) — and even then, say so explicitly.

## Placeholders for secrets

Never put a real secret — API key, token, password, `.env` content — into
a command you hand to the user. Represent it with an obvious placeholder
the user must replace before running the command, for example:

```
export ANTHROPIC_API_KEY=PEGA_AQUI_TU_API_KEY
```

The literal placeholder `PEGA_AQUI_TU_API_KEY` (English equivalent:
`PASTE_YOUR_API_KEY_HERE`) signals unmistakably that substitution is
required. Placeholders may be localised to the user's language as long as
they stay equally obvious. A placeholder is still a runnable value, so say
in plain words that the command must not be run before it is replaced.

## Never print, echo, log, or read secrets

Never print, echo, log, or read back a secret value, including to
"verify" it. Do not `cat` an `.env` file, `echo $API_KEY`, or ask the user
to paste a secret into the conversation. Prefer commands that read the
secret from the user's own environment or prompt for it interactively
instead of embedding it in the command text. Use a form that works in any
POSIX shell (bash, zsh, sh), for example:

```
printf 'API key: '; stty -echo; read -r API_KEY; stty echo; printf '\n'
```

or a reference to an existing environment variable the user already set,
rather than its expanded value. The rule holds even under a debugging
request: never print a secret to "just double-check it".
