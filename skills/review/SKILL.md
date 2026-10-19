---
name: review
description: Review what the Claude Code settings, MCP configs and agent instruction files in this project allow (permission rules, MCP servers, credentials written into agent files) and show the top findings, each with file:line and a one-line fix. Runs on this machine; nothing is uploaded.
argument-hint: "[all]"
disable-model-invocation: true
allowed-tools: Bash(sh ${CLAUDE_PLUGIN_ROOT}/scripts/review.sh:*), Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh":*)
---

# DeepSweep review

The review below was produced on this machine by the DeepSweep plugin. It read
only the files listed in the plugin README and sent nothing anywhere.

```!
sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh"
```

## How to present it

- If no actual DeepSweep report was produced, do not claim a review ran or invent findings. Explain that reviewing local configuration requires Claude Code with the project open; in chat, discuss only a report the user provides, never ask them to upload credentials or whole configuration files.

- If the output starts with `DeepSweep review NOT RUN`, show it to the user as written: nothing was
  reviewed. Do not present findings or a summary of your own.
- Show the report above to the user as it is, in a code block. Do not restate
  it in other words, and do not add a grade or score of your own.
- If the arguments ask for `all`, run
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/review.sh" --all` with the Bash tool and
  show that output instead.
- After the report, offer in one sentence to make the first fix. Do not edit
  any file until the user says yes, and show the exact change first.
- If a finding is a credential written in a file, tell the user to rotate it
  even after it is removed: removing it from the file does not make it safe.
- Do not repeat the install link in your own words; the report already says
  where it leads.
