# VOXSHIELD — Dataset Download Guide

> [!CAUTION]
> **DO NOT start an automatic full download of these datasets.**
> The complete dataset corpus may exceed **70 GB**. Always start with a representative subset.
> Confirm you have sufficient disk space (recommended: 100 GB free) before proceeding.

---

## Overview

This guide explains how to obtain the three primary datasets required for VOXSHIELD training,
validation, and evaluation. For each dataset, official source locations, licensing requirements,
and authentication requirements are documented.

**All downloads must be placed in `datasets/raw/<dataset_name>/` and must not be modified
after placement. Raw data is treated as immutable source data.**

---

## 1. ASVspoof 2021 Deepfake (DF) Track

| Field | Value |
|---|---|
| **Purpose** | Real vs synthetic/deepfake speech detection benchmark |
| **Target Directory** | `datasets/raw/asvspoof2021/` |
| **License** | ASVspoof Consortium — Academic / Research Only |
| **Manual Download Required?** | **YES** — requires registration and license agreement |

### Step 1.1 — Register and Accept License

The ASVspoof 2021 database is distributed by the ASVspoof Consortium and requires:

1. Visit the official ASVspoof challenge page:
   - **Primary:** https://www.asvspoof.org/
   - **Zenodo:** https://zenodo.org/record/4835108 (ASVspoof 2021 DF track)
2. Create an account / sign in.
3. Accept the **ASVspoof Database License Agreement** (academic use only).

### Step 1.2 — Download the DF Track

Download the **Deepfake (DF)** partition specifically. Do NOT download the full LA (Logical Access)
partition unless needed — the DF track alone is sufficient for VOXSHIELD Phase 1.

Files to download:
- `ASVspoof2021_DF_eval_part00.tar.gz` through `part07.tar.gz` — Audio files
- `ASVspoof2021_DF_eval.tar.gz` — Evaluation metadata
- `keys.tar.gz` — Official trial metadata and protocol keys

> [!WARNING]
> The DF evaluation set alone is approximately **30 GB**. Download only the **representative subset**
> for initial validation (e.g., Part 00 only, ~4 GB).

### Step 1.3 — Extract

```bash
# Place archives in datasets/raw/asvspoof2021/
cd datasets/raw/asvspoof2021/
tar -xzf ASVspoof2021_DF_eval_part00.tar.gz
tar -xzf keys.tar.gz
```

### Step 1.4 — Expected Directory Structure After Extraction

```
datasets/raw/asvspoof2021/
├── flac/                        # Audio files (.flac)
│   └── DF_E_0000001.flac
│   └── ...
├── keys/                        # Official trial protocol keys
│   └── DF/
│       └── CM/
│           └── trial_metadata.txt
└── README (if provided by organizers)
```

### Step 1.5 — Verify with VOXSHIELD

```bash
python ai/scripts/inspect_dataset.py --dataset asvspoof2021
```

---

## 2. IndicVoices (AI4Bharat)

| Field | Value |
|---|---|
| **Purpose** | Real Indian speech across major Indian languages |
| **Target Directory** | `datasets/raw/indicvoices/` |
| **License** | CC-BY-4.0 (Open Source — Attribution Required) |
| **Manual Download Required?** | **YES** — Hugging Face account required for some versions |

### Step 2.1 — Source Location

IndicVoices is published by AI4Bharat (IIT Madras):
- **Hugging Face:** https://huggingface.co/datasets/ai4bharat/indicvoices_r
- **AI4Bharat Official:** https://indicvoices.ai4bharat.org/

### Step 2.2 — Accept Terms (if required)

Some subsets of IndicVoices require:
1. A Hugging Face account
2. Acceptance of the dataset card license terms
3. Approval from AI4Bharat (for restricted subsets)

Check the dataset card on Hugging Face for the specific version you download.

### Step 2.3 — Initial Subset Download (Recommended First Step)

Download approximately **1,000–2,000 clips per target language** for initial validation.

Target languages:
- Hindi (`hi`)
- Telugu (`te`)
- Tamil (`ta`)
- Bengali (`bn`)
- Marathi (`mr`)
- Indian English (`en-IN`)

**Option A — Hugging Face CLI (subset):**

```bash
pip install huggingface_hub

# Example: Download Hindi subset
huggingface-cli download ai4bharat/indicvoices_r \
  --repo-type dataset \
  --include "hi/*" \
  --local-dir datasets/raw/indicvoices/hi/

# Repeat for each language code: te, ta, bn, mr
```

> [!IMPORTANT]
> You may need to run `huggingface-cli login` first with your Hugging Face token.

**Option B — Manual Download via Browser:**
Visit https://huggingface.co/datasets/ai4bharat/indicvoices_r/tree/main
and download audio files per language subfolder manually.

### Step 2.4 — Expected Directory Structure

