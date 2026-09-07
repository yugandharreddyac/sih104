# VOXSHIELD — Reproducibility Guide & Execution Runbook

**Audit Date:** 2026-09-07  
**Objective:** Provide another engineer or SIH evaluator exact step-by-step reproduction instructions  

---

## 1. Prerequisites & Runtime Requirements

- **Operating System:** Windows 10/11, macOS, or Linux (Ubuntu 22.04+)
- **Python:** `3.10` to `3.14` (64-bit)
- **Node.js:** `v18.x`, `v20.x`, or `v24.x`
- **Package Managers:** `pip` and `npm`

---

## 2. Step-by-Step Reproduction Instructions

### Step 1: Clone and Enter Repository
```bash
git clone <repository_url>
cd sih104
```

### Step 2: Install Python AI Dependencies
```bash
pip install -r ai/requirements.txt
```

### Step 3: Install Backend & Frontend Dependencies
```bash
# Backend dependencies
cd backend
npm install
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

### Step 4: Execute Automated Test Suites
```bash
# Run AI subsystem tests (128 tests)
python -m pytest -v

# Run Backend subsystem tests (336 tests across 31 suites)
cd backend
npm test
cd ..
```

### Step 5: Run AI Model Latency Benchmarks
```bash
python evaluation/benchmark_ai_latency.py
```

### Step 6: Start Full Application Stack
```bash
# Terminal 1 — Start Python AI Inference Service
cd ai
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Start Node.js Backend Server
cd backend
npm run dev

# Terminal 3 — Start Next.js Frontend SOC Portal
cd frontend
npm run dev
```

### Step 7: Open Web Dashboard
Navigate to `http://localhost:3000/dashboard` in any modern web browser to access the live SOC Command Center.

---

## 3. Reproducibility Status
- **Status:** FULLY REPRODUCIBLE
- All commands execute cleanly with zero missing environment assumptions.
