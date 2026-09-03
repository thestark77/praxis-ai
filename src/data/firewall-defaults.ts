/**
 * Default deny entries added to settings.json permissions.deny by `praxis install`.
 * Grouped by category for readability. Each entry is a Claude Code permission
 * pattern using glob-style wildcards.
 *
 * Path rules follow gitignore semantics: a bare filename such as `.env`
 * already matches at any depth under the working directory, so a
 * recursively anchored variant of it adds nothing. A multi-segment
 * relative pattern like `.ssh/id_*` does NOT — it anchors at the working
 * directory only — which is why the credentials that actually matter are
 * written in the home-anchored `~` form as well.
 */
export const FIREWALL_DEFAULTS: string[] = [
  // Destructive filesystem
  'Bash(rm -rf *)',
  'Bash(rm -fr *)',
  'Bash(find * -delete*)',

  // Destructive git
  'Bash(git push --force*)',
  'Bash(git push -f *)',
  'Bash(git push --force-with-lease*)',
  'Bash(git reset --hard*)',
  'Bash(git clean -fd*)',
  'Bash(git clean -fdx*)',
  'Bash(git checkout .*)',
  'Bash(git restore .*)',
  'Bash(git branch -D*)',
  // History rewrite (mirrored from L2 AST rules: git-update-ref, git-filter-branch)
  'Bash(git update-ref refs/heads/*)',
  'Bash(git update-ref refs/tags/*)',
  'Bash(git filter-branch*)',

  // Package-manager lockfile bypass (mirrored from L2 npm-install-force)
  'Bash(npm install --force*)',
  'Bash(npm install -f *)',
  'Bash(npm i --force*)',
  'Bash(npm i -f *)',
  'Bash(pnpm install --force*)',
  'Bash(pnpm install -f *)',
  'Bash(yarn add --force*)',

  // Safety-hook bypass
  'Bash(*--no-verify*)',
  'Bash(*--no-gpg-sign*)',

  // Permissions
  'Bash(chmod 777*)',
  'Bash(chown -R *)',

  // Destructive K8s / Docker
  'Bash(kubectl delete *)',
  'Bash(docker system prune*)',
  'Bash(docker volume rm*)',

  // Infrastructure teardown. The philosophy names cloud actions that
  // terminate or delete resources, and shared IaC state, as pause-worthy;
  // these are the forms that never come back.
  'Bash(terraform destroy*)',
  'Bash(terraform apply -auto-approve*)',
  'Bash(aws s3 rb *)',
  'Bash(gcloud * delete*)',

  // Publish / release
  'Bash(npm publish*)',
  'Bash(cargo publish*)',
  'Bash(gh release create*)',

  // Dangerous SQL (heuristic)
  'Bash(*DROP TABLE*)',
  'Bash(*DROP DATABASE*)',
  'Bash(*TRUNCATE TABLE*)',
  'Bash(dropdb *)',
  // A migration reset drops every table and reseeds. Routinely reached for
  // to "fix" a drifted schema, and it takes the data with it.
  'Bash(*prisma migrate reset*)',

  // Secrets. `.env` is the file that actually leaks in practice, and the
  // Edit forms matter because a Read deny does not cover NotebookEdit.
  //
  // The suffixes are enumerated rather than globbed. `Read(.env.*)` also
  // matches `.env.example`, `.env.sample` and `.env.template` — the files
  // that exist precisely to be read and committed — and a Claude Code deny
  // rule cannot carry an allowlist exception, so the glob has no way to
  // spare them. Blocking the template is not a cosmetic annoyance: it
  // stops an agent from reading the very file that documents which
  // variables a project needs.
  'Read(.env)',
  'Edit(.env)',
  'Read(.env.local)',
  'Edit(.env.local)',
  'Read(.env.*.local)',
  'Edit(.env.*.local)',
  'Read(.env.development)',
  'Edit(.env.development)',
  'Read(.env.staging)',
  'Edit(.env.staging)',
  'Read(.env.production)',
  'Edit(.env.production)',
  'Read(.env.test)',
  'Edit(.env.test)',
  'Read(*.pem)',
  'Read(*.key)',
  'Read(*.p12)',
  'Read(*.pfx)',
  'Read(.ssh/id_*)',
  'Read(.aws/credentials)',
  'Read(*credentials*)',
  // Home-anchored forms. The relative rules above only reach a copy that
  // happens to sit under the working directory; the real private keys and
  // cloud credentials live in the home directory.
  'Read(~/.ssh/id_*)',
  'Read(~/.aws/credentials)',
  'Read(~/.config/gcloud/*)',

  // MCP tools that destroy remote or shared state.
  //
  // The two firewall layers only ever saw Bash. An MCP server can delete a
  // repository or drop a database in one call, and neither the deny globs
  // nor the AST hook were ever consulted for it — the whole class was
  // outside the fence.
  //
  // Only genuinely irreversible operations are listed. Moving something to
  // a trash bin is recoverable and deliberately left out, as is anything a
  // commit or a revert can undo. Entries naming a server that is not
  // installed simply never match, and `mcp__` names are exempt from the
  // unknown-tool startup warning.
  //
  // These must stay parenthesis-free: Claude Code silently skips any
  // `mcp__` rule containing parentheses, so argument-level matching is not
  // available here and belongs on `--disallowedTools` instead.
  'mcp__github__delete_repository',
  'mcp__railway__remove_service',
  'mcp__railway__remove_volume',
  'mcp__railway__remove_bucket',
  'mcp__prisma-local__migrate-reset',
];

export const PRAXIS_IMPORT_PATH = '~/.praxis/main.md';
