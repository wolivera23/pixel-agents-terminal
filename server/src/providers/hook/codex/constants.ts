/**
 * Codex-specific constants.
 */

/** Output filename after esbuild compiles codex-hook.ts to CJS. */
export const CODEX_HOOK_SCRIPT_NAME = 'codex-hook.js';

/**
 * Codex hook events used by Pixel Agents.
 * SessionStart/Stop/UserPromptSubmit cover lifecycle. Pre/PostToolUse and
 * PermissionRequest provide activity and permission state.
 */
export const CODEX_HOOK_EVENTS = [
  'SessionStart',
  'Stop',
  'PermissionRequest',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
] as const;
