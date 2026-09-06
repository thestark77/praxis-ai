import { describe, it, expect } from 'vitest';
import { parseJsonc, hasComments } from '../../../src/lib/opencode/jsonc.js';

describe('parseJsonc', () => {
  it('parses plain JSON unchanged', () => {
    expect(parseJsonc('{"a": 1, "b": [2, 3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('strips line comments', () => {
    expect(parseJsonc('{\n  // praxis firewall\n  "a": 1\n}')).toEqual({ a: 1 });
  });

  it('strips block comments, including multi-line ones', () => {
    expect(parseJsonc('{ /* one */ "a": 1, /*\n two\n*/ "b": 2 }')).toEqual({ a: 1, b: 2 });
  });

  it('keeps a // that lives inside a string', () => {
    // The exact failure that corrupted this user's config once already: a
    // comment stripper that is not string-aware eats the scheme separator of
    // every URL in the file and leaves behind unparseable garbage.
    const parsed = parseJsonc('{ "$schema": "https://opencode.ai/config.json" }');
    expect(parsed).toEqual({ $schema: 'https://opencode.ai/config.json' });
  });

  it('keeps a /* that lives inside a string', () => {
    expect(parseJsonc('{ "glob": "src/*.ts", "b": "/* not a comment" }')).toEqual({
      glob: 'src/*.ts',
      b: '/* not a comment',
    });
  });

  it('is not fooled by an escaped quote before a //', () => {
    expect(parseJsonc('{ "a": "say \\"hi\\" // not a comment", "b": 2 }')).toEqual({
      a: 'say "hi" // not a comment',
      b: 2,
    });
  });

  it('does not treat a backslash inside a comment as a string escape', () => {
    expect(parseJsonc('{\n // C:\\path\\to "x\n "a": 1\n}')).toEqual({ a: 1 });
  });

  it('allows trailing commas in objects and arrays', () => {
    expect(parseJsonc('{ "a": [1, 2,], "b": 2, }')).toEqual({ a: [1, 2], b: 2 });
  });

  it('keeps a comma that lives inside a string', () => {
    expect(parseJsonc('{ "a": "trailing, comma" }')).toEqual({ a: 'trailing, comma' });
  });

  it('still throws on genuinely malformed input', () => {
    expect(() => parseJsonc('{ "a": }')).toThrow();
  });
});

describe('hasComments', () => {
  it('is true for a real comment and false for a URL', () => {
    expect(hasComments('{ // hi\n "a": 1 }')).toBe(true);
    expect(hasComments('{ /* hi */ "a": 1 }')).toBe(true);
    expect(hasComments('{ "$schema": "https://opencode.ai/config.json" }')).toBe(false);
    expect(hasComments('{ "glob": "src/*.ts" }')).toBe(false);
  });
});
