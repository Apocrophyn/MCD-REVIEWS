# Receipt Relay

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

A local, mobile-first receipt application: upload photos, check image quality, classify and extract real receipt details, confirm the visit and feedback, and explicitly approve background survey completion. Existing purpose and workflows are retained by the confirmed redesign brief.

## Users

People capturing restaurant receipts on a phone and reviewing their receipt and visit details on mobile or desktop. This usage hypothesis comes from the existing README and implementation; no broader audience is asserted.

## Capabilities and Constraints

- React and TypeScript client with an Express API and private local SQLite/image storage.
- Receipt recognition requires server-side Anthropic credentials. Disabled and failed states must remain honest.
- Survey submission requires confirmed answers and explicit terms acceptance. Preserve all privacy, consent, deletion, and automation behavior.
- Preserve Home, Queue, History, Settings, photo review, and receipt confirmation; keep existing form contracts and test selectors.
- Keep actual receipt data and existing product copy. Do not invent statistics, endorsements, or receipt examples.

## Brand Commitments

Receipt Relay retains its name and existing three-bar brand symbol. The user confirmed warm paper surfaces, deep charcoal structure, red accents, local Sora typography, circular black glass icon backgrounds, and restrained motion. Do not use backdrop filters or blur effects; achieve icon depth with static surface highlights.

## Evidence on Hand

README.md, AGENT.md, src/components, src/types.ts, and tests define current functionality. docs/design/receipt-relay-concept.png is the incumbent design reference, not a new approved comp.

## Accessibility & Inclusion

Maintain keyboard operation, visible focus, legible contrast, readable responsive forms, and reduced-motion behavior.