```
datasets/raw/indicvoices/
├── hi/          # Hindi audio clips
├── te/          # Telugu audio clips
├── ta/          # Tamil audio clips
├── bn/          # Bengali audio clips
├── mr/          # Marathi audio clips
└── en/          # Indian English audio clips (or en-IN/)
```

### Step 2.5 — Verify with VOXSHIELD

```bash
python ai/scripts/inspect_dataset.py --dataset indicvoices
```

---

## 3. Indic Parler-TTS (Synthetic Indian Speech)

| Field | Value |
|---|---|
| **Purpose** | Synthetic (deepfake/TTS) Indian speech for anti-spoofing benchmarking |
| **Target Directory** | `datasets/raw/indic_parler_tts/` |
| **License** | CC-BY-4.0 (Parler-TTS / Hugging Face Community) |
| **Manual Download Required?** | Hugging Face account recommended |

### Step 3.1 — Source Location

Indic Parler-TTS is available via Hugging Face:
- **Hugging Face:** https://huggingface.co/ai4bharat/indic-parler-tts

> [!NOTE]
> The Indic Parler-TTS dataset for VOXSHIELD may need to be **synthesized** using the Indic Parler-TTS
> model rather than downloaded as a pre-built dataset, depending on the version available. Confirm
> the source format (pre-synthesized audio vs. model weights) before proceeding.
>
> Pre-synthesized audio subsets may be available at:
> https://huggingface.co/datasets/ai4bharat/indic-parler-tts-audio (check for availability)

### Step 3.2 — Initial Subset

Similar to IndicVoices, download approximately **1,000–2,000 synthetic clips per language** initially.

```bash
huggingface-cli download ai4bharat/indic-parler-tts \
  --repo-type dataset \
  --include "hi/*" \
  --local-dir datasets/raw/indic_parler_tts/hi/
```

> [!IMPORTANT]
> Confirm the exact dataset repository name on Hugging Face before running download commands.
> The repository URL above is provided as guidance but must be verified.

### Step 3.3 — Expected Directory Structure

```
datasets/raw/indic_parler_tts/
├── hi/          # Synthetic Hindi clips
├── te/          # Synthetic Telugu clips
├── ta/          # Synthetic Tamil clips
├── bn/          # Synthetic Bengali clips
├── mr/          # Synthetic Marathi clips
└── en/          # Synthetic Indian English clips
```

### Step 3.4 — Verify with VOXSHIELD

```bash
python ai/scripts/inspect_dataset.py --dataset indic_parler_tts
```

---

## 4. Rasa — DEFERRED

> [!NOTE]
> Rasa conversational corpora are reserved for future phases.
> **Do NOT download Rasa datasets at this time.**

---

## Download Sequence (Recommended Order)

| Priority | Dataset | Size (Subset) | Action |
|---|---|---|---|
| 1st | ASVspoof 2021 DF (Part 00 only) | ~4 GB | Download manually from Zenodo |
| 2nd | IndicVoices (1,000 clips per language) | ~1–3 GB | huggingface-cli per language |
| 3rd | Indic Parler-TTS (1,000 clips per language) | ~1–3 GB | huggingface-cli per language |

---

## After Each Download

Run the inspection and workspace validation:

```bash
# 1. Check workspace structure
python ai/scripts/prepare_dataset_workspace.py

# 2. Inspect a specific downloaded dataset
python ai/scripts/inspect_dataset.py --dataset asvspoof2021

# 3. Generate a manifest from downloaded files
python ai/scripts/generate_dataset_manifest.py --dataset asvspoof2021

# 4. Run dataset foundation tests
python -m pytest ai/tests/test_dataset_foundation.py -v

# 5. Run the full quality report
python ai/scripts/dataset_quality_report.py --dir datasets/raw --output docs/dataset_audit.md
```

---

## Licensing Compliance

| Dataset | License | Attribution Required | Commercial Use |
|---|---|---|---|
| ASVspoof 2021 DF | ASVspoof Consortium (Academic) | YES | **NO** |
| IndicVoices | CC-BY-4.0 | YES | Check specific version |
| Indic Parler-TTS | CC-BY-4.0 | YES | Check specific version |
| Rasa | Deferred | — | — |

> [!CAUTION]
> ASVspoof 2021 is licensed for **academic and research use only**.
> Do NOT use it in commercial products or production deployments without explicit written
> permission from the ASVspoof Consortium.

---

## Privacy Considerations

- ASVspoof 2021 DF recordings contain real human voices. Handle in compliance with the
  ASVspoof license and do not re-identify speakers.
- IndicVoices speakers have consented to research use under the CC-BY-4.0 terms.
  Do not attempt to re-identify or deanonymize speakers.
- Indic Parler-TTS outputs are synthetic. Still handle responsibly — do not use for
  voice fraud or impersonation outside of detection/research contexts.
- All raw audio must remain within your secure local development environment.
- Do NOT commit audio files to Git (enforced by `.gitignore`).
