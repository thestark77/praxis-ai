import { describe, it, expect } from 'vitest';
import { CLAUDE_SKILL_NAMES } from '../../src/data/skill-registry.js';
import { POCOCK_SKILL_NAMES } from '../../src/data/pocock-skills.js';
import { PRAXIS_NATIVE_SKILL_NAMES } from '../../src/data/praxis-native-skills.js';

describe('CLAUDE_SKILL_NAMES', () => {
  it('is the union of the lifted Pocock skills and the praxis-native skills', () => {
    expect(CLAUDE_SKILL_NAMES).toEqual([...POCOCK_SKILL_NAMES, ...PRAXIS_NATIVE_SKILL_NAMES]);
  });

  it('includes away-mode', () => {
    expect(CLAUDE_SKILL_NAMES).toContain('away-mode');
  });

  it('has no duplicate entries', () => {
    expect(new Set(CLAUDE_SKILL_NAMES).size).toBe(CLAUDE_SKILL_NAMES.length);
  });
});
