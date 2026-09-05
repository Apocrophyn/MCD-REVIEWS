---
name: Receipt Relay
description: A warm paper receipt desk for capture, review, and explicit approval.
colors:
  ink: "#242521"
  muted: "#6c6d65"
  line: "#e1e0d8"
  paper: "#f5f3ee"
  surface: "#fffefa"
  soft: "#eeeee7"
  charcoal: "#20231f"
  icon-well: "#232622"
  red: "#c9412e"
  red-dark: "#ad3322"
  red-soft: "#fbece7"
  green: "#35674b"
  green-soft: "#edf4ed"
  blue: "#476274"
  blue-soft: "#edf2f5"
  amber: "#805c23"
  amber-soft: "#f7f0de"
typography:
  display:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "clamp(36px, 4.25vw, 58px)"
    fontWeight: 550
    lineHeight: 1.13
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "clamp(32px, 3.8vw, 48px)"
    fontWeight: 550
    lineHeight: 1.13
    letterSpacing: "-.04em"
  title:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "13px"
    lineHeight: 1.85
  label:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "11px"
    fontWeight: 550
  button:
    fontFamily: "Sora Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.55
rounded:
  badge: "5px"
  compact: "6px"
  choice: "7px"
  input: "8px"
  button: "9px"
  inset: "10px"
  navigation: "12px"
  surface: "16px"
  circle: "50%"
spacing:
  tight: "6px"
  small: "8px"
  control: "12px"
  inset: "16px"
  section: "20px"
  page-mobile: "22px"
  panel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "#fff"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "11px 17px"
  button-primary-hover:
    backgroundColor: "{colors.red-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "11px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  button-text:
    textColor: "{colors.red}"
    typography: "{typography.label}"
    padding: "0"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    size: "42px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "12px"
  navigation:
    rounded: "{rounded.navigation}"
    padding: "8px 12px"
  status-completed:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "20px"
  icon-well:
    backgroundColor: "{colors.icon-well}"
    textColor: "#f8f8f0"
    rounded: "{rounded.circle}"
    size: "38px"
---

# Design System: Receipt Relay

## Overview

**Creative North Star: "The readable receipt desk"**

Warm paper surfaces, deep charcoal structure, and restrained red actions support a focused receipt workflow. Locally bundled Sora and circular black glass icon wells give the interface its identity. The glass character comes from opaque surfaces and static inset highlights.

This record describes the built React interface in `src/styles/app.css` and `src/components/`, with the local font import in `src/main.tsx`. The user-confirmed direction contract in `index.html` overrides concept seed `8b030ba4`; the older concept PNG is evidence only. The app retains capture, photo quality review, receipt confirmation, Queue, History, and Settings.

**Key Characteristics:**

- Warm paper and charcoal structure with red task actions.
- One variable font, compact operational text, and larger task headings.
- Circular black icon wells with static highlights.
- Responsive forms, visible focus, and explicit action states.

## Colors

The palette pairs warm neutrals with a single red brand accent; green, blue, and amber communicate status.

### Primary

- **Receipt Red** (`red`): primary actions, selected satisfaction, active mobile navigation, and keyboard focus.
- **Deep Receipt Red** (`red-dark`): hover feedback and stronger attention text.
- **Red Wash** (`red-soft`): failed or attention-needed states and invalid fields.

### Neutral

- **Paper** (`paper`): application canvas, active desktop navigation, and mobile navigation.
- **Clean Paper** (`surface`): working panels and bordered controls.
- **Soft Paper** (`soft`): quiet hover feedback.
- **Charcoal** (`charcoal`): fixed desktop navigation.
- **Black Glass** (`icon-well`): recurring opaque icon backgrounds; navigation and camera wells use darker local variants.
- **Ink** (`ink`): main text.
- **Muted Ink** (`muted`): supporting explanations and field labels.
- **Paper Line** (`line`): panel borders and list dividers.

