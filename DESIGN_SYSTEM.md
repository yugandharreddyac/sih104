# VOXSHIELD — Official Enterprise Design System

**System Name:** VOXSHIELD Sentinel Design System (VSDS)  
**Version:** 2.0.0  
**Target Domain:** Enterprise Security Operations Center (SOC) & Voice Intelligence Platform  
**Design Philosophy:** Precision, High Information Density, Zero-Distraction Dark Mode, Predictable State Feedback, Deterministic Visual Hierarchy.

---

## 1. Design Tokens & Foundations

### A. Color Palette & Semantic Tokens
All color tokens are declared as CSS custom variables in `:root` / `[data-theme="dark"]` and `[data-theme="light"]`. Color values supporting opacity alpha channels use space-separated RGB coordinates (`r g b`).

#### 1. Surface & Background Tokens

| Token Variable | Dark Theme Value | Light Theme Value | Usage & Meaning |
| :--- | :--- | :--- | :--- |
| `--bg-main` | `#111318` | `#F5F6F8` | Main application background behind all content |
| `--bg-sidebar` | `#14171D` | `#FFFFFF` | Navigation sidebar background |
| `--bg-surface` | `#171A20` | `#FFFFFF` | Primary cards, panels, and tables |
| `--bg-surface-elevated` | `#1D2128` | `#F8F9FB` | Secondary nested cards, toolbars, table headers |
| `--bg-surface-hover` | `#232832` | `#EEF1F5` | Interactive row/button hover state |
| `--border-default` | `#2A3038` | `#E2E5EA` | Structural card borders and dividing rules |
| `--border-hover` | `#38404B` | `#CBD1DA` | Focused or hovered border state |

#### 2. Typography Color Tokens

| Token Variable | Dark Theme Value | Light Theme Value | Usage & Contrast Ratio |
| :--- | :--- | :--- | :--- |
| `--text-primary` | `#F2F4F7` | `#1A1D23` | Main headings, call numbers, key metrics (14.2:1) |
| `--text-secondary` | `#A7AFBA` | `#4B5565` | Field labels, table headers, descriptions (7.8:1) |
| `--text-muted` | `#737C88` | `#667085` | Timestamps, inactive metadata, helper text (4.8:1) |

#### 3. Semantic Status RGB Tokens (With Opacity Support)

| Semantic Role | CSS RGB Variable | Hex Equivalent | Subtle Fill Class (12% alpha) | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Primary (Brand / Tech)** | `79 110 247` | `#4F6EF7` | `bg-primary/12 text-primary` | Active selection, primary CTA, links |
| **Success (Authentic / Safe)**| `47 158 111` | `#2F9E6F` | `bg-success/12 text-success` | Verified caller, healthy service, allow action |
| **Warning (Suspicious / High)**| `185 133 37` | `#B98525` | `bg-warning/12 text-warning` | High risk, unverified identity, review queue |
| **Danger (Critical / Attack)** | `214 83 83` | `#D65353` | `bg-danger/12 text-danger` | Deepfake spoof, OTP solicitation, blocked |
| **Info / Telemetry** | `79 110 247` | `#4F6EF7` | `bg-info/12 text-info` | Acoustic spectrum data, system notices |

---

### B. Typography Scale
VOXSHIELD uses **Inter** for all UI body, heading, and interface elements, paired with **JetBrains Mono** for numerical scores, timestamps, hashes, and cryptographic telemetry.

| Style Role | Font Family | Size | Line Height | Weight | Tailwind Class |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title** | Inter (`sans`) | 16px (1.0rem) | 20px | 600 (Semibold) | `text-base font-semibold` |
| **Card Header** | Inter (`sans`) | 14px (0.875rem) | 18px | 600 (Semibold) | `text-sm font-semibold` |
| **Body Primary** | Inter (`sans`) | 13px (0.8125rem) | 18px | 400 (Regular) | `text-xs font-normal` |
| **Body Semibold** | Inter (`sans`) | 13px (0.8125rem) | 18px | 500 (Medium) | `text-xs font-medium` |
| **Subtext / Helper** | Inter (`sans`) | 11px (0.6875rem) | 14px | 400 (Regular) | `text-[11px]` |
| **Section Eyebrow** | Inter (`sans`) | 10px (0.625rem) | 12px | 600 (Semibold) | `text-[10px] uppercase tracking-wider` |
| **Telemetry / Data** | JetBrains Mono (`mono`) | 12px (0.75rem) | 16px | 500 (Medium) | `font-mono text-xs` |
| **Metric Hero Number**| JetBrains Mono (`mono`) | 24px (1.5rem) | 28px | 700 (Bold) | `font-mono text-2xl font-bold` |

