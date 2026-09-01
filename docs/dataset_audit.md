# VOXSHIELD Dataset Quality Report

## 1. Summary Statistics
- **Total Audio Files Discovered:** 22751
- **Valid & Readable Audio Files:** 22751
- **Corrupted / Invalid Files:** 0
- **Cumulative Audio Duration:** 134501.88 seconds (37.36 hours)
- **Unique Identified Speakers:** 2075
- **Unique Identified Synthetic Generators:** 0

## 2. Duration Distribution (Seconds)
| Min | Mean | Median | P95 | Max |
| :--- | :--- | :--- | :--- | :--- |
| 0.14s | 5.91s | 4.95s | 16.10s | 29.99s |

## 3. Label Breakdown (Real vs Synthetic)
| Label | Count | Percentage |
| :--- | :--- | :--- |
| `bona_fide` | 22751 | 100.0% |

## 4. Partition Splits
| Split | Count | Percentage |
| :--- | :--- | :--- |
| `unassigned` | 22751 | 100.0% |

## 5. Language Breakdown
| Language | Count |
| :--- | :--- |
| hindi | 5530 |
| kannada | 4126 |
| malayalam | 4524 |
| tamil | 5276 |
| telugu | 3295 |

## 6. Sampling Rate Distribution
| Sampling Frequency (Hz) | Count |
| :--- | :--- |
| 16000 Hz | 22751 |

## 7. Data Leakage Assessment
> [!NOTE]
> **No cross-split data leakage detected.** Speaker IDs, session IDs, and audio binaries are strictly separated.