Semantic pairs are **Completion Green** (`green` / `green-soft`), **Information Blue** (`blue` / `blue-soft`), and **Concern Amber** (`amber` / `amber-soft`). Green also marks confirmed selections and consent. Blue marks informational and ongoing automation states. Amber marks quality, setup, and medium-confidence concerns. Labels and icons accompany status colors.

**The State Has Meaning Rule.** Use semantic tones for the state they name; red remains the action accent and the attention/error family.

## Typography

**Display and Body Font:** Sora Variable, with a sans-serif fallback. `@fontsource-variable/sora/wght.css` bundles the font locally; no external font request is required.

The hierarchy relies on variable weights and scale within one family. Headings use balanced wrapping, while paragraphs use pretty wrapping.

### Hierarchy

- **Display:** Home task heading, with the desktop values in frontmatter. On phones it becomes `clamp(33px, 7.7vw, 44px)` with a line height of (1.16); the narrowest layout uses (31px).
- **Headline:** Queue, History, and Settings headings, becoming (34px) on phones.
- **Focused heading:** photo review and editor titles use (27px), weight (550), and tracking (-.035em); phone titles use (22px), then (20px) at the compact breakpoint.
- **Title:** repeated section headings use (14px) and weight (600); editor section headings become (15px) on phones.
- **Body:** introductory descriptions use the frontmatter body role, capped at (65ch). Operational descriptions vary between (11px) and (12px), usually with line heights from (1.7) to (1.8).
- **Label:** field labels and text actions share the compact label role. Metadata and badges are smaller, but those sizes are not a general reading-text standard.
- **Form values:** desktop fields use (12–13px). Phone text inputs, textareas, and selects generally use (16px); item-row inputs drop to (14px) at the compact breakpoint. Numeric values, confidence, and counts use tabular numerals.

**The Local Type Rule.** Use the bundled variable Sora family throughout the interface and preserve the distinction between task headings, working text, and supporting metadata.

## Layout

The desktop shell has a fixed charcoal sidebar (232px) and a paper workspace. The header is at least (91px) tall, with horizontal margins of (46px). Standard pages are centered up to (1400px), with padding of (55px 46px 64px). Home caps at (1220px); focused workflows cap at (1600px). Editor side padding is normally (32px).

Spacing uses repeated small gaps around controls, larger panel padding, and ruled rows to organize dense information. Home places capture and recent activity in two columns when room permits. Quality review uses two columns; settings pairs two sections. These are responsive screen arrangements rather than mandatory compositions for new pages.

| Viewport rule | Built behavior |
| --- | --- |
| At least 1650px | Editor uses four columns: receipt, details, experience, and actions. Actions become a vertical column. |
| 1251–1649px | Editor uses three main columns, with actions spanning below. |
| At most 1250px | Sidebar becomes 210px; page gutters become 30px. Editor becomes two columns: receipt and details on the left, experience on the right, actions below. |
| At most 1000px | Home and Settings stack; Home caps at 710px. Editor sections become one column in receipt, details, experience, actions order. |
| At most 760px | Sidebar disappears. Regular pages get four-item bottom navigation and safe-area padding; focused workflows hide that navigation and the workspace header. Quality review stacks. Page gutters become 22px. |
| At most 370px | Gutters become 16px. Survey detail and attribute-rating pairs stack; compact item rows tighten. |

The phone focused-workflow header is sticky on the opaque paper canvas. Bottom navigation and toasts account for safe-area insets. The document minimum width is (320px). Dense grids use shrinking columns and wrapping text to fit real receipt content.

**The Content Before Columns Rule.** Collapse the editor before its form controls lose usable width; keep the action section in the same reading order when it moves.

## Elevation & Depth

Paper panels use tonal separation and one-pixel borders. The recurring sculpted depth belongs to the black icon wells. The ordinary well combines an upper inset highlight, a darker lower inset, and a short ambient shadow. The larger camera well deepens that same treatment. Toasts carry a small ambient shadow.

