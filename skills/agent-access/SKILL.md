---
name: agent-access
description: Use when the user asks whether their Claude Code or AI coding agent setup is safe, what an agent is allowed to do without asking, whether an MCP server is risky or unpinned, whether permissions or allow rules are too broad, or whether a key or token is exposed in CLAUDE.md, AGENTS.md, .mcp.json or settings.json. Runs DeepSweep's local review and answers from its findings.
user-invocable: false
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/scripts/review.sh:*), Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh":*)
---

# Agent access, from DeepSweep's local review

The review below ran on this machine. It read the Claude Code settings, MCP
configs and agent instruction files listed in the plugin README, at project and
user level, and sent nothing anywhere. It never prints credential values.

```!
sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh" --all
```

## How to answer

- If no actual DeepSweep report was produced, do not claim a review ran or invent findings. Explain that reviewing local configuration requires Claude Code with the project open; in chat, discuss only a report the user provides, never ask them to upload credentials or whole configuration files.

- If the output starts with `DeepSweep review NOT RUN`, show it to the user as written: nothing was
  reviewed. Do not present findings or a summary of your own.
- Answer the user's actual question from the findings above. Cite each one by
  its file:line and give its fix as written. If the review has no finding
  about what they asked, say that, and say what the review covers.
- Each finding is what a file configures. Do not tell the user what Claude
  Code will actually do: the review does not see managed policy, other
  settings, the session's permission mode or the version, and says so.
- For a credential written in a file, the advice is always: move it to an
  environment variable or secret store, then rotate it.
- Offer to make a fix; do not edit any file until the user agrees, and show
  the exact change first.
- For a JSON copy of the result, run
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh" --format json` with the Bash
  tool.
