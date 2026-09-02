# Design System — JupitrrCut "Studio Pop"

Approved 2026-07-27 via design consultation. Preview artifact:
`~/.gstack/projects/Jupitrr-ai-teleprompter/designs/design-system-20260727/studio-pop-preview.html`

## Product Context
- **What this is:** iOS teleprompter + auto jump-cut recording app. Script → prompter record scene-by-scene → auto-stitched final cut → publish/sync to Jupitrr VideoOS.
- **Who it's for:** Content creators, coaches, and consultants making talking-head videos (YouTube/TikTok/courses).
- **Space:** Creator video tools (BIGVU, Captions, Teleprompter Pro, Descript). The category is visually blue/black-and-white and utilitarian.
- **Project type:** Native mobile app (Expo/React Native, NativeWind).

## North Star
**Creator energy.** The one thing to remember: this app feels made for the creator economy — bold, confident, alive — while staying a serious tool. Every choice below serves that.

## Aesthetic Direction
- **Direction:** "Studio Pop" — bold creator energy on clean surfaces. Big confident type, one brand blue doing the everyday work, coral reserved exclusively for live moments, studio-dark camera surfaces, chunky rounded shapes, springy motion.
- **Decoration level:** intentional — energy comes from type weight, the coral rule, and motion.
- **Onboarding & paywall exception (owner decision, 2026-08-13):** the acquisition surfaces run
  warmer than the product. They use a dotted paper backdrop (`#F9F9F8` with `#E3E1E0` dots on a
  20pt grid), pale per-card gradient tints, decorative header-icon hues (orange/green/purple 500)
  and an italic Libre Baskerville accent on one word per headline — mirroring the marketing site.
  **Coral is excluded from all of it**: the rule below still holds everywhere. Product screens
  (record, review, clips, settings) stay on the restrained system — do not spread this inward.
- **Mood:** "I recorded once and it came out like an edited video." Confident, warm, a little playful, never childish.

## Color
- **Approach:** restrained-plus-one. Blue is the brand and does all everyday work; coral has exactly one meaning.
- **Primary — Jupitrr Blue:** `#3C3FEF`. Buttons, active states, links, FAB, selected chips/tabs. Pressed shade `#3235D6`. Tint `#EEF2FF`.
- **Live — Coral:** `#EE6061` (Jupitrr's brand coral). **Sacred rule: coral appears ONLY when something is live or being celebrated** — "Recording" status accents outside the camera, the wrap-screen payoff. Never decoration, never a second accent. Tint `#FDEEEE`, deep `#C94A4B` (text-on-tint).
- **Camera red:** the record button and REC timer pill on the camera screen use iOS system red `#FF3B30` to mimic the native Camera app (owner decision, 2026-07-27). Coral is NOT used on the camera overlay.
- **Do NOT use** the navy `#292D8D` in this app (explicit owner decision, 2026-07-27).
- **Ink:** `#181A22` primary text, `#4E5265` secondary, `#8A8FA3` tertiary/muted, `#98A2B3` disabled.
- **Surfaces:** `#FFFFFF` paper on a cool app backdrop `#F4F6FB`, `#F4F6FB` subtle fills, `#E6E9F4` hairlines/borders, `#EAECF0` disabled fills.
- **Studio dark:** `#0E0D0F` for record/review/camera surfaces (with `#1C1A1E` raised elements, white text). This is the pro-gear layer.
- **Semantic:** success `#1E9E6A`, warning `#D97706`, error/destructive `#DC2626` (always paired with an icon so it never reads as brand coral), info = primary blue.

## Typography
- **Display/Hero:** CircularStd **Black (900)** — screen titles, oversized scene numerals, celebration headlines. Tracking slightly tight (-0.02em feel).
- **Headings/Buttons:** CircularStd **Bold (700)**.
- **Body/UI:** CircularStd **Book (400)** / **Medium (500)** for emphasis.
- **Timecodes/Counters:** **JetBrains Mono** (400/600) — every duration, timecode, scene count, WPM readout, resolution. This is a brand signature ("studio gear"), not an option.
- **Prompter text:** unchanged — the 5 user-selectable Google fonts (Varela Round, Nunito, Open Sans, Lato, Raleway) are a user-facing feature, not chrome.
- **Loading:** bundle CircularStd otf files (from `landing/assets/fonts/`) via `expo-font`; JetBrains Mono via `@expo-google-fonts/jetbrains-mono`. ⚠️ Verify the CircularStd (Lineto Circular) license covers mobile app embedding before shipping.
- **Scale (pt):** display 34 / title 28 / heading 22 / body 17 / secondary 15 / caption 13 / micro 11. Oversized scene numerals may go 48–56 as a design element.

## Spacing
- **Base unit:** 4px. **Density:** comfortable.
- **Scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Tap targets:** 44×44pt minimum, always.

## Layout
- **Approach:** grid-disciplined screens with one editorial signature: oversized scene numerals ("SCENE 03") on record/review surfaces.
- **Screen gutter:** 16px standard.
- **Border radius:** sm 12 / md 16 (cards) / lg 20 (sheets, hero surfaces) / full 999 (pills, FAB, icon buttons). Chunky-rounded is the house shape; no sharp corners.
- **Cards:** white on subtle, 1px `#E6E9F4` border, soft shadow. One loud (filled) button per screen; everything else tinted, ghost, or bordered.

## Motion
- **Approach:** intentional-playful. Springy micro-interactions; motion communicates state, then gets out of the way.
- **Signatures:** record button pulses while live; chips pop (spring scale) on select; wrap screen fires confetti once (blue/coral/amber/green mix).
- **Easing:** springs for interactive feedback; ease-out enter / ease-in exit for transitions.
- **Duration:** micro 50–100ms, short 150–250ms (default), medium 250–400ms. Nothing over 400ms except the one-shot celebration.

## Implementation Mapping (NativeWind)
Tokens live in `tailwind.config.js`. Current → target:
- `primary` = `#3C3FEF` (exists; keep DEFAULT/pressed/tint; **remove `primary.dark` `#292D8D`**).
- Add `live` = `{ DEFAULT:'#EE6061', deep:'#C94A4B', tint:'#FDEEEE' }`.
- `ink` scale → `#181A22 / #4E5265 / #8A8FA3` (+ disabled `#98A2B3`).
- `surface` → `{ DEFAULT:'#FFFFFF', subtle:'#F4F6FB', line:'#E6E9F4', disabled:'#EAECF0' }`.
- Add `studio` = `{ DEFAULT:'#0E0D0F', raised:'#1C1A1E' }`.
- Fonts: `font-display`/`font-sans` → CircularStd weights, `font-mono` → JetBrainsMono.
Shared components: `shared/components/ui/` (Icon, Button, IconButton). Icons: Ionicons via the semantic `Icon` map.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-27 | Initial system created ("Studio Pop") | Design consultation; north star = creator energy |
| 2026-07-27 | Primary stays Jupitrr blue `#3C3FEF`, font CircularStd | Owner decision: keep family brand; corrected from proposed `#5A6BFA` |
| 2026-07-27 | Navy `#292D8D` banned in this app | Owner decision |
| 2026-07-27 | Coral `#EE6061` = "live" only | One color, one meaning — the core de-slop rule |
| 2026-07-27 | Mono timecodes everywhere | Studio-gear credibility signature |
