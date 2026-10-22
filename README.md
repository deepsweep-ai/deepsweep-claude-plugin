# DeepSweep for Claude Code

See what the Claude Code settings, MCP configs and agent instruction files in a
project allow, and what to change. The review looks at permission rules, MCP
servers, and credentials written into agent files, in the project Claude Code has open.
It runs on your machine, makes no network requests, writes nothing, and never
prints a credential's value.

## Where the review runs

Run the review in Claude Code, including the terminal, IDE integration, or the desktop Code tab, with the project folder open. A chat in Claude.ai cannot inspect the configuration files on your computer. In chat, use it to discuss a report you already ran; do not upload configuration files or credentials. Cowork access depends on the folders granted to that task and is not the same as your Claude Code environment.

## Install

In a current version of Claude Code, run these two commands in a session:

```text
/plugin marketplace add deepsweep-ai/deepsweep-claude-plugin
/plugin install deepsweep@deepsweep
```

The plugin needs Node.js 20 or later on `PATH`. Its declared local MCP server runs the review in the project Claude Code has open. No additional workspace setup is required. To turn it off, run `/plugin disable deepsweep@deepsweep`; to remove it, run
`/plugin uninstall deepsweep@deepsweep`. Fixes Claude made with your approval stay in your files
after you remove the plugin.

## Use it

In Claude Code:

- `/deepsweep:review` shows the five most important findings, each with
  `file:line` and a one-line fix. `/deepsweep:review all` lists every finding.
- Or ask in your own words: "is my Claude Code setup safe?", "can my agent push
  without asking?", "is this MCP server pinned?", "did I leave a key in
  CLAUDE.md?". Claude runs the same review and answers from its findings.
- `/deepsweep:bulletins` shows DeepSweep's current security bulletins: severity,
  summary, the fix and a link for each, then the status of each published
  commitment. One public page. It reads the feed at
  https://deepsweep.ai/advisories/v1/feed.json, at most once an hour in a
  session. If the feed cannot be read, it shows the copy bundled with the plugin
  and says newer bulletins may exist. It runs only when you type it.

### Review one supported project file

Ask, for example, “Review only .mcp.json and return JSON”, “Review
.claude/settings.json as a public summary”, or “Check AGENTS.md for written
credentials and return SARIF”. The local tool can select one of the same nine
project files listed below. It derives the kind from the filename and reads
only that file. It cannot select another root, arbitrary documents or home
settings. No shell command is needed.

This selected-file review accepts a deliberately narrower set of configuration
fields than the project overview. Unknown fields, malformed input, invalid UTF-8,
files over 256 KiB, and symlinks below the project root produce an unassessed error.
A valid configuration for your editor can still be unsupported by this review;
unsupported does not mean safe or insecure. Reports over 1 MiB are refused.

Choose Markdown (the default), JSON, SARIF or a public summary. The first two and
the public summary omit filenames, server names and raw configuration. The public
summary also omits detailed findings and source lines. SARIF includes the selected
project-relative filename and finding lines. None is a safety certificate.
Instruction files are checked for known credential patterns only, not prompt
injection. Review a report before sharing it; the plugin never uploads it for you.

Claude offers to make a fix and changes nothing until you say yes.

Example, on a deliberately risky test project:

```text
DeepSweep agent access review: risky (this project only)
11 findings: 2 critical, 5 high, 4 medium

1. CRITICAL  .mcp.json:7
   GitHub token written in plain text (server "github", env GITHUB_PERSONAL_ACCESS_TOKEN). Any agent or tool that can read the file can read it.
   Fix: Replace it with an environment variable reference such as ${API_TOKEN}, then rotate it.
2. CRITICAL  AGENTS.md:5
   AWS access key written in plain text in an agent instruction file. Agents that load this file send its text to their model.
   Fix: Delete it from the file and rotate it; name the environment variable that holds it instead.
3. HIGH  .claude/settings.json:5
   This file allows any shell command without asking (allow rule Bash(*)). A deny or ask rule elsewhere takes precedence over it.
   Fix: Allow only the exact commands you need, such as Bash(npm test).
...
```

