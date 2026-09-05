# File structure

```text
.
├── src/                  React/Vite client
│   ├── components/       Reusable workflow and shell components
│   ├── lib/              Browser API, display helpers, preview-only demo backend
│   └── styles/           Liquid Glass tokens, material, and responsive layout
├── server/               Local API
│   ├── ai/               AI contract, Claude, disabled, and test-only providers
│   ├── domain/           Schemas, normalization, grounding, state rules
│   ├── survey/           Official survey provider and background browser worker
│   └── settings.ts       Encrypted local settings, including the model credential
├── tests/                Unit, integration, and E2E coverage
│   └── live/             Supervised run against the real Food for Thoughts survey
├── docs/
│   ├── design/           Accepted interface concept
│   └── RESEARCH.md       Provider and survey decisions
├── .data/                Private runtime files: uploads, survey screenshots, DB (gitignored)
└── PROGRESS.md           Living milestone tracker
```
