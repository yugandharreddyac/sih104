# SIH104 — AI Output Contract

**Phase 7 Scientific Validation**  
**Version**: 1.0  
**Date**: September 3, 2026

---

## 1. PURPOSE

This document defines the exact output contract for each AI/ML module in SIH104. All downstream consumers (Node.js backend, WebSocket handlers, policy engine) MUST treat these fields as the authoritative data contract.

---

## 2. DEEPFAKE ANALYSIS OUTPUT CONTRACT

**Type**: `DeepfakeAnalysisResult`

| Field | Type | Range | Meaning |
|---|---|---|---|
| `status` | `DeepfakeStatus` enum | See below | Classification result |
| `spoof_score` | `float` or `null` | [0.0, 1.0] | P(synthetic). **null** when status is INSUFFICIENT_AUDIO or MODEL_UNAVAILABLE |
| `confidence` | `float` | [0.0, 1.0] | Model confidence in the classification |
| `uncertainty` | `float` | [0.0, 1.0] | Epistemic uncertainty. 1.0 when evidence is missing |
| `engine_type` | `str` or `null` | "NEURAL" or "DSP_FALLBACK" or null | Which engine produced the result. null when INSUFFICIENT_AUDIO |
| `inference_latency_ms` | `float` | ≥ 0 | Wall-clock inference time in milliseconds |
| `artifacts_detected` | `List[str]` | — | Human-readable artifact descriptions |
| `explainability` | `List[str]` | — | Reasoning trace |
| `model_version` | `str` | — | Model ID (e.g. "deepfake_aasist_spectral_v3") |

### DeepfakeStatus Values

| Value | Meaning |
|---|---|
| `AUTHENTIC` | spoof_score < authentic_threshold, high confidence |
| `SUSPICIOUS` | spoof_score ≥ spoof_threshold |
| `INCONCLUSIVE` | Score in ambiguous range OR quality too poor |
| `INSUFFICIENT_AUDIO` | Audio < 300 ms, or malformed |
| `MODEL_UNAVAILABLE` | ONNX session failed + DSP fallback unavailable |

### CONSUMER GUARANTEES

- `spoof_score` IS ALWAYS in [0.0, 1.0] when not null
- `uncertainty` IS ALWAYS in [0.0, 1.0]
- When `status == INSUFFICIENT_AUDIO`: `spoof_score = null`, `confidence = 0.0`, `uncertainty = 1.0`
- When `status == AUTHENTIC`: `spoof_score < 0.36` (softmax probability, NOT logits)
- When `status == SUSPICIOUS`: `spoof_score ≥ 0.62`
- When `status == INCONCLUSIVE`: `spoof_score` may be in any range; `uncertainty` will be elevated

---

## 3. SPEAKER VERIFICATION OUTPUT CONTRACT

**Type**: `SpeakerVerificationResult`

| Field | Type | Range | Meaning |
|---|---|---|---|
| `status` | `SpeakerVerificationStatus` enum | See below | Verification result |
| `similarity_score` | `float` or `null` | [0.0, 1.0] | Cosine similarity between enrolled and current embedding |
| `confidence` | `float` | [0.0, 1.0] | Confidence in the verification decision |
| `is_enrolled` | `bool` | — | Whether the claimed speaker has a stored profile |
| `threshold_applied` | `float` | — | Cosine threshold used for this decision |
| `model_version` | `str` | — | Model ID |
| `inference_latency_ms` | `float` | ≥ 0 | Wall-clock inference time |

### SpeakerVerificationStatus Values

| Value | Meaning |
|---|---|
| `MATCH` | similarity_score ≥ threshold |
| `MISMATCH` | similarity_score < threshold and speaker is enrolled |
| `NOT_ENROLLED` | No profile found for claimed_speaker_id |
| `INSUFFICIENT_AUDIO` | Audio < 300 ms |
| `MODEL_UNAVAILABLE` | ONNX failure + DSP failure |

### CONSUMER GUARANTEES

- `similarity_score` IS ALWAYS in [0.0, 1.0] when not null
- `similarity_score = null` when status is `NOT_ENROLLED`, `INSUFFICIENT_AUDIO`, or `MODEL_UNAVAILABLE`
- The embedding dimension IS 192 when neural model is active
- L2 normalization IS applied before cosine similarity computation

---

## 4. ASR OUTPUT CONTRACT

**Type**: `ASRResult`

