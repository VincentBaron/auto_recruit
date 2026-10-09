# Prospection and Sourcing Agents are pipelines, not open-ended agent loops

Each agent run is a fixed pipeline (query generation, search, deduplication, LLM extraction, scoring, contact finding) with the LLM at the judgement steps and small capped loops inside a step, such as searching until enough results pass the Fit threshold or the budget runs out.
Open-ended agent loops are reserved for genuinely open tasks: Niche analysis, the chat panel and "find more like this".
Pipelines keep cost per outcome predictable, which our per-outcome Credit pricing depends on, and keep runs reproducible and explainable.
