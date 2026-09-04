// Registration of the voice hook in Claude Code's settings.json.
//
// The hook runs on `Stop` -- the moment Claude finishes a response -- which
// is the event that matches what the feature is for: a spoken notification
// that a long task is done, for someone who has looked away from the
// terminal. `Notification` fires for permission prompts and would talk over
// the user; `PostToolUse` fires constantly and would be unbearable.
//
// It is marker-tagged like the AST hook so install stays idempotent and
// uninstall can find its own entry without touching anybody else's.

import type { ClaudeSettings, ClaudeHookMatcher } from '../settings-patcher.js';

export const PRAXIS_VOICE_HOOK_MARKER = '#praxis-voice-hook#';

/** Add or refresh the praxis voice hook. Existing hooks are preserved. */
export function addPraxisVoiceHook(settings: ClaudeSettings, hookCommand: string): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  const hooks = { ...(result.hooks ?? {}) };
  const stopList: ClaudeHookMatcher[] = Array.isArray(hooks.Stop)
    ? [...(hooks.Stop as ClaudeHookMatcher[])]
    : [];

  const tagged = `${hookCommand} ${PRAXIS_VOICE_HOOK_MARKER}`;

  let replaced = false;
  for (let i = 0; i < stopList.length; i++) {
    const entry = stopList[i]!;
    const idx = entry.hooks.findIndex((h) => h.command.includes(PRAXIS_VOICE_HOOK_MARKER));
    if (idx >= 0) {
      const newHooks = [...entry.hooks];
      newHooks[idx] = { type: 'command', command: tagged };
      stopList[i] = { ...entry, hooks: newHooks };
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    stopList.push({ hooks: [{ type: 'command', command: tagged }] });
  }

  hooks.Stop = stopList;
  result.hooks = hooks;
  return result;
}

/** Remove the praxis voice hook, leaving every other Stop hook in place. */
export function removePraxisVoiceHook(settings: ClaudeSettings): ClaudeSettings {
  const result: ClaudeSettings = { ...settings };
  if (!result.hooks) return result;
  const hooks = { ...result.hooks };
  const stopList = Array.isArray(hooks.Stop) ? (hooks.Stop as ClaudeHookMatcher[]) : null;
  if (!stopList) return result;

  const cleaned = stopList
    .map((entry) => ({
      ...entry,
      hooks: entry.hooks.filter((h) => !h.command.includes(PRAXIS_VOICE_HOOK_MARKER)),
    }))
    .filter((entry) => entry.hooks.length > 0);

  if (cleaned.length > 0) hooks.Stop = cleaned;
  else delete hooks.Stop;

  result.hooks = hooks;
  return result;
}

/** True when a praxis voice hook is registered. */
export function hasPraxisVoiceHook(settings: ClaudeSettings): boolean {
  const stopList = settings.hooks?.Stop;
  if (!Array.isArray(stopList)) return false;
  return (stopList as ClaudeHookMatcher[]).some((entry) =>
    entry.hooks.some((h) => h.command.includes(PRAXIS_VOICE_HOOK_MARKER)),
  );
}
