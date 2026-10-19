/**
 * One review of the Claude Code configuration around a project: the rules in
 * access.mjs and secrets.mjs, run over the files in paths.mjs, each finding
 * with a file:line and a one-line fix.
 *
 * Every finding is what a file CONFIGURES. What Claude Code actually allows
 * also depends on managed policy, settings files this review does not read,
 * the session's permission mode and the Claude Code version, none of which is
 * observed here, so effective access is always reported as unknown and no
 * score is computed.
 *
 * READ-ONLY. Nothing in this plugin writes a file or opens a socket.
 */
import { closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseJsonTree, lineOf, memberOf } from './jsontree.mjs';
import { claudeSettingsFindings, mcpServerFindings } from './access.mjs';
import { findConfigSecrets, findInstructionSecrets } from './secrets.mjs';
import { APPLICABILITY_NOTE, findingFix, findingMessage, SEVERITY_ORDER } from './copy.mjs';
import { MAX_CONFIG_BYTES, PROJECT_INSTRUCTIONS, PROJECT_MCP, PROJECT_SETTINGS, userFiles } from './paths.mjs';

/** The closed surface value. Appears in JSON output only; nothing is sent anywhere. */
export const SURFACE = 'claude-code-plugin';
export const SCHEMA_VERSION = 2;

/** Read a file without following it anywhere it was not pointed, bounded. */
export function readText(abs, maxBytes = MAX_CONFIG_BYTES) {
  let fd;
  try {
    fd = openSync(abs, 'r');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) { return { status: 'absent' }; }
    return { status: 'unreadable' };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) { return { status: 'absent' }; }
    if (st.size > maxBytes) { return { status: 'too-large' }; }
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n === 0) { break; }
      off += n;
    }
    return { status: 'ok', text: buf.subarray(0, off).toString('utf8') };
  } catch {
    return { status: 'unreadable' };
  } finally {
    closeSync(fd);
  }
}

const SEVERITY_RANK = Object.fromEntries(SEVERITY_ORDER.map((s, i) => [s, i]));

function bySeverity(a, b) {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    || (a.location < b.location ? -1 : a.location > b.location ? 1 : 0)
    || ((a.line ?? 0) - (b.line ?? 0));
}

/** The `~/.claude.json` projects key for this project: the path as given, or its real path. */
function projectKeyIn(root, projectDir) {
  const projects = memberOf(root, 'projects');
  if (!projects || projects.kind !== 'object') { return undefined; }
  const candidates = [projectDir];
  try { candidates.push(realpathSync(projectDir)); } catch { /* absent project dir: keep the given path */ }
  return candidates.find((c) => projects.members.some((m) => m.key === c));
}

/**
 * Run the plugin's own checks over the files in paths.mjs.
 * Returns { findings, filesChecked, filesUnreadable, filesTooLarge }.
 */
function runRuleChecks({ projectDir, home, claudeConfigDir, includeUser }) {
  const out = { findings: [], filesChecked: [], filesUnreadable: [], filesTooLarge: [] };
  const visit = (abs, location, scope, kind) => {
    const read = readText(abs);
    if (read.status === 'absent') { return; }
    if (read.status === 'too-large') { out.filesTooLarge.push(location); return; }
    if (read.status === 'unreadable') { out.filesUnreadable.push(location); return; }
    const text = read.text;
    if (kind === 'instructions') {
      out.filesChecked.push(location);
      out.findings.push(...findInstructionSecrets(text, { location, scope }));
      return;
    }
    if (text.trim() === '') { out.filesChecked.push(location); return; }
    const root = parseJsonTree(text);
    if (!root) { out.filesUnreadable.push(location); return; }
    out.filesChecked.push(location);
    const projectKey = kind === 'claude-json' ? projectKeyIn(root, projectDir) : undefined;
    const ctx = { location, scope, userRoot: home, projectKey };
    const found = [];
    if (kind === 'settings') { found.push(...claudeSettingsFindings(root, ctx)); }
    found.push(...mcpServerFindings(root, ctx));
    found.push(...findConfigSecrets(root, { location, scope, projectKey, sweep: kind !== 'claude-json' }));
    for (const f of found) {
      f.line = lineOf(text, f.offset);
      delete f.offset;
      out.findings.push(f);
    }
  };

  for (const rel of PROJECT_SETTINGS) { visit(join(projectDir, rel), rel, 'project', 'settings'); }
  for (const rel of PROJECT_MCP) { visit(join(projectDir, rel), rel, 'project', 'mcp'); }
  for (const rel of PROJECT_INSTRUCTIONS) { visit(join(projectDir, rel), rel, 'project', 'instructions'); }
  if (includeUser) {
    for (const f of userFiles(home, claudeConfigDir)) { visit(f.abs, f.label, 'user', f.kind); }
  }
  return out;
}

/** Main entry: review one project. Pure apart from reads. */
export function runReview(opts) {
  const projectDir = resolve(opts.projectDir);
  const home = opts.home;
  const includeUser = opts.includeUser !== false;
  const claudeConfigDir = opts.claudeConfigDir || undefined;
  const nowIso = (opts.now ?? new Date()).toISOString();

  const rules = runRuleChecks({ projectDir, home, claudeConfigDir, includeUser });
  const findings = rules.findings.map((f) => ({ ...f, basis: 'configured', message: findingMessage(f), fix: findingFix(f) }));
  findings.sort(bySeverity);
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length]));

  return {
    schemaVersion: SCHEMA_VERSION,
    surface: SURFACE,
    reviewedAt: nowIso,
    project: basename(projectDir),
    includeUser,
    access: { basis: 'configured', effective: 'unknown', note: APPLICABILITY_NOTE },
    counts,
    findings,
    files: {
      checked: rules.filesChecked,
      unreadable: rules.filesUnreadable,
      tooLarge: rules.filesTooLarge,
    },
  };
}
