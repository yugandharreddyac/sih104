# VOXSHIELD — Dataset Download Status

> Last Updated: 2026-09-01 (Workspace Initialization)

> [!CAUTION]
> **No dataset has been downloaded yet.**
> Do NOT start a full 70+ GB download automatically.
> Follow the instructions in [DOWNLOAD_GUIDE.md](DOWNLOAD_GUIDE.md) to download a controlled subset.

---

## Dataset Status Summary

| Dataset | Status | Local Directory | Files | Size | Notes |
|---|---|---|---|---|---|
| ASVspoof 2021 DF | **NOT DOWNLOADED** | `datasets/raw/asvspoof2021/` | 0 | 0 B | Requires license agreement |
| IndicVoices | **NOT DOWNLOADED** | `datasets/raw/indicvoices/` | 0 | 0 B | HuggingFace account required |
| Indic Parler-TTS | **NOT DOWNLOADED** | `datasets/raw/indic_parler_tts/` | 0 | 0 B | HuggingFace account required |
| Rasa | **DEFERRED** | Not assigned | — | — | Future phase |

---

## Detailed Status

### ASVspoof 2021 DF

```
STATUS:           NOT DOWNLOADED
DOWNLOAD_SOURCE:  https://zenodo.org/record/4835108
LICENSE_ACCEPTED: UNKNOWN / NOT YET RECORDED
DOWNLOAD_DATE:    NOT YET RECORDED
FILES_COUNT:      0
TOTAL_SIZE_BYTES: 0
FLAC_FILES:       0
PROTOCOL_FILE:    MISSING
SUBSET_USED:      NOT YET DECIDED
LANGUAGE_HI:      N/A (English corpus)
LANGUAGE_TE:      N/A
LANGUAGE_TA:      N/A
LANGUAGE_BN:      N/A
LANGUAGE_MR:      N/A
LANGUAGE_EN_IN:   N/A
```

### IndicVoices

```
STATUS:             NOT DOWNLOADED
DOWNLOAD_SOURCE:    https://huggingface.co/datasets/ai4bharat/indicvoices_r
LICENSE_ACCEPTED:   UNKNOWN / NOT YET RECORDED
DOWNLOAD_DATE:      NOT YET RECORDED
FILES_COUNT_TOTAL:  0
TOTAL_SIZE_BYTES:   0
TARGET_PER_LANG:    1000-2000 clips
LANGUAGE_HI:        0 clips downloaded
LANGUAGE_TE:        0 clips downloaded
LANGUAGE_TA:        0 clips downloaded
LANGUAGE_BN:        0 clips downloaded
LANGUAGE_MR:        0 clips downloaded
LANGUAGE_EN_IN:     0 clips downloaded
```

### Indic Parler-TTS

```
STATUS:             NOT DOWNLOADED
DOWNLOAD_SOURCE:    https://huggingface.co/ai4bharat/indic-parler-tts
LICENSE_ACCEPTED:   UNKNOWN / NOT YET RECORDED
DOWNLOAD_DATE:      NOT YET RECORDED
FILES_COUNT_TOTAL:  0
TOTAL_SIZE_BYTES:   0
TARGET_PER_LANG:    1000-2000 clips
LANGUAGE_HI:        0 clips downloaded
LANGUAGE_TE:        0 clips downloaded
LANGUAGE_TA:        0 clips downloaded
LANGUAGE_BN:        0 clips downloaded
LANGUAGE_MR:        0 clips downloaded
LANGUAGE_EN_IN:     0 clips downloaded
```

### Rasa

```
STATUS:           DEFERRED
REASON:           Reserved for future robustness and intent evaluation phases
ACTION_REQUIRED:  None at this time
```

---

## Initial Download Targets

Once download is approved, the first-pass targets are:

| Dataset | Target | Priority |
|---|---|---|
| ASVspoof 2021 DF | Part 00 only (~4 GB) — representative subset | HIGH |
| IndicVoices | ~1,000–2,000 clips per language (6 languages) | HIGH |
| Indic Parler-TTS | ~1,000–2,000 synthetic clips per language (6 languages) | HIGH |
| Rasa | NOT APPLICABLE | DEFERRED |

---

## Manifests Generated

| Manifest File | Dataset | Records | Generated Date |
|---|---|---|---|
| None yet | — | 0 | — |

---

## Next Actions

1. Read [DOWNLOAD_GUIDE.md](DOWNLOAD_GUIDE.md) for complete download instructions.
2. Ensure you have **at least 20 GB free disk space** before starting.
3. Accept the ASVspoof 2021 license at https://zenodo.org/record/4835108
4. Accept IndicVoices terms on HuggingFace (if required).
5. Run:
   ```bash
   python ai/scripts/prepare_dataset_workspace.py
   ```
   to verify workspace integrity before downloading.
6. After each partial download, run:
   ```bash
   python ai/scripts/inspect_dataset.py --dataset <name>
   ```
7. Update this file with actual file counts and sizes after each download.

---

## Status Change Log

| Date | Dataset | Previous Status | New Status | Changed By |
|---|---|---|---|---|
| 2026-09-01 | All | N/A | Initialized | VOXSHIELD Workspace Init |
