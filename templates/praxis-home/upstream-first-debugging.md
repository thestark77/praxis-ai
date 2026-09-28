# Praxis-ai — Upstream-First Debugging

When a third-party open-source tool fails or behaves unexpectedly and the
cause is not obvious, go to its source repository first, before reaching
for a local workaround or a deep local debugging session. Someone upstream
has often already hit the same symptom.

## Scope

Third-party open-source tools only — not the project's own code, and not
an obvious local mistake (a typo, a wrong flag). For those, debug locally
as usual.

## Procedure

1. Search open AND closed issues and PRs for the symptom (error text,
   versions, platform), for example:
   - `gh search issues --repo <owner/repo> "<symptom>" --state all`
   - `gh issue list --search "<symptom>" --state all`
   - `gh pr list --search "<symptom>" --state all`
2. Find the canonical issue and read how it was closed and which
   commit/PR fixed it.
3. Check whether that fix is in the installed version: compare the
   installed version/tag against the release that contains the fix; with
   a source checkout, `git merge-base --is-ancestor <fix-commit>
   <installed-ref>` tells you whether the fix is already an ancestor of
   what is installed.
4. If it is fixed upstream: update to a release that contains the fix
   (updating is still subject to the environment's usual confirmation
   rules), or apply the documented workaround until you can update.
5. If it is not fixed: apply a documented workaround if one exists, and
   record the upstream issue link in the task notes so the gap is
   traceable later.

## Filing or commenting upstream is an external send

File a new upstream issue only if no equivalent exists, and only with the
user's explicit OK — filing is an external send under the irreversibility
firewall's anticipatory pauses. Draft it with evidence (versions, a
minimal reproduction, logs with secrets stripped) and show it to the user
before sending. Commenting on an existing issue is also an external send
and needs the same explicit OK.

## Example

A Hermes cron failure caused by `OOMPolicy` on systemd 249 was already
fixed upstream (issue #102486, commit 3513a3b9), but the local install
predated the fix. Searching upstream first would have found the fix
immediately, instead of debugging the symptom locally from scratch.
