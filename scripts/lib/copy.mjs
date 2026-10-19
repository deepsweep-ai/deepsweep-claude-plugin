/**
 * Every sentence the review prints. Built only from a finding's rule, location,
 * server and key names, and the kind of credential: a finding carries no value,
 * so no sentence can carry one.
 *
 * PROVENANCE: the Claude Code and MCP sentences and fixes are ported from
 * the DeepSweep editor extension's review copy. Changes from the source: the any-shell fix suggests an exact command,
 * `Bash(npm test)`, rather than a `:*` rule; and every Claude Code sentence
 * says what the FILE configures, never what Claude Code will do, because the
 * review does not observe managed policy, other settings, the session's mode
 * or the version.
 */

export const INSTALL_URL = 'https://deepsweep.ai/install';

/** Printed with every report, and carried in the JSON as access.note. */
export const APPLICABILITY_NOTE = 'These findings are what the files configure. What Claude Code actually allows also depends on managed '
  + 'policy, settings this review does not read, the permission mode a session starts in and the Claude Code version, '
  + 'so effective access is unknown.';

/** Claude Code 2.1.257 and later ignore bypassPermissions as a project or local default (official changelog). */
export const BYPASS_IGNORED_FROM = '2.1.257';

function server(f) {
  const name = f.subject ? `MCP server "${f.subject}"` : 'An MCP server';
  return f.projectEntry ? `${name} (local to this project)` : name;
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const FIELD_WORD = { env: 'env', headers: 'header', url: 'field', args: 'argument', setting: 'setting' };

function describeWhere(f) {
  const what = f.key ? `${FIELD_WORD[f.field]} ${f.key}` : `a ${FIELD_WORD[f.field]}`;
  return f.server ? `server "${f.server}", ${what}` : what;
}

/** One sentence: what the setting or file lets an agent do, or what it exposes. */
export function findingMessage(f) {
  switch (f.rule) {
    case 'claude-bypass-permissions':
      return f.scope === 'project'
        ? `This file sets defaultMode to bypassPermissions. Claude Code ${BYPASS_IGNORED_FROM} and later ignore it in project settings; an earlier version may use it to skip permission prompts.`
        : 'This file sets the default permission mode to bypassPermissions, which skips permission prompts in sessions that start in that mode.';
    case 'claude-any-shell':
      return `This file allows any shell command without asking (allow rule ${f.detail || 'Bash'}). A deny or ask rule elsewhere takes precedence over it.`;
    case 'claude-sensitive-command':
      return `This file allows ${f.subject} without asking (an allow rule in permissions). A deny or ask rule elsewhere takes precedence over it.`;
    case 'claude-broad-directory':
      return `This file adds ${f.subject} to the folders Claude Code works in, not only this project (additionalDirectories). Edits there follow the session's permission mode.`;
    case 'claude-all-project-servers':
      return 'This file is set to approve every MCP server a project lists, without asking you first (enableAllProjectMcpServers).';
    case 'claude-auto-allow-hook':
      return `A PreToolUse hook in this file is configured to answer "allow" for ${f.subject === 'every tool' ? 'every tool call' : `${f.subject} calls`}. Deny and ask rules still apply over it.`;
    case 'mcp-unpinned-package':
      return `${server(f)} runs ${f.detail}, which is not pinned to a version, so it can run different code the next time it starts.`;
    case 'mcp-unpinned-image':
      return `${server(f)} runs the image ${f.detail}, which is not pinned to a version or digest, so it can run different code the next time it starts.`;
    case 'mcp-remote-no-sign-in':
      return `${server(f)} connects to ${f.detail} with no sign-in set in this file.`;
    case 'mcp-filesystem-broad':
      return `${server(f)} can read and write files in ${f.detail}.`;
    case 'config-secret':
      return `${capitalise(f.kind)} written in plain text (${describeWhere(f)}${f.projectEntry ? ', in this project\'s entry' : ''}). Any agent or tool that can read the file can read it.`;
    case 'instructions-secret':
      return `${capitalise(f.kind)} written in plain text in an agent instruction file. Agents that load this file send its text to their model.`;
    default:
      return f.rule;
  }
}

/** One instruction: what to change. */
export function findingFix(f) {
  switch (f.rule) {
    case 'claude-bypass-permissions': return 'Remove defaultMode, or set it to "default".';
    case 'claude-any-shell': return 'Allow only the exact commands you need, such as Bash(npm test).';
    case 'claude-sensitive-command': return 'Move the rule to "ask" so Claude Code asks you first.';
    case 'claude-broad-directory': return 'List only the folders the project needs.';
    case 'claude-all-project-servers': return 'Remove it, and approve each project server when Claude Code asks.';
    case 'claude-auto-allow-hook': return 'Remove the hook, or have it answer "ask".';
    case 'mcp-unpinned-package': return 'Pin an exact version, for example name@1.2.3.';
    case 'mcp-unpinned-image': return 'Pin a version tag or a sha256 digest.';
    case 'mcp-remote-no-sign-in': return 'Check that the server requires sign-in, or add an Authorization header that reads its value from an environment variable.';
    case 'mcp-filesystem-broad': return 'Give it only the folders it needs.';
    case 'config-secret': return 'Replace it with an environment variable reference such as ${API_TOKEN}, then rotate it.';
    case 'instructions-secret': return 'Delete it from the file and rotate it; name the environment variable that holds it instead.';
    default: return '';
  }
}

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'info'];

export function severityLabel(s) {
  return s.toUpperCase();
}
