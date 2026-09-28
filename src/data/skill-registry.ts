// Single source of truth for the set of skill directories praxis manages
// under a harness's skills directory: ~/.claude/skills/ for Claude Code,
// and the OpenCode config dir's skills directory for OpenCode.
//
// Before this module existed, src/lib/install.ts and
// src/lib/opencode/install.ts each defined their own copy of this union
// (the six skills lifted from mattpocock/skills plus the praxis-native
// ones). Two copies of the same list can only drift; a skill added to one
// installer and forgotten in the other would be installed by one harness
// and silently orphaned — never installed, never protected, never cleaned
// up — by the other. Both installers import this single constant instead.

import { POCOCK_SKILL_NAMES } from './pocock-skills.js';
import { PRAXIS_NATIVE_SKILL_NAMES } from './praxis-native-skills.js';

/**
 * Every skill directory praxis manages, across both harnesses: the six
 * lifted from mattpocock/skills plus the praxis-native ones (currently just
 * away-mode). Install, update, and uninstall all use this union so a
 * praxis-managed skill is never treated as a stray a user added by hand.
 */
export const CLAUDE_SKILL_NAMES: string[] = [...POCOCK_SKILL_NAMES, ...PRAXIS_NATIVE_SKILL_NAMES];
