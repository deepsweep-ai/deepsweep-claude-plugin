---
name: review
description: Review what the Claude Code settings, MCP configs and agent instruction files in this project allow (permission rules, MCP servers, credentials written into agent files) and show the top findings, each with file:line and a one-line fix. Reads locally without changing files. Results appear in your Claude conversation.
argument-hint: "[all]"
disable-model-invocation: true

allowed-tools: mcp__plugin_deepsweep_deepsweep__review_agent_configuration
---

# DeepSweep project configuration review

Call `mcp__plugin_deepsweep_deepsweep__review_agent_configuration` to review the project Claude Code has open. Set `all` to true only when the user requests all findings. The tool reviews project files only; it does not inspect user-level settings.

If the tool is unavailable or returns an error, say no review ran. Do not run shell commands, inspect files yourself as a substitute, or invent findings. Claude chat cannot run this local server.

Present the returned report faithfully, including unreadable or oversized files and the configured-access limitation. Cite file:line and the supplied fix. Never include credential values. Offer to make a fix only with the user's agreement and show the exact change first. Removing a written credential does not revoke it; recommend rotation.
