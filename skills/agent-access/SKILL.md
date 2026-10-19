---
name: agent-access
description: Use when the user asks whether their Claude Code or AI coding agent setup is safe, what an agent is allowed to do without asking, whether an MCP server is risky or unpinned, whether permissions or allow rules are too broad, or whether a key or token is exposed in CLAUDE.md, AGENTS.md, .mcp.json or settings.json. Reads locally without changing files. Results appear in your Claude conversation.
user-invocable: false

allowed-tools: mcp__plugin_deepsweep_deepsweep__review_agent_configuration
---

# DeepSweep project configuration review

Call `mcp__plugin_deepsweep_deepsweep__review_agent_configuration` to review the project Claude Code has open. Set `all` to true for the complete list. The tool reviews project files only; it does not inspect user-level settings.

If the tool is unavailable or returns an error, say no review ran. Do not run shell commands, inspect files yourself as a substitute, or invent findings. Claude chat cannot run this local server.

Present the returned report faithfully, including unreadable or oversized files and the configured-access limitation. Cite file:line and the supplied fix. Never include credential values. Offer to make a fix only with the user's agreement and show the exact change first. Removing a written credential does not revoke it; recommend rotation.
