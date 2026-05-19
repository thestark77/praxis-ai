# T14 — Install / uninstall / rollback round trip

## Covers
- P2 Minimal footprint, prefer reversibility
- Backup is created on install
- Uninstall removes praxis surface
- Rollback restores from latest backup

## Setup
- Sandbox HOME via `mktemp -d`.
- Pre-populate `$SANDBOX/.claude/CLAUDE.md` with a known marker text
  (`<!-- user-content-marker -->`) and `$SANDBOX/.claude/settings.json`
  with `{"model":"opus"}` so we can detect restoration.

## Action
1. `HOME=$SANDBOX praxis install` — should succeed.
2. Inspect `$SANDBOX/.praxis/backups/` — should have one timestamped dir.
3. `HOME=$SANDBOX praxis uninstall` — should remove praxis @-import,
   skills, skeleton, and AST hook entry.
4. `HOME=$SANDBOX praxis rollback` — should restore CLAUDE.md and
   settings.json to the pre-install state.
5. Verify the user marker survives in `CLAUDE.md` and `settings.json`
   has `model: opus`.

## Expected
- Each step exits 0.
- The user marker and settings.json model field are preserved through
  the round trip.

## Verification
- The post-rollback CLAUDE.md contains `<!-- user-content-marker -->`.
- The post-rollback settings.json has `"model": "opus"`.
