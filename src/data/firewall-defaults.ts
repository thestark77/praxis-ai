/**
 * Default deny entries added to settings.json permissions.deny by `praxis install`.
 * Grouped by category for readability. Each entry is a Claude Code permission
 * pattern using glob-style wildcards.
 */
export const FIREWALL_DEFAULTS: string[] = [
  // Filesystem destructivo
  'Bash(rm -rf *)',
  'Bash(rm -fr *)',
  'Bash(find * -delete*)',

  // Git destructivo
  'Bash(git push --force*)',
  'Bash(git push -f *)',
  'Bash(git push --force-with-lease*)',
  'Bash(git reset --hard*)',
  'Bash(git clean -fd*)',
  'Bash(git clean -fdx*)',
  'Bash(git checkout .*)',
  'Bash(git restore .*)',
  'Bash(git branch -D*)',

  // Bypass de safety hooks
  'Bash(*--no-verify*)',
  'Bash(*--no-gpg-sign*)',

  // Permisos
  'Bash(chmod 777*)',
  'Bash(chown -R *)',

  // K8s / Docker destructivo
  'Bash(kubectl delete *)',
  'Bash(docker system prune*)',
  'Bash(docker volume rm*)',

  // Publicación / release
  'Bash(npm publish*)',
  'Bash(cargo publish*)',
  'Bash(gh release create*)',

  // SQL peligroso (heurístico)
  'Bash(*DROP TABLE*)',
  'Bash(*DROP DATABASE*)',
  'Bash(*TRUNCATE TABLE*)',

  // Lectura de secretos
  'Read(*.pem)',
  'Read(*.key)',
  'Read(.ssh/id_*)',
  'Read(.aws/credentials)',
  'Read(*credentials*)',
];

export const PRAXIS_IMPORT_PATH = '~/.praxis/main.md';
