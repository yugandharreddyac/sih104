# VOXSHIELD — Phase 7.1 Real-World Dataset Integration Foundation Report
## Directory Structure, Manifest Schema, Configurable Ingestion Adapters, Data Leakage Protection & Quality Auditing

> **Lead ML / Data Engineer:** Principal AI/ML & Data Infrastructure Architect  
> **Execution Date:** September 1, 2026  
> **Status:** COMPLETE  
> **Classification:** Infrastructure Implementation & Verification Report  

---

## 1. Executive Summary

This report documents the design, implementation, and empirical validation of **Phase 7.1: Real-World Dataset Integration Foundation** for the VOXSHIELD voice fraud defense platform.

Phase 7.1 establishes the data engineering substrate required for subsequent real-world dataset ingestion, speech benchmark evaluations, and deepfake detector validation across international and Indian speech corpora.

### Key Deliverables & Outcomes:
1. **Standardized Dataset Directory Structure:** Initialized `datasets/` hierarchy containing `raw/` (with targets `asvspoof2021/`, `indicvoices/`, `indic_parler_tts/`), `processed/` (`train/`, `validation/`, `test/`), and `metadata/` (`dataset_manifest.csv`).
2. **Git Repository Protection:** Configured `.gitignore` rules ensuring all raw and processed audio files (`.wav`, `.flac`, `.mp3`, `.ogg`, `.m4a`, etc.) and archives (`.tar`, `.tar.gz`, `.zip`) are strictly ignored, while preserving directory structures (`.gitkeep`), documentation (`README.md`), and manifest schemas.
3. **Comprehensive Dataset Manifest Schema:** Implemented 14-field specification in `datasets/metadata/dataset_manifest.csv` tracking file paths, dataset identities, split partitions, labels, language metadata, speaker/session/generator IDs, acoustic properties, licenses, and SHA-256 checksums.
4. **Configurable Ingestion Adapters:** Created modular dataset adapters in [ai/app/datasets/adapters.py](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/adapters.py) supporting ASVspoof 2021 trial protocols, AI4Bharat IndicVoices, Indic Parler-TTS, and generic audio repositories.
5. **Data Leakage Protection Engine:** Implemented [LeakageDetector](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/leakage.py) to identify cross-split contamination (speaker overlap, session overlap, and duplicate audio checksums across train/test/validation).
6. **Empirical Quality Auditor:** Created [QualityReporter](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/quality.py) and CLI tool [ai/scripts/dataset_quality_report.py](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/scripts/dataset_quality_report.py) computing real file statistics (duration percentiles, class balance, sampling rates) without fabricating synthetic statistics on empty sets.
7. **100% Green Automated Test Baseline:** 12 new dedicated unit tests created in [ai/tests/test_dataset_foundation.py](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/tests/test_dataset_foundation.py), bringing total automated test coverage to **132 / 132 passing tests** (AI: 82/82, Backend: 50/50, TypeScript: 100% error-free).

---

## 2. Dataset Directory Architecture

```text
datasets/
├── README.md                           # Dataset documentation and provenance guide
├── .gitkeep
├── raw/                                # Local staging for raw downloaded corpora (Git-ignored)
│   ├── .gitkeep
│   ├── asvspoof2021/                   # ASVspoof 2021 Deepfake (DF) evaluation & keys
│   │   └── .gitkeep
│   ├── indicvoices/                    # AI4Bharat IndicVoices real Indian speech
│   │   └── .gitkeep
│   └── indic_parler_tts/               # Indic Parler-TTS synthetic Indian speech
│       └── .gitkeep
├── processed/                          # Normalized 16kHz mono audio (Git-ignored)
│   ├── .gitkeep
│   ├── train/                          # Partitioned training split
│   │   └── .gitkeep
│   ├── validation/                     # Partitioned validation split
│   │   └── .gitkeep
│   └── test/                           # Partitioned test / benchmark split
│       └── .gitkeep
└── metadata/                           # Manifests, metadata schemas, and quality summaries
    ├── .gitkeep
    └── dataset_manifest.csv            # Unified metadata index across all splits
```

---

## 3. Dataset Manifest Specification Schema

The schema header is formalized in `datasets/metadata/dataset_manifest.csv`:

```csv
file_path,dataset,split,label,language,language_code,speaker_id,generator_id,session_id,sample_rate,duration_seconds,source_metadata,license,checksum
```

| Field Name | Type | Allowed Values / Format | Description |
| :--- | :--- | :--- | :--- |
| `file_path` | String | `datasets/raw/asvspoof2021/flac/DF_E_0000001.flac` | Absolute or relative path to the audio binary |
| `dataset` | String | `asvspoof2021`, `indicvoices`, `indic_parler_tts`, `custom` | Originating dataset identifier |
| `split` | String | `train`, `validation`, `test`, `unassigned` | Evaluation or training partition |
| `label` | String | `bona_fide`, `spoof` | Ground-truth acoustic category |
| `language` | String | `Hindi`, `Tamil`, `Telugu`, `Bengali`, `Marathi`, `Indian English` | Canonical display language name |
| `language_code` | String | `hi`, `ta`, `te`, `bn`, `mr`, `en-IN`, `en` | Normalized ISO-639-1 / BCP-47 locale code |
| `speaker_id` | String | `spk_001`, `LA_0001`, empty if unknown | Canonical speaker identifier |
| `generator_id` | String | `A01`, `indic_parler_v1`, empty if bona fide | TTS/VC synthesis algorithm identifier |
| `session_id` | String | `sess_001`, empty if unknown | Recording session identifier |
| `sample_rate` | Integer | `16000`, `8000`, `44100`, `48000` | Sampling frequency in Hz |
| `duration_seconds` | Float | `3.4500`, `1.2000` | Duration of audio clip in seconds |
| `source_metadata` | String | `{"gender": "F", "vocoder": "HiFi-GAN"}` | Raw JSON string of origin-specific metadata |
| `license` | String | `ASVSpoof-2021`, `CC-BY-4.0`, `Research-Only` | Dataset licensing identifier |
| `checksum` | String | `e3b0c44298fc1c149afbf4c8996fb92427ae41e464...` | SHA-256 cryptographic digest of audio bytes |

