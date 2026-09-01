# VOXSHIELD — Real-World Audio Datasets Directory

This directory houses raw audio benchmarks, normalized speech corpora, and unified dataset manifests for acoustic anti-spoofing, deepfake detection, and multilingual Indian speech validation in VOXSHIELD.

---

## 1. CRITICAL SAFETY & GIT REPOSITORY RULES

> [!CAUTION]
> **DO NOT COMMIT RAW OR PROCESSED AUDIO FILES TO GIT.**
> Audio binaries (`.wav`, `.flac`, `.mp3`, `.ogg`, `.m4a`, etc.) and archive files (`.tar`, `.tar.gz`, `.zip`) are strictly ignored via `.gitignore`.
> Only directory structure placeholders (`.gitkeep`), documentation (`README.md`), dataset manifests (`dataset_manifest.csv`), and processing scripts are tracked in Git.

---

## 2. Directory Hierarchy

```text
datasets/
├── README.md                           # Dataset documentation and provenance guide
├── .gitkeep
├── raw/                                # Local staging for raw downloaded corpora (Git-ignored)
│   ├── asvspoof2021/                   # ASVspoof 2021 Deepfake (DF) evaluation & keys
│   ├── indicvoices/                    # AI4Bharat IndicVoices real Indian speech
│   └── indic_parler_tts/               # Indic Parler-TTS synthetic Indian speech
├── processed/                          # Pre-processed, normalized 16kHz mono audio (Git-ignored)
│   ├── train/                          # Partitioned training split
│   ├── validation/                     # Partitioned validation split
│   └── test/                           # Partitioned test / benchmark split
└── metadata/                           # Manifests, metadata schemas, and quality summaries
    └── dataset_manifest.csv            # Unified metadata index across all splits
```

---

## 3. Targeted Datasets & Provenance

### 3.1 ASVspoof 2021 Deepfake (DF) Partition
* **Purpose:** Primary international gold-standard benchmark for acoustic anti-spoofing, deepfake detection, and vocoder/compression artifact classification.
* **Label Type:** `bona_fide` (real human speech) vs `spoof` (synthesized / voice-converted speech).
* **Expected Local Placement:** `datasets/raw/asvspoof2021/`
  - Audio directory: `datasets/raw/asvspoof2021/flac/`
  - Protocol / Keys: `datasets/raw/asvspoof2021/keys/` or `trial_metadata.txt`
* **Licensing / Provenance:** ASVspoof Consortium (Academic / Research License).

### 3.2 IndicVoices (AI4Bharat)
* **Purpose:** Real human Indian speech corpus across major Indian regional languages and accents for legitimate caller acoustic and multilingual validation.
* **Target Languages:** Hindi (`hi`), Tamil (`ta`), Telugu (`te`), Bengali (`bn`), Marathi (`mr`), Indian English (`en-IN`).
* **Initial Sampling Target:** Approximately 1,000 to 2,000 verified clips per selected language.
* **Label Type:** `bona_fide` (real human speech).
* **Expected Local Placement:** `datasets/raw/indicvoices/<language_code>/`
* **Licensing / Provenance:** AI4Bharat / IIT Madras (CC-BY-4.0 / Open-Source Data License).

### 3.3 Indic Parler-TTS
* **Purpose:** High-quality synthetic Indian speech generation across target Indian languages to benchmark acoustic anti-spoofing against modern neural voice cloning and TTS architectures.
* **Target Languages:** Hindi (`hi`), Tamil (`ta`), Telugu (`te`), Bengali (`bn`), Marathi (`mr`), Indian English (`en-IN`).
* **Initial Sampling Target:** Approximately 1,000 to 2,000 generated clips per selected language.
* **Label Type:** `spoof` (synthetic / deepfake speech).
* **Expected Local Placement:** `datasets/raw/indic_parler_tts/<language_code>/`
* **Licensing / Provenance:** Parler-TTS / Hugging Face Community.

### 3.4 Rasa Speech / Conversational Corpora
* **Status:** **RESERVED FOR FUTURE PHASES.**
* **Guideline:** Do **NOT** download or integrate yet. Reserved for subsequent phase robustness and intent generalization evaluations.

---

## 4. Unified Manifest Schema Specification

All processed and indexed audio records are mapped into `datasets/metadata/dataset_manifest.csv` using the following schema:

| Column Name | Type | Description | Allowed / Example Values |
| :--- | :--- | :--- | :--- |
| `file_path` | String | Relative or absolute path to audio file | `datasets/raw/asvspoof2021/flac/DF_E_0000001.flac` |
| `dataset` | String | Originating dataset identifier | `asvspoof2021`, `indicvoices`, `indic_parler_tts`, `custom` |
| `split` | String | Dataset partition | `train`, `validation`, `test`, `unassigned` |
| `label` | String | Ground-truth acoustic category | `bona_fide`, `spoof` |
| `language` | String | Full language name | `Hindi`, `Tamil`, `Telugu`, `Bengali`, `Marathi`, `Indian English`, `English` |
| `language_code` | String | Normalized ISO-639-1 / BCP-47 code | `hi`, `ta`, `te`, `bn`, `mr`, `en-IN`, `en` |
| `speaker_id` | String | Canonical speaker identifier (if available) | `LA_0001`, `spk_hi_042`, empty if unknown |
| `generator_id` | String | TTS / VC algorithm (if spoof) | `A01`, `indic_parler_v1`, `none` / empty if bona fide |
| `session_id` | String | Recording session identifier (if available) | `sess_001`, empty if unknown |
| `sample_rate` | Integer | Audio sampling frequency in Hz | `16000`, `8000`, `44100`, `48000` |
| `duration_seconds` | Float | Duration of audio clip in seconds | `3.45`, `1.20` |
| `source_metadata` | String | JSON string of raw dataset-specific metadata | `{"vocoder": "HiFi-GAN", "gender": "F"}` |
| `license` | String | Data licensing tag | `ASVSpoof-2021`, `CC-BY-4.0`, `Research-Only` |
| `checksum` | String | SHA-256 hash of the audio binary | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

> [!IMPORTANT]
> **No Synthetic / Fabricated Metadata:** Unknown or unavailable attributes must remain empty/NULL. Never guess or fabricate speaker IDs, session IDs, or generator labels.

---

## 5. Data Leakage Invariants

To guarantee valid generalizability and prevent over-optimistic evaluation metrics:
1. **Speaker ID Separation:** No `speaker_id` appearing in the `train` partition may ever appear in `validation` or `test`.
2. **Session ID Separation:** No `session_id` appearing in `train` may appear in `test`.
3. **Exact Binary Deduplication:** Audio checksums (SHA-256) are checked to prevent identical clips from existing across both train and evaluation splits.
4. **Leakage Reporting:** The [LeakageDetector](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/datasets/leakage.py) utility flags any split violations and blocks evaluation until resolved.
