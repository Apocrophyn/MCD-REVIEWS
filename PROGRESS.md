# PROGRESS.md

Last Updated: 2026-09-04

## Current Milestone

Receipt Intelligence MVP

Goal:

Upload receipt
→ validate image
→ extract receipt
→ identify items
→ show confidence
→ request another image when necessary.

---

## Status

Project Status: MVP DELIVERED

Current Phase: Phase 1 — Release Validation

---

## Done

* [x] Repository initialized
* [x] AGENT.md created
* [x] FILE_STRUCTURE.md created
* [x] PROGRESS.md created
* [x] Environment validation implemented
* [x] Database connected
* [x] Database migrations created
* [x] Testing framework configured

---

## Receipt Pipeline

* [x] Mobile camera upload
* [x] Gallery upload
* [x] Multiple image upload
* [x] File validation
* [x] Secure image storage
* [x] Image-quality assessment
* [x] AI receipt analysis
* [x] Non-receipt classification gate
* [x] No hardcoded development fallback
* [x] Structured receipt schema
* [x] Survey code extraction
* [x] Store extraction
* [x] Date/time extraction
* [x] Order number extraction
* [x] Item extraction
* [x] Item normalization
* [x] Confidence scoring
* [x] Low-confidence handling
* [x] Retake/add-image workflow
* [x] Receipt editing
* [x] Duplicate detection, including concurrent uploads

---

## Employee Recognition

* [x] Employee model
* [x] Employee creation
* [x] Employee search
* [x] Recent employees
* [x] Employee selection
* [x] Optional employee role

---

## Experience Confirmation

* [x] Service attributes
* [x] Food attributes
* [x] Satisfaction selection
* [x] Per-attribute ratings
* [x] Recommendation and return intent
* [x] Order type and problem confirmation
* [x] Optional free-text detail
* [x] Store confirmed facts with feedback draft

---

## Feedback

* [x] Claude generation
* [x] Grounding rules
* [x] Structured generation response
* [x] Unsupported-claim validator
* [x] Regeneration
* [x] Manual editing
* [x] Final user approval

---

## Queue

* [x] Persistent queue
* [x] Multi-receipt upload
* [x] State machine
* [x] Retry
* [x] Cancel
* [x] Archive
* [x] Failure handling

---

## Scheduling

* [x] Research job system
* [x] Choose local persistent reminder architecture
* [x] Schedule queue items
* [x] Persistent scheduled reminders
* [x] Failed-analysis recovery
* [x] Upcoming scheduled items view

---

## McDonald's Survey Integration

* [x] Research Food for Thoughts workflow and current terms
* [x] Document required receipt fields
* [x] Keep third-party question flow on the official site
* [x] Determine allowable automation level
* [x] Create SurveyProvider
* [x] Create McDonaldsFoodForThoughtProvider
* [x] Exclude private endpoint and brittle selector scraping
* [x] Persistent background automation jobs
* [x] Isolated off-screen Playwright/Chromium worker
* [x] In-app job progress and completion updates
* [x] Semantic field mapping
* [x] Automatic advance for fully answered pages
* [x] Stop on unknown required questions
* [x] Integration error handling
* [x] Explicit approval and terms acceptance before automated submission
* [x] Integration contract test

---

## Claude

* [x] Research current official authentication mechanisms
* [x] Verify subscription plans are separate from API access
* [x] Do not use claude.ai browser cookies/session tokens
* [x] Implement AIProvider interface
* [x] Implement ClaudeProvider
* [x] Receipt vision
* [x] Structured outputs
* [x] Feedback generation
* [x] Transient-error retries
* [x] Content-safe usage/error logging

---

## Mobile

* [ ] iPhone Safari physical-device sign-off
* [x] Android-size Chromium emulation
* [x] Camera capture input implemented
* [x] Small-screen layout tested at 390 px and Pixel 7 sizes
* [x] Keyboard-accessible controls and focus states
* [x] 44 px minimum primary touch targets
* [x] Slow-request loading and disabled states
* [x] Persistent upload recovery after refresh

---

## Security

* [x] Environment validation
* [x] Server-only AI credentials
* [x] Upload signature/decoder validation
* [x] Upload size and pixel limits
* [x] Rate limiting
* [x] Local-only server and receipt-scoped image access
* [x] Private directory and randomized file storage
* [x] Sensitive logging reviewed
* [x] Receipt deletion
* [x] Image deletion

---

## Testing

### Unit

* [x] Structured receipt schema/parser
* [x] Receipt normalizer
* [x] Duplicate detection
* [x] Queue state machine
* [x] Feedback grounding
* [x] Scheduling validation

### Integration

* [x] Receipt upload and retrieval
* [x] Database persistence and deletion
* [x] AI provider processing contract
* [x] Queue workflow
* [x] Scheduling

### E2E

* [x] Clear receipt at desktop and mobile viewports
* [x] Low-quality/cropped classification at the quality layer
* [x] Multiple receipt images at the API boundary
* [x] Duplicate receipt rejection
* [x] Clear non-receipt rejection without fabricated extraction
* [x] Employee selection at the integration boundary
* [x] Feedback generation
* [x] Survey preparation
* [x] Final approval
* [x] Background field mapping, page advance, submission, and completion detection

---

## In Progress

None.

---

## Next

1. Add a real Anthropic Console API key and perform a live receipt smoke test.
2. Perform a live background survey smoke test with an eligible receipt.
3. Complete physical-device sign-off in iPhone Safari.
4. Choose a deployment target if access beyond the local machine is required.

---

## Blocked

No implementation blockers. Live Claude validation requires an Anthropic Console API key. Live survey validation requires an eligible receipt; physical iPhone sign-off requires an iOS device.

---

## Known Bugs

None known.