---

## 4. Ingestion Adapters & Data Processing Architecture

The [ai/app/datasets/](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/) package implements four ingestion adapters:

1. **`ASVSpoofAdapter`:**
   - Parses ASVspoof 2021 DF / LA trial metadata key files (`[SPEAKER_ID] [FILE_NAME] [SYSTEM_ID] [ATTACK] [KEY]`).
   - Maps `bonafide` $\to$ `AudioLabel.BONA_FIDE` and `spoof` $\to$ `AudioLabel.SPOOF`.
   - Extracts attack generator IDs (e.g. `A01` through `A19`).
2. **`IndicVoicesAdapter`:**
   - Ingests AI4Bharat IndicVoices corpora structured by `<language_code>/<speaker_id>/<file>.wav`.
   - Resolves Indian language codes (`hi`, `ta`, `te`, `bn`, `mr`, `en-IN`) using VOXSHIELD `LanguageIdentifier`.
   - Flags all authentic human speech as `AudioLabel.BONA_FIDE` with `CC-BY-4.0` license.
3. **`IndicParlerTTSAdapter`:**
   - Ingests synthetic Indian speech generated by Indic Parler-TTS across target dialects.
   - Flags all synthetic clips as `AudioLabel.SPOOF` with `generator_id = "indic_parler_tts"`.
4. **`GenericAudioAdapter`:**
   - Fallback scanner for custom audio directories, providing configurable default splits, labels, and licensing.

---

## 5. Data Leakage Prevention Engine

The [LeakageDetector](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/leakage.py) enforces three critical invariants before model validation or training:

1. **Speaker ID Separation:** Prohibits identical `speaker_id` values from co-occurring in `train` and `test` or `validation` splits.
2. **Session ID Separation:** Prohibits identical recording `session_id` values from spanning across evaluation boundaries.
3. **Binary Checksum Deduplication:** Calculates SHA-256 digests on all audio files and flags exact duplicates existing under differing file paths in separate splits.
4. **Non-Mutating Diagnostics:** Emits explicit violation descriptions without silently altering dataset contents or hiding errors.

---

## 6. Empirical Quality Audit & CLI Tool

Implemented [ai/scripts/dataset_quality_report.py](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/scripts/dataset_quality_report.py) supporting live terminal audits:

```powershell
python ai/scripts/dataset_quality_report.py --manifest datasets/metadata/dataset_manifest.csv
```

### Initial State Audit (Clean Baseline):
```text
# VOXSHIELD Dataset Quality Report

## 1. Summary Statistics
- Total Audio Files Discovered: 0
- Valid & Readable Audio Files: 0
- Corrupted / Invalid Files: 0
- Cumulative Audio Duration: 0.00 seconds (0.00 hours)
- Unique Identified Speakers: 0
- Unique Identified Synthetic Generators: 0

## 2. Duration Distribution (Seconds)
| Min | Mean | Median | P95 | Max |
| 0.00s | 0.00s | 0.00s | 0.00s | 0.00s |

## 3. Data Leakage Assessment
> [!NOTE]
> No cross-split data leakage detected. Speaker IDs, session IDs, and audio binaries are strictly separated.
```

---

## 7. Automated Test Suite Verification

```text
================================================================================
VOXSHIELD COMPLETE AUTOMATED TEST MATRIX (PHASE 7.1)
================================================================================
1. AI Python Test Suite (pytest ai -v):
   - Dataset Foundation Tests:   12/12 PASSED (test_dataset_foundation.py)
   - End-to-End Pipeline Tests:  11/11 PASSED (test_end_to_end_pipeline.py)
   - Neural Deepfake Tests:      13/13 PASSED (test_deepfake_detector.py)
   - Speaker Verification Tests: 11/11 PASSED (test_speaker_verifier.py)
   - Multilingual Routing Tests: 10/10 PASSED (test_multilingual_routing.py)
   - ASR Engine Tests:           10/10 PASSED (test_asr_engine.py)
   - Conversational NLP Tests:   15/15 PASSED (NLP, intent, social eng, replay, fusion)
   - Total AI Tests:             82 / 82 PASSED (100% GREEN)

2. Backend Node.js / Express Test Suite (npm test):
   - Total Test Suites:          13
   - Total Tests:                50 / 50 PASSED (100% GREEN)

3. TypeScript Type-Checking:
   - Backend (tsc --noEmit):     🟢 PASS (0 Errors)
   - Frontend (tsc --noEmit):    🟢 PASS (0 Errors)

================================================================================
TOTAL AUTOMATED TESTS:           132 / 132 PASSING (100% GREEN)
================================================================================
```

---

## 8. Git Safety Verification

- **Git Status:** Working tree clean, `.gitignore` protects `datasets/raw/*` and `datasets/processed/*`.
- **Large Binaries:** Zero audio files staged or tracked in Git.
- **Git Remotes:** Strictly local (0 external remotes configured, no pushes performed).

---

## 9. Recommended Next Step

> **Exact Next Step:** **Phase 7.2 — Real Dataset Ingestion & Dataset Quality Auditing** (local placement of raw ASVspoof 2021 DF, IndicVoices, and Indic Parler-TTS subsets, followed by manifest generation and quality distribution analysis).