---

### C. Spacing, Borders, Radii & Elevation

#### 1. Border Radii
- **Standard Card / Container**: `rounded` (`6px`) — clean, architectural, enterprise.
- **Button / Form Input**: `rounded` (`6px`) — consistent control geometry.
- **Badge / Pill**: `rounded-full` (`9999px`) or `rounded-sm` (`4px`) for compact status tags.
- **Icon Container**: `rounded` (`6px`).

#### 2. Elevation & Shadows
- **Flat (Default)**: `shadow-none border border-border` — zero visual noise.
- **Card Subtle**: `shadow-card` (`0 1px 3px 0 rgba(0,0,0,0.35)`).
- **Floating / Dropdown**: `shadow-elevated border border-border bg-surface` with `z-50`.

---

## 2. Standardized Component Patterns

### A. Action Buttons
Buttons must strictly use one of four unified classes:

1. **Primary Button (`.btn-primary`)**:
   - Background: `bg-primary` (`#4F6EF7`), Hover: `bg-primary-hover` (`#3E5DE4`), Text: `text-white`.
   - Size: `px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5`.
2. **Secondary Button (`.btn-secondary`)**:
   - Background: `bg-surface-elevated hover:bg-surface-hover`, Border: `border border-border`.
   - Text: `text-primaryText`.
3. **Danger Button (`.btn-danger`)**:
   - Background: `bg-danger hover:bg-danger-hover`, Text: `text-white`.
   - Reserved for quarantine, terminate call, or security block actions.
4. **Subtle Icon Action**:
   - Background: `p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-elevated transition-colors`.

### B. Form Inputs & Selects (`.input-enterprise`)
- Geometry: `h-8 text-xs px-3 rounded border border-border bg-surface text-primaryText placeholder:text-mutedText`.
- Focus State: `focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary`.

### C. Security Status Badges (`SecurityStatusBadge`)
Status badges represent risk levels, service states, and policy outcomes:

| State | Badge Style | Icon |
| :--- | :--- | :--- |
| **SAFE / ALLOW / LOW** | `bg-success/10 text-success border border-success/20` | `ShieldCheck` |
| **HIGH / SUSPICIOUS** | `bg-warning/10 text-warning border border-warning/20` | `AlertTriangle` |
| **CRITICAL / BLOCK** | `bg-danger/10 text-danger border border-danger/20` | `ShieldAlert` |
| **ACTIVE STREAMING** | `bg-primary/10 text-primary border border-primary/20 animate-pulse` | Pulsing dot |
| **NEUTRAL / PENDING** | `bg-surface-elevated text-secondaryText border border-border` | `Clock` |

### D. Cards & Containers
Every card follows the unified structure:
```tsx
<div className="bg-surface rounded border border-border p-4 sm:p-5">
  <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
    <h3 className="text-sm font-semibold text-primaryText">{title}</h3>
    {actionElement}
  </div>
  <div>{children}</div>
</div>
```

### E. Data Tables
- Table Container: `overflow-x-auto rounded border border-border bg-surface`.
- Header: `bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-mutedText border-b border-border py-2.5 px-3.5 text-left`.
- Row: `border-b border-border/50 hover:bg-surface-hover transition-colors py-2.5 px-3.5 text-xs text-primaryText`.
- Numerical columns right-aligned with `font-mono`.

---

## 3. Micro-Animations & Interaction Guidelines

1. **Live State Indication**:
   - Monitored live calls feature a 6px green pulsing dot: `inline-block w-2 h-2 rounded-full bg-success animate-pulse`.
2. **Smooth Transitions**:
   - All interactive hovers utilize `transition-colors duration-150 ease-in-out`.
   - Theme switches apply global CSS variables without layout recalculation or page re-renders.
3. **Data Loading**:
   - Skeletons use `animate-pulse bg-surface-elevated rounded` matching the exact dimensions of destination elements.

---

## 4. Accessibility & Compliance (WCAG 2.1 AA)

- **Color Contrast**: All text pairings maintain a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text / graphical controls.
- **Keyboard Navigation**: All interactive elements (buttons, inputs, selectable rows, tabs) have visible focus indicators (`focus-visible:ring-1 focus-visible:ring-primary`).
- **Screen Reader Support**: Tables include `<caption>` or `aria-label`, icon-only buttons include `aria-label`, and live alerts use `aria-live="polite"`.
