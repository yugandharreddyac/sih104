# VOXSHIELD — Page & Component Inventory

**Document Version:** 1.0.0  
**Phase:** Phase 1 — UI/UX Audit & Design Foundation  
**System Scope:** VOXSHIELD Security Operations Center (Frontend)  

---

## 1. Route-by-Route Page Inventory

### Page 1: Authentication Portal
- **Route**: `/`
- **File**: `frontend/src/app/page.tsx`
- **Purpose**: Authenticates SOC operators and tier-3 analysts, issues JWT, and stores session tokens in localStorage.
- **Key Components**:
  - `ThemeToggle` (top-right floating position)
  - Centered brand card with VOXSHIELD shield icon
  - Email & Password input fields with Lucide icons (`Mail`, `Lock`)
  - Error banner (`AlertCircle`)
  - Submit button with dynamic loading state (`Authenticating...`)
- **Data Source**: `POST /api/auth/login`
- **Current States**:
  - Idle (pre-filled analyst credentials for rapid testing)
  - Submitting (`loading: true`, button disabled)
  - Error (`error: string` banner rendered)
- **Responsive Behavior**:
  - `1920×1080` to `390×844`: Centered flexbox card with `max-w-sm w-full p-6 sm:p-8`. Responsive on all viewports.
- **Visual Gaps**:
  - Lacks a cyber/security ambient background (e.g., subtle mesh grid or radial gradient).
  - Uses generic border/shadow rather than elevated glassmorphism.

---

### Page 2: SOC Overview Dashboard
- **Route**: `/dashboard`
- **File**: `frontend/src/app/dashboard/page.tsx`
- **Purpose**: High-level operational command center showing live call volume, active voice threats, pending MFA challenges, subsystem SLAs, and recent security events.
- **Key Components**:
  - `Sidebar` (desktop static, mobile drawer)
  - `Navbar` with gateway and AI service connection badges
  - 4 KPI `MetricCard` items (Active Calls, Active Voice Threats, Pending Verifications, Open Incidents)
  - Live Voice Threats monitor table with status badges
  - System Health summary card with subsystem status pills
  - Recent Security Incidents feed with severity pills and navigation links
- **Data Sources**:
  - `GET /api/calls`
  - `GET /api/incidents`
  - `GET /api/policies`
  - `GET /api/verification`
  - `GET /api/health`
  - `WS /ws` (live real-time alert broadcasts)
- **Current States**:
  - Loading (`loading: true` full page spinner)
  - Populated data tables
  - Empty state (`EmptyState` for zero incidents/threats)
- **Responsive Behavior**:
  - Desktop: 4-column metric grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
  - Tablet/Mobile: 2-column then 1-column stack. Right-side health panel stacks under threat table.

---

### Page 3: Live Voice Sessions
- **Route**: `/calls`
- **File**: `frontend/src/app/calls/page.tsx`
- **Purpose**: Real-time voice interception, browser microphone streaming, ASR live transcript generation, acoustic intelligence telemetry, and 10D risk scoring.
- **Key Components**:
  - Claimed Identity dropdown (`Enrolled CFO`, `VP Finance`, `Unenrolled Caller`)
  - Active Calls Queue table (phone number, channel, status, risk score, duration)
  - Audio Streamer controller (`Start Mic`, `Simulate Call`, `Stop Audio`)
  - Live elapsed duration timer (scoped strictly to active stream)
  - Real-time `RiskScoreGauge` (composite risk 0–100, risk level badge, policy recommendation)
  - Real-time live transcript pane with auto-scroll and redacted text display
  - `DominantThreatCard` (primary risk drivers and threat categorization)
  - `TechnicalTelemetryPanel` (AASIST spoof score, ECAPA biometric similarity, latency)
- **Data Sources**:
  - `GET /api/calls`
  - `POST /api/calls/simulate`
  - `WS /ws` (bidirectional PCM audio streaming and risk telemetry events)
- **Current States**:
  - No call selected (`No Call Session Selected` illustration card)
  - Call selected, idle (historical playback / telemetry)
  - Live streaming active (microphone recording, animated pulsing badges, live duration incrementing)
  - Threat escalated (`CRITICAL`, red banner, step-up policy triggered)
  - Benign recovery (score decay back to `LOW`)
- **Responsive Behavior**:
  - Desktop (1920×1080, 1440×900): Two-column layout (left queue: 380px, right telemetry: flex-1).
  - Tablet/Mobile (768×1024, 390×844): Stacks vertically; queue sits atop telemetry pane.

