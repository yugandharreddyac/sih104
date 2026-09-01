"""
Unit Tests for Speaker Biometric Verification & Secure Enrollment (Phase 3)
"""

import base64
import numpy as np
import pytest
from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.core.types import (
    AudioChunkPayload,
    SpeakerVerificationStatus,
    SpeakerEnrollmentRequest
)


def generate_speaker_tone(f0: float = 300.0, duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * f0 * t) + 0.2 * np.sin(2 * np.pi * (2 * f0) * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    return base64.b64encode(int16.tobytes()).decode("utf-8")


def test_speaker_enrollment_and_matching():
    verifier = SpeakerVerifier(sample_rate=16000)

    # 1. Enroll new executive speaker with 2 valid utterances
    utt1 = generate_speaker_tone(f0=220.0, duration_sec=1.0)
    utt2 = generate_speaker_tone(f0=220.0, duration_sec=1.0)

    req = SpeakerEnrollmentRequest(
        speaker_id="speaker-ceo-test",
        speaker_name="Sarah Connor (CEO)",
        audio_utterances_base64=[utt1, utt2],
        metadata={"role": "CEO"}
    )
    success, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
    assert success is True
    assert profile.speaker_id == "speaker-ceo-test"
    assert profile.anti_spoof_verified is True

    # 2. Verify with matching speaker audio
    match_chunk = AudioChunkPayload(
        call_id="call-spk-match",
        chunk_index=0,
        audio_base64=generate_speaker_tone(f0=220.0, duration_sec=1.0),
        claimed_speaker_id="speaker-ceo-test"
    )
    res = verifier.verify_speaker(match_chunk)
    assert res.status == SpeakerVerificationStatus.MATCH
    assert res.similarity_score is not None
    assert res.similarity_score >= 0.70

    # 3. Verify with mismatching imposter voice (f0=550Hz)
    imposter_chunk = AudioChunkPayload(
        call_id="call-spk-mismatch",
        chunk_index=1,
        audio_base64=generate_speaker_tone(f0=550.0, duration_sec=1.0),
        claimed_speaker_id="speaker-ceo-test"
    )
    mismatch_res = verifier.verify_speaker(imposter_chunk)
    assert mismatch_res.status == SpeakerVerificationStatus.MISMATCH
    assert mismatch_res.similarity_score < 0.70


def test_enrollment_rejection_insufficient_utterances():
    verifier = SpeakerVerifier(sample_rate=16000)
    # Only 1 utterance provided
    req = SpeakerEnrollmentRequest(
        speaker_id="speaker-bad",
        speaker_name="Bad Enrollment",
        audio_utterances_base64=[generate_speaker_tone(f0=200.0, duration_sec=1.0)]
    )
    success, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
    assert success is False
    assert "minimum of 2 reference utterances" in msg
