#!/usr/bin/env node
/**
 * DeepSweep agent access review for Claude Code. Runs locally; reads only the
 * files listed in README "What it reads"; makes no network requests.
 *
 * Invoked by the plugin's skills, never installed on PATH.
 *   --project <dir>   project to review (default: $CLAUDE_PROJECT_DIR, else cwd)
 *   --format text|json
 *   --all             list every finding (text format)
 *   --no-user         skip user-level files (~/.claude/settings.json, ...)
 *   --home <dir>      home directory to read user-level files from (tests)
 * Exit code: 0 whenever a report was produced (findings are not errors),
 * 2 for a usage error.
 */
import { homedir } from 'node:os';
import { runReview } from './lib/run.mjs';
import { renderJson, renderText } from './lib/render.mjs';

function parseArgs(argv) {
  const opts = { format: 'text', all: false, includeUser: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) { throw new Error(`${a} needs a value`); }
      return v;
    };
    switch (a) {
      case '--project': opts.project = value(); break;
      case '--format': opts.format = value(); break;
      case '--all': opts.all = true; break;
      case '--no-user': opts.includeUser = false; break;
      case '--home': opts.home = value(); break;
      case 'all': opts.all = true; break; // `/deepsweep:review all`
      case '': break; // an empty substituted argument
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  if (opts.format !== 'text' && opts.format !== 'json') { throw new Error('--format must be text or json'); }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`deepsweep review: ${err.message}\n`);
  process.exit(2);
}

const projectDir = opts.project || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const home = opts.home || process.env.HOME || homedir();
const result = runReview({
  projectDir,
  home,
  includeUser: opts.includeUser,
  claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
});

process.stdout.write(`${opts.format === 'json' ? renderJson(result) : renderText(result, { limit: opts.all ? 0 : undefined })}\n`);