---

### Page 4: Incident Response & Case Management
- **Route**: `/incidents`
- **File**: `frontend/src/app/incidents/page.tsx`
- **Purpose**: Triage and containment queue for detected voice spoofing and social engineering attempts; allows SOC analysts to escalate, quarantine, or resolve cases.
- **Key Components**:
  - Search input with debounce
  - Severity filter pills (`ALL`, `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)
  - Incident list with severity badges, timestamp, and target caller ID
  - Case detail inspector (incident number, detection cues, affected systems, policy triggered)
  - Containment action buttons (`Quarantine Account`, `Trigger Step-Up`, `Mark False Positive`, `Resolve`)
  - Action feedback banner
- **Data Sources**:
  - `GET /api/incidents`
  - `PATCH /api/incidents/:id/status`
- **Current States**:
  - Loading spinner
  - Populated incident queue
  - Empty filtered state
  - Selected incident detail view
  - Action in progress (`actionLoading: true`)
- **Responsive Behavior**:
  - Split pane collapses into full-width stacked view below 1024px.

---

### Page 5: Step-Up Verification
- **Route**: `/verification`
- **File**: `frontend/src/app/verification/page.tsx`
- **Purpose**: Out-of-band (OOB) identity provider challenges (Authenticator Push, Hardware Token, SMS/Email OTP, Callback Verification) dispatched to target executive identities.
- **Key Components**:
  - Dispatch challenge form: Target call session selector, Verification mechanism selector, Identity address input
  - Dispatch submit button with feedback alerts
  - Verification challenge history table with status indicators (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`)
  - Real-time countdown / expiration stamps
- **Data Sources**:
  - `GET /api/verification`
  - `POST /api/verification`
  - `GET /api/calls`
- **Current States**:
  - Form editing
  - Challenge dispatching
  - Success/error feedback
  - Table history list
- **Responsive Behavior**:
  - Top dispatch form and bottom history table stack vertically; responsive down to mobile.

---

### Page 6: Risk Analytics & Threat Explanation
- **Route**: `/risk`
- **File**: `frontend/src/app/risk/page.tsx`
- **Purpose**: Multi-modal risk deep-dive; visualizes 10-dimensional threat tensor, primary drivers, and model explainability cues.
- **Key Components**:
  - Target call session selector dropdown
  - Composite risk summary banner with gauge and confidence score
  - 10-dimensional risk breakdown grid (`identity_impersonation`, `deepfake_synthetic`, `replay_injection`, `social_engineering`, `credential_theft`, `financial_fraud`, `account_takeover`, `verification_bypass`, `inconsistency`, `overall`)
  - `DetectionSignalsTable` with signal weight, confidence bar, and evidence tags
  - Explainability and forensic cues list
- **Data Sources**:
  - `GET /api/calls`
  - `GET /api/risk/:callId`
- **Current States**:
  - No call selected
  - Loading risk assessment
  - Populated 10D tensor analysis
- **Responsive Behavior**:
  - Tensor cards wrap from 3 columns to 2 columns on tablet and 1 column on mobile.

---

### Page 7: Security Policy Engine
- **Route**: `/policies`
- **File**: `frontend/src/app/policies/page.tsx`
- **Purpose**: Manages automated deterministic security guardrails and provides an interactive JSON simulation test bench to evaluate policy outcomes against synthetic risk payloads.
- **Key Components**:
  - 4-step pipeline flow ribbon (`Ingest` → `Assess` → `Match` → `Action`)
  - Active enterprise policies catalog table (Rule ID, trigger condition, risk threshold, autonomous mitigation action, enabled switch)
  - Interactive Policy Simulator (JSON context textarea, Evaluate button, structured JSON verdict output)
- **Data Sources**:
  - `GET /api/policies`
  - `POST /api/policies/evaluate`
- **Current States**:
  - Policy list loaded
  - Simulator idle
  - Evaluating simulation
  - Simulation result / error displayed
- **Responsive Behavior**:
  - Left policy catalog and right simulator stack below 1024px.

---

