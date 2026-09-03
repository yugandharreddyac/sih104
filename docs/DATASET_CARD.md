# SIH104 — Dataset Card

**Phase 7 Dataset Inventory and Validation Status**  
**Date**: September 3, 2026

---

## 1. OVERVIEW

This card documents the expected and actual state of training/evaluation datasets for SIH104's AI/ML subsystems.

---

## 2. REQUIRED DATASETS

### Dataset 1: ASVspoof 2021 (Deepfake/Anti-Spoof)

| Field | Value |
|---|---|
| **Name** | ASVspoof 2021 — Deepfake (DF) and Physical Access (PA) |
| **Purpose** | Training and evaluation of acoustic deepfake/anti-spoof detectors |
| **URL** | https://zenodo.org/record/5766198 |
| **License** | CC-BY 4.0 |
| **Expected Split** | PA_train/dev/eval, DF_eval |
| **Audio Format** | 16 kHz mono WAV |
| **Bona Fide Speakers** | ~4,874 unique speakers |
| **Spoof Generators** | 13 known (A01–A08, LA01–LA05) + unknown |
| **Total Expected Files** | ~400,000 audio files |
| **Local Status** | **NOT DOWNLOADED** |
| **Files Present** | 0 |
| **Manifest Records** | 0 |
| **Leakage Checked** | NOT VERIFIABLE |
| **SHA-256 Verified** | NOT VERIFIABLE |

> This dataset is required for: Deepfake detector evaluation, EER computation, threshold calibration, generator disjoint evaluation.

---

### Dataset 2: IndicVoices (Indian Language Bona Fide Speech)

| Field | Value |
|---|---|
| **Name** | IndicVoices |
| **Purpose** | Bona fide speech samples for Indian languages — speaker verification and multilingual ASR training |
| **URL** | https://huggingface.co/datasets/ai4bharat/IndicVoices |
| **License** | CC-BY-4.0 |
| **Languages** | Hindi, Telugu, Tamil, Bengali, Marathi, Gujarati, Odia, and more |
| **Expected Format** | 16 kHz mono WAV or FLAC |
| **Expected Duration** | ~7,000+ hours (full corpus) |
| **Planned Subset** | 100–200 hours per target language |
| **Local Status** | **NOT DOWNLOADED** |
| **Files Present** | 0 |
| **Manifest Records** | 0 |
| **Leakage Checked** | NOT VERIFIABLE |

> This dataset is required for: Speaker verification evaluation, ASR WER evaluation on Indian languages, multilingual robustness testing.

---

### Dataset 3: Indic Parler-TTS (Indian Language Synthetic Speech)

| Field | Value |
|---|---|
| **Name** | ai4bharat/indic-parler-tts |
| **Purpose** | Indian language TTS/synthetic speech for spoof detection evaluation |
| **URL** | https://huggingface.co/datasets/ai4bharat/indic-parler-tts |
| **License** | CC-BY-4.0 |
| **Languages** | Hindi, Telugu, Tamil, and others |
| **Expected Format** | 22.05 kHz → resample to 16 kHz |
| **Generator ID** | `parler_tts_v1` |
| **Local Status** | **NOT DOWNLOADED** |
| **Files Present** | 0 |
| **Manifest Records** | 0 |

> This dataset is required for: Testing deepfake detector on Indian TTS systems (domain mismatch evaluation).

---

## 3. DATASET INFRASTRUCTURE STATUS

The following tools are implemented and functionally tested (12/12 unit tests pass):

| Component | File | Status |
|---|---|---|
| Manifest schema & generator | `ai/app/datasets/manifest.py` | FUNCTIONAL |
| Audio validator | `ai/app/datasets/validator.py` | FUNCTIONAL |
| Leakage detector | `ai/app/datasets/leakage.py` | FUNCTIONAL |
| ASVspoof adapter | `ai/app/datasets/adapters.py` | FUNCTIONAL |
| IndicVoices adapter | `ai/app/datasets/adapters.py` | FUNCTIONAL |
| Parler-TTS adapter | `ai/app/datasets/adapters.py` | FUNCTIONAL |
| Quality reporter | `ai/app/datasets/quality.py` | FUNCTIONAL |

---

## 4. SPEAKER DISJOINT REQUIREMENT

**Requirement**: No speaker appearing in the training split may appear in the validation or test split.

**Status**: `NOT VERIFIABLE — NO DATA DOWNLOADED`

The `LeakageDetector.check_records()` function IS implemented and tested. It would detect speaker ID overlaps if data existed.

---

## 5. GENERATOR DISJOINT REQUIREMENT

**Requirement**: For robust deepfake evaluation, test splits should contain generators NOT seen during training ("unknown attack" condition).

**Status**: `NOT VERIFIABLE — NO DATA DOWNLOADED`

ASVspoof 2021 DF evaluation set includes both seen and unseen generators. The leakage detector tracks `generator_id` across splits.

---

## 6. DATA SPLIT PLAN (WHEN DATA IS AVAILABLE)

When ASVspoof 2021 DF is downloaded:

```
TRAIN:
  - ASVspoof 2021 DF train portion
  - Bona fide: LA_train speakers (4,874)
  - Spoof: generators A01–A08 (known)
  
VALIDATION:
  - ASVspoof 2021 DF dev portion
  - Strict speaker disjoint from TRAIN
  
TEST:
  - ASVspoof 2021 DF eval portion
  - Includes unseen generators (A09–A19)
  - Strict speaker AND generator disjoint from TRAIN
```

---

## 7. MANIFEST CSV STATUS

**File**: `datasets/dataset_manifest.csv`  
**Status**: EXISTS with correct column headers, 0 data records.

**Expected Columns** (verified): `file_path, dataset, split, label, language, language_code, speaker_id, generator_id, session_id, sample_rate, duration_seconds, source_metadata, license, checksum`

---

## 8. NEXT STEPS TO COMPLETE DATA VALIDATION

1. Download ASVspoof 2021 DF evaluation set from Zenodo (CC-BY 4.0)
2. Download IndicVoices controlled subset (50 hours per language)
3. Run `python ai/scripts/prepare_dataset_workspace.py`
4. Run `python ai/scripts/inspect_dataset.py --dataset asvspoof_2021`
5. Generate leakage report via `LeakageDetector.check_records()`
6. Run deepfake evaluation script against ASVspoof DF eval
7. Compute EER, AUC, FPR@0.1%FNR, FNR@0.1%FPR
8. Evaluate on IndicVoices bona fide + Parler-TTS spoof