| Field | Type | Range | Meaning |
|---|---|---|---|
| `status` | `PipelineStatus` enum | — | ASR engine state |
| `transcript` | `str` | — | Raw ASR transcript (empty string on failure, NOT null) |
| `redacted_transcript` | `str` | — | Transcript with PII masked (empty string on failure) |
| `language` | `LanguageCode` enum | — | Detected/routed language |
| `language_confidence` | `float` | [0.0, 1.0] | Language detection confidence |
| `confidence` | `float` | [0.0, 1.0] | ASR word confidence score |
| `uncertainty` | `float` | [0.0, 1.0] | ASR uncertainty |
| `word_count` | `int` | ≥ 0 | Number of words in transcript |
| `inference_latency_ms` | `float` | ≥ 0 | ASR inference time |
| `is_final` | `bool` | — | Whether this is a final transcript |

### CONSUMER GUARANTEES

- `transcript` is NEVER null (empty string on error — fixed in Phase 7)
- `redacted_transcript` is NEVER null
- `language` is NEVER null (defaults to `LanguageCode.EN` on failure — fixed in Phase 7)
- On ASR failure: `transcript = ""`, `confidence = 0.0`, `uncertainty = 1.0`

---

## 5. RISK FUSION OUTPUT CONTRACT

**Type**: `UnifiedRiskFusionResult`

| Field | Type | Range | Meaning |
|---|---|---|---|
| `overall_risk_score` | `float` | [0.0, 100.0] | Composite risk score |
| `risk_level` | `RiskLevel` enum | See below | Risk classification |
| `confidence` | `float` | [0.0, 1.0] | Fusion confidence |
| `uncertainty` | `float` | [0.0, 1.0] | Epistemic uncertainty |
| `dimensions` | `RiskDimensions` | — | 10-dimensional risk breakdown |
| `risk_velocity` | `float` | — | Rate of risk change |
| `risk_trajectory_trend` | `str` | — | "ESCALATING", "STABLE", "DEESCALATING" |
| `policy_recommendation` | `PolicyEvaluationResult` or null | — | Recommended action |
| `primary_drivers` | `List[str]` | — | Top risk contributors |

### RiskLevel Values

| Value | Score Range | Action Required |
|---|---|---|
| `SAFE` | 0–20 | Monitor only |
| `LOW` | 20–35 | Log |
| `GUARDED` | 35–50 | Soft alert |
| `ELEVATED` | 50–70 | Notify supervisor |
| `HIGH` | 70–85 | Step-up verification |
| `CRITICAL` | 85–100 | Immediate intervention |
| `INCONCLUSIVE` | Any | Multiple components failed |

### CONSUMER GUARANTEES

- `overall_risk_score` IS ALWAYS in [0.0, 100.0]
- On fusion failure: `risk_level = INCONCLUSIVE`, `overall_risk_score = 50.0` (fixed in Phase 7)
- `NOT_DETECTED` is NEVER silently returned when evidence is missing — all failure paths use explicit status fields

---

## 6. UNIFIED PIPELINE OUTPUT CONTRACT

**Type**: `UnifiedPipelineResult`

Key fields for downstream consumers:

| Field | Type | Guaranteed Conditions |
|---|---|---|
| `call_id` | `str` | NEVER null |
| `overall_risk_score` | `float` | ALWAYS in [0.0, 100.0] |
| `risk_level` | `RiskLevel` | ALWAYS non-null |
| `deepfake_status` | `DeepfakeStatus` | ALWAYS non-null |
| `speaker_status` | `SpeakerVerificationStatus` | ALWAYS non-null |
| `replay_status` | `ReplayStatus` | ALWAYS non-null |
| `transcript` | `str` | ALWAYS non-null (may be empty) |
| `component_errors` | `Dict[str, str]` | Lists components that failed |
| `component_statuses` | `Dict[str, str]` | "AVAILABLE" or "ERROR" per component |
| `pipeline_latency_ms` | `float` | End-to-end wall-clock in ms |

---

## 7. FAILURE PROPAGATION RULES

1. **No silent failure**: Every component failure populates `component_errors[component_name]`.
2. **No cascading crash**: A failure in one component NEVER terminates processing of other components.
3. **Uncertainty escalation on failure**: Failed components produce `uncertainty = 1.0`.
4. **Conservative risk on uncertainty**: The fusion engine increases `INCONCLUSIVE` weight proportionally to uncertainty.
5. **INCONCLUSIVE is NOT NOT_DETECTED**: `INCONCLUSIVE` means "we cannot determine" — NOT "we determined this is clean."
