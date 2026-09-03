Found by replaying the deny spool of a live praxis install.

## Two ways past the AST hook, now closed

**A newline never separated commands.** Only `;`, `&&`, `||`, `|` and `&`
did, so a multi-line Bash call was read as one command, the rules were
matched against its first word, and every later line went unexamined.
Claude Code sends multi-line commands routinely, so layer 2 was open by
default.

**Heredoc bodies were tokenised as commands**, which cut both ways: it
denied commit messages that merely named a bypass flag while allowing a
shell heredoc that actually ran one.

| Command | alpha.8 | alpha.9 |
| --- | --- | --- |
| recursive delete on line 2 of a script | allow | **deny** |
| recursive delete inside a `bash` heredoc | allow | **deny** |
| commit message naming a bypass flag | deny | **allow** |

Bodies are now lifted out before tokenising and tagged with whether a
shell consumes them: `bash`, `sh`, `eval` and `ssh` get theirs inspected;
`git commit -F -`, `python -` and `cat > file` receive data.

## Uninstall no longer removes rules praxis did not add

The firewall list is a set of desired rules, not a record of authorship,
and uninstall used it as both. Where gentle-ai or you had independently
denied the same thing, `praxis uninstall` deleted your protection.
Install now records what it wrote to `~/.praxis/owned-permissions.json`
and gives back only that.

## Firewall coverage for classes it never saw

`.env` and home-anchored SSH, AWS and gcloud credentials; infrastructure
teardown; and MCP tools that destroy remote state. Both layers only ever
saw Bash, so a server deleting a repository was never checked at all.

## Also

- `sync-pocock` records a per-file review. Upstream moved to `6654f6b`
  and all five drifted files are editorial; the report reads 0 changed,
  8 settled.
- `detector` probes PATH with the platform's own command.
- Dependency bumps within semver; stale README claims corrected.

373 tests, green on Linux, macOS and Windows across Node 22 and 24.

**Upgrading is worth doing now**: the tokeniser fix only reaches your
machine when the installed hook is replaced, so run `praxis install`
again after updating.