## What it checks

- **Claude Code settings**: `defaultMode: bypassPermissions`, allow rules that
  permit any shell command or a command that acts outside the project (push,
  publish, deploy, destroy), `additionalDirectories` that reach your home folder
  or the whole disk, `enableAllProjectMcpServers`, and PreToolUse hooks that
  answer "allow".
- **MCP servers** (`.mcp.json`, the Cursor and VS Code project configs):
  packages and images not pinned to a version, remote servers with no sign-in
  configured, and filesystem servers given your home folder or the whole disk.
- **Credentials written in files**: known token formats, private keys and
  passwords inside URLs in `CLAUDE.md`, `AGENTS.md` and similar files; literal
  values in MCP server `env`, headers, URLs and arguments, and in a settings
  file's `env`.

### What a finding means

A finding is what a file configures. What Claude Code actually allows also
depends on managed policy, settings files this review does not read, the
permission mode a session starts in and the Claude Code version, and the review
sees none of those. So it never says what Claude Code will do, and gives no
score. Fixing a finding removes a setting that allows more than it needs to;
it is not a safety certification.

It does not look anything up online, so it cannot say whether a package is
known to be malicious; it says whether it is pinned.

## Review scope

The local server reads only the fixed project paths below. It does not inspect your home-folder settings, follow links outside the project, accept arbitrary paths or commands, or edit files. Unreadable, oversized, and invalid configuration files are reported as coverage gaps. It is a local read-only tool, not an operating-system sandbox: do not run it against files a hostile process is changing concurrently.

The server reports what files configure, not effective access or a security certification. Claude chat cannot run this local server; use the Claude Code terminal, IDE integration, or desktop Code tab.

## Privacy

- **Network**: the review makes no network calls. The MCP connection is local standard input/output. The plugin makes one request, and only when you run `/deepsweep:bulletins`. It reads https://deepsweep.ai/advisories/v1/feed.json, a public page. It sends no project, file or account details and follows no redirect. The final package is checked to contain that request and no other outbound network API.
- **Writes**: none. The review only reads the files listed below.
- **Credential values**: read only to recognise their kind, then dropped. The
  report and the JSON output hold the file, line, key name and kind (for
  example "GitHub token"), never the value.
- **Your conversation**: the report becomes part of your Claude Code
  conversation, like the output of any command you run there, and Claude Code
  sends the conversation to the model as usual. The report holds file names,
  line numbers and setting names, never secret values.
- **Telemetry**: none.

### What it reads

These are every path the review touches. The list is generated from a trace of
a real review, and the test suite fails if it falls out of date. A path that
does not exist is only checked for; it is not created.

<!-- reads:start (generated from a trace of a real review; do not edit by hand) -->

**In the project folder** (9 paths):

- `.claude/CLAUDE.md`
- `.claude/settings.json`
- `.claude/settings.local.json`
- `.cursor/mcp.json`
- `.mcp.json`
- `.vscode/mcp.json`
- `AGENTS.md`
- `CLAUDE.local.md`
- `CLAUDE.md`

**In your home folder**: none. This review is project-only.


<!-- reads:end -->

## Requirements

Node.js 20 or later on `PATH` (`node`). The plugin ships its dependencies and installs no packages. If the local MCP server cannot start or the host does not provide a project directory, no review runs. Check `/mcp` in Claude Code and restart after installing Node.

## Help

Questions or problems: https://deepsweep.ai/support. Please do not send credentials or whole
configuration files; the file name, line and finding text are enough.

## In your editor

The DeepSweep editor extension shows these agent-access findings as you change
the files: https://deepsweep.ai/install

## Bundled dependencies

The local MCP server includes the official Model Context Protocol SDK and its pinned dependencies. Their notices are included in `THIRD-PARTY-NOTICES.md`. No dependency is downloaded when the server runs.

## Licence

DeepSweep proprietary (see `LICENSE`). You may install and use the plugin; the
readable source grants no right to copy, modify or reuse it.