### Page 8: Architecture & Presentation Diagrams
- **Route**: `/diagrams`
- **File**: `frontend/src/app/diagrams/page.tsx`
- **Purpose**: Central showcase and presentation deck hub providing standalone vector SVG graphics and interactive chart components.
- **Key Components**:
  - Top toolbar with direct SVG download links (`feasibility-vs-challenges.svg`, `risk-fusion-signal-weighting.svg`, `voxshield-technology-stack.svg`)
  - Local theme preview toggle (`light` / `dark`)
  - Interactive React component previews:
    - `FeasibilityChallengesChart` (6 categories, grouped line/bar chart)
    - `RiskFusionSignalChart` (10 signals, 2D proportional donut chart)
    - `TechnologyStackDiagram` (circular node diagram with 8 microservices)
- **Data Sources**:
  - Static vector assets in `public/diagrams/`
  - Embedded SVG component code
- **Current States**:
  - Standalone presentation mode
  - Theme toggled view
- **Responsive Behavior**:
  - Diagram containers maintain 16:9 aspect ratio and scale responsively with SVG viewBox.

---

### Page 9: Security Audit Logs
- **Route**: `/audit`
- **File**: `frontend/src/app/audit/page.tsx`
- **Purpose**: Cryptographic, tamper-evident audit log recording all system events, AI inferences, policy actions, and analyst interventions.
- **Key Components**:
  - Search filter input (action, actor, correlation ID)
  - Result filter pills (`ALL`, `SUCCESS`, `ERROR`)
  - Audit log table (Timestamp, Action, Resource, Actor, Correlation ID, Result badge, Expand arrow)
  - Expandable row detail with formatted JSON metadata payload
- **Data Sources**:
  - `GET /api/audit`
- **Current States**:
  - Loading state
  - Filtered table list
  - Expanded JSON row
  - Empty search result
- **Responsive Behavior**:
  - Correlation ID column hides on smaller viewports (`hidden md:table-cell`); table has horizontal scroll container.

---

### Page 10: System Health & Uptime
- **Route**: `/health`
- **File**: `frontend/src/app/health/page.tsx`
- **Purpose**: Subsystem observability dashboard showing live status, SLAs, and uptime for Backend Gateway, Acoustic AI Service, Privacy Firewall, and Policy Engine.
- **Key Components**:
  - Global status banner (`ALL SYSTEMS OPERATIONAL` / `DEGRADED`)
  - 4 Subsystem status cards (icon, subsystem name, SLA metric, endpoint URL, status pill, architecture notes)
  - Toggle for raw JSON health inspection
  - Refresh button
- **Data Sources**:
  - `GET /api/health`
- **Current States**:
  - Loading
  - Healthy (all green)
  - Degraded / Service Unavailable (warning/danger badges)
  - Raw JSON expanded
- **Responsive Behavior**:
  - Grid of cards: 2 columns on desktop, 1 column on mobile.

---

## 2. Reusable Component Inventory

| Component File | Directory | Role & Props | Current Deficiencies |
| :--- | :--- | :--- | :--- |
| `Sidebar.tsx` | `components/` | Navigation sidebar with grouped links and user logout | Hardcoded user role strings; custom event listener for mobile toggle rather than shared React context. |
| `Navbar.tsx` | `components/` | Header bar with health badges and analyst profile | 15-second polling interval creates minor unnecessary network traffic; initials circle has static styling. |
| `ThemeToggle.tsx`| `components/` | Sun/Moon/System theme toggle switch | Operates via raw DOM class manipulation without smooth CSS transition timing on theme change. |
| `MetricCard.tsx` | `components/ui/` | KPI stat card with icon, value, change indicator | Custom inline border styles; lacks loading skeleton state. |
| `EmptyState.tsx` | `components/ui/` | Standardized empty queue placeholder | Good base, but underutilized across several pages which use ad-hoc empty divs. |
| `ErrorState.tsx` | `components/ui/` | Standardized error message with retry button | Good base, but not connected to React error boundaries. |
| `LoadingState.tsx`| `components/ui/`| Standardized spinner placeholder | Simple spinner; does not support skeleton layout placeholders. |
| `RiskScoreGauge.tsx`| `components/ui/`| Composite risk gauge with numerical score | Circular gauge uses CSS conic-gradient; lacks smooth animated score transition when risk updates. |
| `DetectionSignalsTable.tsx`| `components/ui/`| 10D signal weight table | Table headers mix uppercase tracking classes; confidence bar colors are hardcoded. |
| `DominantThreatCard.tsx`| `components/ui/`| Threat driver card with severity indicator | High contrast red borders can feel jarring; needs refined subtle border styling. |
| `TechnicalTelemetryPanel.tsx`| `components/ui/`| Acoustic & biometric metrics panel | Compact layout; text truncates on very narrow screens. |
