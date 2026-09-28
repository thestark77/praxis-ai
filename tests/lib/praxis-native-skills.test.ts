import { describe, it, expect } from 'vitest';
import {
  PRAXIS_NATIVE_SKILLS,
  PRAXIS_NATIVE_SKILL_NAMES,
} from '../../src/data/praxis-native-skills.js';
import { POCOCK_SKILL_NAMES } from '../../src/data/pocock-skills.js';

describe('PRAXIS_NATIVE_SKILLS', () => {
  it('lists away-mode as an explicit, praxis-native skill', () => {
    expect(PRAXIS_NATIVE_SKILL_NAMES).toContain('away-mode');
    const awayMode = PRAXIS_NATIVE_SKILLS.find((s) => s.name === 'away-mode');
    expect(awayMode).toBeDefined();
    expect(awayMode?.invocation).toBe('explicit');
    expect(awayMode?.files).toContain('SKILL.md');
  });

  it('does not require a NOTICE.md (no upstream to attribute)', () => {
    const awayMode = PRAXIS_NATIVE_SKILLS.find((s) => s.name === 'away-mode');
    expect(awayMode?.files).not.toContain('NOTICE.md');
  });

  it('does not overlap with the six lifted Pocock skill names', () => {
    for (const name of PRAXIS_NATIVE_SKILL_NAMES) {
      expect(POCOCK_SKILL_NAMES).not.toContain(name);
    }
  });
});