Exact shadow and motion values live in `.impeccable/design.json`. Controls transition background, border, and text colors over (150ms ease-out); button press feedback moves down (1px). Progress uses (300ms ease-out), toast entry uses (180ms ease-out), and working spinners rotate over (900ms). Reduced-motion preference disables animations and transitions.

**The Static Glass Rule.** Build icon depth with opaque fill and static inset highlights. Do not introduce blur, backdrop filters, or gradients.

## Shapes

Working panels use the surface radius. Navigation and inset areas use the smaller navigation radius; primary and secondary buttons use their dedicated button radius. Inputs use the input radius, while compact options and status labels step down further. Borders stay thin and quiet.

Icon wells and back buttons are true circles. Standard wells are (38px), compact navigation and section wells are (32px), and camera capture uses a larger well. Keep the existing three-bar brand symbol in its circular well; asset provenance is recorded in `brand-spec.md`.

## Components

### Buttons

Primary and secondary buttons share padding, medium weight, and a minimum height of (48px), increasing to (50px) on phones. Primary actions use red with white text and darken on hover. Secondary controls use the clean paper surface and a muted border, becoming soft paper on hover. Text actions use red; destructive links use the darker red.

Disabled controls use opacity (.5) and a not-allowed cursor. Enabled primary and secondary controls translate down (1px) while pressed. Global keyboard focus uses a red outline (3px) with offset (4px). Back buttons use circular paper controls with a quiet border.

### Chips

Status labels are compact rectangles with softened corners and semantic foreground/background pairs. Confidence uses the same semantic families with tabular numeric text. Selectable attributes have a border, a green selected state, and a minimum height of (44px) on phones. Satisfaction choices use numbered circles that fill red when selected.

### Cards / Containers

Capture, receipt details, experience, and actions use opaque working surfaces and thin paper-line borders. Repeated panel padding is (20–24px), with tighter phone padding. Queue, History, recent activity, and settings mainly use ruled rows rather than nested cards. Error, quality, and automation panels use the corresponding semantic wash.

### Inputs / Fields

Receipt details and line items use quiet, borderless values within ruled rows. Standalone inputs, search, textareas, and selects use thin borders and softly rounded corners. Textareas resize vertically. Invalid receipt inputs use a red inset outline and red wash; placeholders retain muted ink at full opacity.

Phone controls increase type size and touch height. Keep visible labels and the shared focus treatment. Do not copy the narrowest metadata sizes into new form guidance.

### Navigation

Desktop navigation uses muted text on charcoal, compact black wells, and paper-filled active items. The active queue badge is red. On phones, Home, Queue, History, and Privacy occupy the bottom bar; Privacy opens Settings. Active phone labels use deep red, with a pale warm icon tint. Workflow screens use the focused header and explicit back control.

Queue badges reflect real pending work. History remains a distinct completed-receipt view; visible counts must describe the displayed records.

### Capture and Receipt Evidence

Capture pairs a dashed target with a large camera well, red call to action, and a separate gallery action. Receipt review displays the uploaded image with `object-fit: contain` and quality indicators. Keep receipt imagery functional and data-backed; no new shipping raster artwork belongs to this design record.

## Do's and Don'ts

### Do:

- Do use warm paper for the workspace and charcoal for desktop navigation.
- Do retain local Sora, the three-bar brand symbol, and circular black icon wells.
- Do pair semantic status colors with explicit text or icons.
- Do collapse the editor according to available content width and preserve visible focus.
- Do honor reduced motion and mobile safe-area insets.
- Do show actual receipt data and counts that match the displayed view.

### Don't:

- Don't use blur, backdrop filters, or gradients.
- Don't turn static icon highlights into glass effects that sample the page behind them.
- Don't replace explicit approval, consent, or error states with decorative feedback.
- Don't treat browser-only synthetic receipt fixtures or the prior concept PNG as approved shipping content.
- Don't promote unusually small metadata into the default reading or form-label scale.

Not canonized: the smallest capture-format notes and compact metadata (7–9px) remain implementation details with legibility limits, not a reusable text standard. The prior concept PNG and synthetic review receipts are evidence, not design assets or production content.

