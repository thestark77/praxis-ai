import { describe, it, expect } from 'vitest';
import { tokeniseBash, extractSubstitutions } from '../../../src/lib/ast/tokeniser.js';

describe('tokeniseBash', () => {
  it('returns a single token for a plain command', () => {
    const t = tokeniseBash('echo hello');
    expect(t).toEqual([
      { command: 'echo hello', precedingOperator: null, insideSubstitution: false },
    ]);
  });

  it('splits on `&&`, `||`, `;`, `|`, `&`', () => {
    const t = tokeniseBash('a && b || c ; d | e & f');
    expect(t.map((x) => x.command)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.map((x) => x.precedingOperator)).toEqual([null, '&&', '||', ';', '|', '&']);
  });

  it('does not split on operators inside single quotes', () => {
    const t = tokeniseBash("echo 'a && b'");
    expect(t.length).toBe(1);
    expect(t[0].command).toBe("echo 'a && b'");
  });

  it('does not split on operators inside double quotes', () => {
    const t = tokeniseBash('echo "a; b; c"');
    expect(t.length).toBe(1);
  });

  it('respects backslash escapes', () => {
    const t = tokeniseBash('echo hello \\&\\& world');
    expect(t.length).toBe(1);
    expect(t[0].command).toBe('echo hello \\&\\& world');
  });

  it('keeps `$(...)` substitution bodies as part of the outer command', () => {
    const t = tokeniseBash('echo $(date; whoami)');
    expect(t.length).toBe(1);
    expect(t[0].command).toBe('echo $(date; whoami)');
  });

  it('handles backtick substitutions', () => {
    const t = tokeniseBash('echo `date`');
    expect(t.length).toBe(1);
  });
});

describe('extractSubstitutions', () => {
  it('returns an empty list for plain commands', () => {
    expect(extractSubstitutions('echo hello')).toEqual([]);
  });

  it('extracts a `$(...)` body', () => {
    expect(extractSubstitutions('echo $(rm -rf /tmp/x)')).toEqual(['rm -rf /tmp/x']);
  });

  it('extracts nested `$(...)` correctly (only outer body)', () => {
    expect(extractSubstitutions('echo $(date $(whoami))')).toEqual(['date $(whoami)']);
  });

  it('extracts backtick substitutions', () => {
    expect(extractSubstitutions('echo `whoami`')).toEqual(['whoami']);
  });

  it('extracts multiple substitutions in one command', () => {
    expect(extractSubstitutions('echo $(a) $(b)')).toEqual(['a', 'b']);
  });
});
