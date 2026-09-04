# Integration research

Last verified: 2026-09-04

## Claude authentication

Receipt Relay uses the official Anthropic Messages API with `ANTHROPIC_API_KEY` held by the server. Anthropic documents `x-api-key` authentication for image Messages API requests, and states that Claude.ai subscriptions and Console API usage are separate products. Receipt Relay therefore does not offer subscription OAuth, does not read claude.ai cookies, and does not accept browser session tokens.

The server uses a forced tool schema for receipt classification/extraction and feedback claims. `ANTHROPIC_MODEL` is configurable so model lifecycle changes do not require application code changes. The default is the current `claude-sonnet-5`; the previous `claude-sonnet-4-20250514` default was retired on 15 June 2026. Classification must report at least two visible receipt signals with at least 0.75 confidence before extraction is accepted. In local development, omitting the key disables AI actions without returning sample data; production requires an explicit key. A deterministic provider exists only under `NODE_ENV=test`.

Sources:

- https://docs.anthropic.com/en/docs/build-with-claude/vision
- https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console

## Food for Thoughts

McDonald’s UK describes Food for Thoughts as a receipt-based customer survey. Current offer terms require an eligible UK resident aged 18 or over to complete the survey at `mcdfoodforthoughts.com` within 60 days of a receipt containing a participation code. Eligibility and offer details can change, so the application links to the official page and does not promise a reward.

Receipt Relay runs a local Playwright/Chromium worker because the product requirement is to complete the survey without opening a third-party tab. After explicit approval and terms confirmation, the server creates a persistent job, launches an isolated Chromium window off-screen, and reports progress through local polling. The live survey currently does not render in Chromium's true headless mode; using the off-screen bundled browser keeps the survey UI out of the user's browser while preserving live compatibility. Jobs run one at a time so request pacing remains comparable to a person completing the form.

The worker interprets only visible labels needed to answer the current page and does not call private survey APIs or retain survey-page content. It submits only confirmed values, stops on unknown required questions, caps the page count, and treats CAPTCHA, access-denied, or human-verification pages as a blocked result. It does not disguise the browser or bypass survey protections. The survey terms prohibit false information, scraping, security interference, and automated request rates beyond what a human can reasonably produce; those restrictions directly shape these safeguards.

Sources:

- https://www.mcdonalds.com/gb/en-gb/help/faq/how-is-mcdonald-s-improving-on-customer-service-expectations.html
- https://www.mcdonalds.com/gb/en-gb/terms-and-conditions/food-for-thought-terms-conditions.html
- https://www.mcdfoodforthoughts.com/Projects/_globalconfigs/text/pdf/termsofservice/SMG_TOS_en-GB.pdf
