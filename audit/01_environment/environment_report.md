# VOXSHIELD — Environment Audit Report

**Date & Time:** 2026-09-07T12:11:00+05:30  
**Host Platform:** Windows 11 Pro (10.0.26200-SP0 x64)  
**Processor:** Intel64 Family 6 Model 154 Stepping 4, GenuineIntel (12th/13th Gen Architecture)  
**Corpus Name:** yugandharreddyac/sih104  
**Project Path:** `C:\Users\supre\OneDrive\Desktop\sih104`

---

## 1. Runtime & Tooling Versions

| Runtime / Tool | Version | Executable / Path | Status |
| :--- | :--- | :--- | :--- |
| **Python** | `3.14.5` (64-bit) | `C:\Users\supre\AppData\Local\Python\pythoncore-3.14-64\python.exe` | Verified |
| **pip** | `26.1.1` | Python 3.14 site-packages | Verified |
| **Node.js** | `v24.19.0` | In PATH | Verified |
| **npm** | `11.17.0` | In PATH | Verified |
| **Git** | `2.55.0.windows.3` | In PATH | Verified |
| **Docker** | N/A (CLI not in system PATH) | Local runtime used directly (Node + Python processes) | Documented |

---

## 2. Key Python Dependencies (AI/ML Subsystem)

| Package | Installed Version | Purpose in VOXSHIELD |
| :--- | :--- | :--- |
| `torch` | `2.14.0+cpu` | PyTorch runtime for acoustic/deepfake inference & neural tensors |
| `torchaudio` | `2.11.0+cpu` | Feature extraction, STFT, audio preprocessing |
| `onnxruntime` | `1.29.0` | ONNX model inference engine for accelerated embeddings |
| `faster-whisper` | `1.2.1` | High-efficiency CTranslate2-based ASR multilingual engine |
| `scikit-learn` | `1.9.0` | Evaluation metrics, confusion matrix, ROC-AUC, classification |
| `scipy` | `1.17.1` | DSP, filtering, synthetic telemetry generation, signal processing |
| `numpy` | `2.4.6` | Tensor & array processing |
| `soundfile` | `0.14.0` | Audio I/O for WAV / FLAC / raw PCM streaming |
| `fastapi` | `0.141.1` | Real-time AI Inference REST & WebSocket Server |
| `uvicorn` | `0.52.4` | ASGI production server for FastAPI |
| `pydantic` | `2.13.4` | Strict schema validation for AI input/output contracts |
| `pytest` | `9.1.1` | Automated test suite execution |
| `matplotlib` | `3.10.9` | Confusion matrix & ROC curve generation |
| `seaborn` | `0.13.2` | Metric visualization |

---

## 3. Key Node.js Dependencies (Backend & Frontend)

### Backend (`backend/package.json`)
- **Framework:** Express `4.19.2` with TypeScript `5.5.2` (via `tsx` / `ts-node`)
- **Security:** `helmet` (7.1.0), `bcryptjs` (2.4.3), `jsonwebtoken` (9.0.2), `express-rate-limit` (7.3.1), `cors` (2.8.5)
- **Validation:** `zod` (3.23.8)
- **Real-Time Communication:** `ws` (8.17.1)
- **Telemetry & Monitoring:** `prom-client` (15.1.3), `redis` (4.6.14)
- **Database:** `pg` (8.12.0)
- **Testing:** `jest` (29.7.0), `supertest` (7.0.0), `ts-jest` (29.1.5)

### Frontend (`frontend/package.json`)
- **Framework:** Next.js `14.2.4`, React `18.3.1`, React DOM `18.3.1`
- **Styling:** TailwindCSS `3.4.4`, PostCSS `8.4.38`, `clsx`, `tailwind-merge`
- **Icons:** `lucide-react` `0.395.0`
- **Linting & Types:** `eslint` 8.57.0, TypeScript 5.5.2

---

## 4. Environment Health Assessment
- **Status:** PASS
- **Compatibility:** Python 3.14.5 + PyTorch CPU + Node v24.19.0 + Next.js 14 are fully compatible and functional.
