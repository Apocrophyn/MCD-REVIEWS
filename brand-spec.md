# Receipt Relay assets

The approved redesign retains the product name and original three-bar brand symbol. The symbol was extracted from the existing CSS geometry into [public/receipt-relay.svg](public/receipt-relay.svg), rendered through an image inside the shared circular black icon well.

- Interface font: locally bundled Sora Variable, from `@fontsource-variable/sora`. The dependency includes its font license. No runtime external font request.
- Icons: the existing `lucide-react` dependency, rendered with a consistent 1.7 stroke weight. Black circular wells use static inset highlights.
- Primary palette: paper `#f5f3ee`, charcoal `#20231f`, ink `#242521`, surface `#fffefa`, red `#c9412e`.
- Semantic colors: green for completion, amber for setup/quality concerns, muted blue for informational states.
- Incumbent reference: `docs/design/receipt-relay-concept.png`. This was inspected as evidence of the original UI, not as a replacement comp.
- Current rendered UI: local QA captures under `.impeccable/review/` (ignored). Receipt records and the receipt image in those captures are explicit browser-only test fixtures, never shipping content.

The shipping UI includes no generated raster artwork, stock imagery, or counterfeit receipt data. Uploaded receipt images continue to come from the receipt-scoped server endpoints.
