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
│   └── survey/           Official survey provider and background browser worker
├── tests/                Unit, integration, and E2E coverage
├── docs/
│   ├── design/           Accepted interface concept
│   └── RESEARCH.md       Provider and survey decisions
├── .data/                Private runtime files (gitignored)
└── PROGRESS.md           Living milestone tracker
```
