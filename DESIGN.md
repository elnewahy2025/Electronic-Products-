# Design System: Digital Products Marketplace (Arabic RTL)

## 1. Visual Theme & Identity
A clean, high-trust Arabic RTL marketplace & operations UI built for digital products (presentations, lesson plans, educational videos, documents, and downloadable assets). Preserves the platform's own brand identity (`NEXT_PUBLIC_APP_NAME`) while using the architectural clarity, color hierarchy, and layout geometry inspired by the reference HTML prototypes.

## 2. Color Palette & Roles (Light / Dark)
- **Canvas (`--background`)**: `#f3f5f7` / Dark `#0c1219`
- **Card Surface (`--card`)**: `#ffffff` / Dark `#141d27`
- **Primary Ink (`--foreground`)**: `#0f1b26` / Dark `#e8eef4` (also used for active sidebar pills)
- **Muted Text (`--muted-foreground`)**: `#5d6b78` / Dark `#92a1af`
- **Soft Surface (`--muted`)**: `#e9eef5` / Dark `#1b2733`
- **Hairline Border (`--border`)**: `#d8dee4` / Dark `#26323f`
- **Primary CTA (`--primary`)**: `#1457d9` / Dark `#6f9bff` (buttons, links, focus outlines)
- **Brand Header / Hero Surface (`--brand-surface`)**: `#0d3b32` / Dark `#0a2a24` (Storefront hero, Seller top bar, Admin top bar, brand emblem)
- **Semantic Badges**:
  - Success: `#17855b` on `#dff3ea` (Dark `#4cc796` on `#12372b`)
  - Warning: `#b87800` on `#fbefd2` (Dark `#f0b73a` on `#3a2d0c`)
  - Destructive: `#c93030` on `#fbe3e3` (Dark `#ff7b7b` on `#3d1a1a`)
  - Info: `#1457d9` on `#dfe9fc` (Dark `#6f9bff` on `#18284a`)

## 3. Typography
- **Font Family**: `IBM Plex Sans Arabic` (`400`, `500`, `600`, `700`), base `15px / 1.7`
- **Numeric / Code Isolation**: `.ui-num` / `.tabular-nums` (`direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums`)

## 4. Layout Shells
- **Storefront**: 60px sticky white header + `--brand-surface` Hero with instant search & inline quick-redeem bar + 16:10 product cards + 4-step "كيف أشتري؟" bar.
- **Buyer Account**: Sticky 210px sidebar (`--foreground` active pill) + KPI stats + green `.todo` active-download banner + recent orders list.
- **Seller Dashboard**: 58px `--brand-surface` top bar + sticky 205px sidebar + clean stat/row surfaces.
- **Admin Panel**: 56px `--brand-surface` top bar + sticky 230px grouped sidebar with live red pending badges + clickable KPI stats + unified `.ui-table-wrap` tables.
