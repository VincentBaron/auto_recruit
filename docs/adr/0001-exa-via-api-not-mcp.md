# Call Exa through its API behind our own tools, not through the Exa MCP server

The original brief named the Exa MCP server as the search layer for the Prospection and Sourcing Agents.
The Exa MCP exposes generic web search and fetch by default, has deprecated its people and company search tools, and exposes neither Monitors nor webhooks.
Scheduled agents running for many Workspaces need structured people and company results, Monitors with webhooks for dated Signals, our own deduplication, and per-Workspace metering, so our backend calls Exa's API through typed tools that our agents use.
The Exa MCP remains acceptable for ad-hoc exploration from the chat panel.
