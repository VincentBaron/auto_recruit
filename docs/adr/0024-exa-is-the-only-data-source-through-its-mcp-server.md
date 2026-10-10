# Exa is the only data source in v0, reached through its hosted MCP server

People, companies, Signals, Detected Roles and phone numbers all come from Exa in v0, and Claude reaches Exa through Exa's hosted MCP server (with its advanced search and `agent_run` tools enabled), so there is no integration code to write or maintain.
Exa Agent returns phone numbers at about $0.07 per number found, far cheaper than dedicated providers, but it does not document where numbers come from and its French mobile coverage is unknown; the first Batches will tell, and a dedicated phone provider can be added behind the same Batch approval without changing the flow.
This reverses the earlier choice of calling Exa's API from our own backend, which only made sense for scheduled agents serving many agencies; scripts calling Exa's API come back if cost control or reproducible output is needed.
