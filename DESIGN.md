# Design System: Electronic Products Platform (Arabic RTL Console)

## 1. Visual Theme & Atmosphere
A restrained, architectural Arabic RTL SaaS interface with balanced density (5/10), clear asymmetric workspace splits, and tactile micro-transitions. The atmosphere is clinical yet warm — calibrated neutral surfaces paired with a single deep emerald-teal accent, designed for clarity in high-trust administrative and commerce workflows.

## 2. Color Palette & Roles
- **Canvas Off-White** (`#F8FAFC`) — Primary application canvas background
- **Pure Surface** (`#FFFFFF`) — Elevated cards, tables, and control panels
- **Subtle Surface** (`#F1F5F9`) — Secondary tinted sections, group headers, inactive chips
- **Charcoal Ink** (`#18181B`) — Primary headings and body copy (never pure `#000000`)
- **Muted Slate** (`#64748B`) — Secondary metadata, helper captions, timestamps
- **Whisper Border** (`#E2E8F0`) — 1px structural dividers and container outlines
- **Deep Teal Accent** (`#0F766E`, hover `#115E59`) — Single primary accent for CTAs, active nav indicators, toggle switches, and focus rings (saturation < 80%, zero purple/neon glow)
- **Semantic Status Tokens** — Emerald (`#047857` / `#ECFDF5`) for active/effective, Amber (`#B45309` / `#FFFBEB`) for suspended/inherited notices, Crimson (`#B91C1C` / `#FEF2F2`) for destructive actions and danger zones

## 3. Typography Rules
- **Display & Body (Arabic RTL):** `Noto Kufi Arabic` — Tight display tracking, weight-driven hierarchy (`600`/`700` headings, `400`/`500` body), relaxed line height (`1.65`)
- **Technical / Identifiers / Counters:** Monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`) with `tabular-nums` and explicit `dir="ltr"` for permission codes, email addresses, and numeric counts
- **Banned:** `Inter`, generic serif fonts, emojis in UI chrome

## 4. Component Stylings
- **Buttons:** Crisp `rounded-lg` geometry, flat fill with tactile `active:scale-[0.98]` feedback, minimum `40px–44px` height, no outer neon glow
- **Cards & Panels:** `rounded-xl` to `rounded-2xl` surfaces with `1px solid #E2E8F0` and whisper shadow (`0 1px 2px rgba(15, 23, 42, 0.04)`)
- **Inputs & Search:** Label above input, helper text below, subtle border transitioning to Deep Teal focus ring (`ring-2 ring-primary/20 border-primary`)
- **Toggle Switches:** Custom accessible `role="switch"` controls with smooth `transform` thumb transitions for binary permission overrides
- **Navigation Rail:** Subtle off-white sidebar with monochrome outline SVG icons, active teal indicator pill, and grouped section titles

## 5. Layout Principles
- Asymmetric 12-column CSS Grid for detail workspaces (4-column sticky profile/role sidebar + 8-column permissions matrix)
- Strict single-column collapse below `768px` (`md` / `lg` breakpoints)
- `min-h-[100dvh]` for full-height shells (never `h-screen`)
- Max-width containment (`max-w-6xl`) with generous breathing room

## 6. Motion & Interaction
- Hardware-accelerated `transform` and `opacity` transitions (`duration-150` to `duration-200`)
- Tactile press states on interactive controls and smooth switch slides
- Inline contextual status banners (success/error) with clear dismissal

## 7. Anti-Patterns (Banned)
- No emojis anywhere in UI chrome
- No `Inter` font or generic serif fonts
- No pure black (`#000000`)
- No purple/blue neon glows or flashy gradients
- No fabricated metrics or fake placeholder numbers
- No 3-column equal generic card grids where asymmetric structure serves better
