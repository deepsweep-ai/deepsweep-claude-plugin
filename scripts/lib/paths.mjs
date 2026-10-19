/**
 * THE ONE LIST of files the review opens. The README's "What it reads"
 * section is generated from a trace of a real review, and the test suite fails
 * when they disagree, so the disclosure cannot drift from the code.
 */
import { join } from 'node:path';

/** Claude Code project settings (permissions, hooks, env, enableAllProjectMcpServers). */
export const PROJECT_SETTINGS = ['.claude/settings.json', '.claude/settings.local.json'];

/** Project MCP configs: Claude Code's `.mcp.json`, plus the two other editors' project files. */
export const PROJECT_MCP = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'];

/** Instruction files an agent loads into its context (checked for written-in credentials). */
export const PROJECT_INSTRUCTIONS = ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', 'AGENTS.md'];

/**
 * Claude Code's user-level files. With CLAUDE_CONFIG_DIR set, Claude Code keeps
 * them in that directory instead of `~/.claude` and `~/.claude.json`.
 * kind: settings | claude-json | instructions
 */
export function userFiles(home, claudeConfigDir) {
  if (claudeConfigDir) {
    return [
      { abs: join(claudeConfigDir, 'settings.json'), label: '$CLAUDE_CONFIG_DIR/settings.json', kind: 'settings' },
      { abs: join(claudeConfigDir, '.claude.json'), label: '$CLAUDE_CONFIG_DIR/.claude.json', kind: 'claude-json' },
      { abs: join(claudeConfigDir, 'CLAUDE.md'), label: '$CLAUDE_CONFIG_DIR/CLAUDE.md', kind: 'instructions' },
    ];
  }
  return [
    { abs: join(home, '.claude', 'settings.json'), label: '~/.claude/settings.json', kind: 'settings' },
    { abs: join(home, '.claude.json'), label: '~/.claude.json', kind: 'claude-json' },
    { abs: join(home, '.claude', 'CLAUDE.md'), label: '~/.claude/CLAUDE.md', kind: 'instructions' },
  ];
}

/** Larger files are skipped and reported, never parsed (`~/.claude.json` grows with history). */
export const MAX_CONFIG_BYTES = 5 * 1024 * 1024;
