# LLMs are called through the Vercel AI SDK, with OpenRouter's EU endpoint as the default provider

The product must not depend on one model vendor, and model choice per pipeline step will be settled by benchmarks.
Our code calls models only through the Vercel AI SDK, and each pipeline step names its model in configuration.
The default provider behind it is OpenRouter's EU in-region endpoint (`eu.openrouter.ai`, Business plan), which keeps requests inside the EU and routes only to EU-hosted model endpoints, with data collection denied and zero data retention enforced on every request.
A high-volume step can move to a direct EU provider endpoint (for example to avoid OpenRouter's fee or to control prompt caching) by configuration, without code changes.
