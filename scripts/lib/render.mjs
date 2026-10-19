/**
 * Text and JSON renderings of one review. The text is what lands in the Claude
 * Code conversation: short, every finding with file:line and one fix, no
 * values, no score, no marketing. One link, stated as what it does.
 */
import { INSTALL_URL, severityLabel } from './copy.mjs';

export const DEFAULT_LIMIT = 5;

function where(f) {
  if (!f.location) { return '(workspace)'; }
  const at = f.line ? `${f.location}:${f.line}` : f.location;
  const more = f.otherLocations && f.otherLocations.length > 0
    ? ` (+${f.otherLocations.length} more file${f.otherLocations.length === 1 ? '' : 's'})`
    : '';
  return at + more;
}

/** Every printed line ends as a sentence. */
function sentence(s) {
  return /[.!?)]$/.test(s) ? s : `${s}.`;
}

export function renderText(result, { limit = DEFAULT_LIMIT } = {}) {
  const lines = [];
  const scope = result.includeUser ? 'this project and your user-level Claude Code files' : 'this project only';
  lines.push(`DeepSweep agent access review: ${result.project} (${scope})`);
  const c = result.counts;
  const total = result.findings.length;
  if (total === 0) {
    lines.push('No findings in the files reviewed.');
  } else {
    const parts = ['critical', 'high', 'medium', 'info'].filter((s) => c[s] > 0).map((s) => `${c[s]} ${s}`);
    lines.push(`${total} finding${total === 1 ? '' : 's'}: ${parts.join(', ')}`);
    lines.push('');
    const shown = limit > 0 ? result.findings.slice(0, limit) : result.findings;
    shown.forEach((f, i) => {
      lines.push(`${i + 1}. ${severityLabel(f.severity)}  ${where(f)}`);
      lines.push(`   ${sentence(f.message)}`);
      if (f.fix) { lines.push(`   Fix: ${sentence(f.fix)}`); }
    });
    if (shown.length < total) {
      lines.push('');
      lines.push(`${total - shown.length} more not shown. Ask for the full list to see every finding.`);
    }
  }
  const unread = [...result.files.unreadable, ...result.files.tooLarge];
  if (unread.length > 0) {
    lines.push('');
    lines.push(`Not fully read, so not counted as safe: ${unread.join(', ')}.`);
  }
  lines.push('');
  lines.push(result.access.note);
  lines.push('Reviewed on this machine with no network requests. This report holds no secret values.');
  lines.push(`To see these findings in your editor as you change the files: ${INSTALL_URL}`);
  return lines.join('\n');
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
