---
name: review
description: Review what the Claude Code settings, MCP configs and agent instruction files in this project allow (permission rules, MCP servers, credentials written into agent files) and show the top findings, each with file:line and a one-line fix. Reads locally without changing files. Results appear in your Claude conversation.
argument-hint: "[all]"
disable-model-invocation: true

allowed-tools: mcp__plugin_deepsweep_deepsweep__review_agent_configuration, mcp__plugin_deepsweep_deepsweep__review_project_artifact
---

# DeepSweep project configuration review

When the user requests just one supported project file or a JSON, Markdown, SARIF or public summary of that file, call `mcp__plugin_deepsweep_deepsweep__review_project_artifact` with its exact `file` enum and requested `format` (default Markdown). The file must be one of the tool's nine listed project files; do not inspect other files or choose a substitute. Kind is inferred by the server. This narrower review refuses unsupported fields and files over 256 KiB; an unassessed error is not a clean review. Instruction files get credential-pattern checks only, never a prompt-injection verdict. Return the selected report faithfully; do not augment a public summary with detailed findings. SARIF intentionally includes the selected relative filename. Sharing or uploading a report is a separate user action.

Otherwise, call `mcp__plugin_deepsweep_deepsweep__review_agent_configuration` for a project overview. Set `all` to true only when the user requests all findings. This tool reviews project files only; it does not inspect user-level settings. Do not call the overview tool for a single-file request.

If the tool is unavailable or returns an error, say no review ran. Do not run shell commands, inspect files yourself as a substitute, or invent findings. Claude chat cannot run this local server.

Present the returned report faithfully, including unreadable or oversized files and the configured-access limitation. Cite file:line and the supplied fix. Never include credential values. Offer to make a fix only with the user's agreement and show the exact change first. Removing a written credential does not revoke it; recommend rotation.
