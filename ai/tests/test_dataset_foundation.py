"""VOXSHIELD Phase 7.1 Dataset Integration Foundation Unit Tests
Validates manifest generation, metadata validation, label normalization, language resolution,
corrupted-file handling, data leakage detection, empty datasets, and missing metadata scenarios.
"""

import os
import tempfile
import wave
import pytest
from pathlib import Path

from ai.app.datasets.types import (
    AudioLabel,
    DatasetName,
    ManifestRecord,
    SplitType,
)
from ai.app.datasets.validator import AudioFileValidator
from ai.app.datasets.leakage import LeakageDetector
from ai.app.datasets.manifest import (
    MANIFEST_COLUMNS,
    ManifestGenerator,
    ManifestReader,
    ManifestWriter,
)
from ai.app.datasets.adapters import (
    ASVSpoofAdapter,
    GenericAudioAdapter,
    IndicParlerTTSAdapter,
    IndicVoicesAdapter,
)
from ai.app.datasets.quality import QualityReporter


@pytest.fixture
def temp_audio_dir():
    """Create a temporary directory with synthetic valid and corrupt audio files for testing."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        # 1. Valid WAV file (16kHz, 1s mono)
        valid_wav = tmp_path / "valid_sample.wav"
        with wave.open(str(valid_wav), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00\x00" * 16000)

        # 2. Corrupted file (invalid header/gibberish)
        corrupted_wav = tmp_path / "corrupted_sample.wav"
        with open(corrupted_wav, "wb") as f:
            f.write(b"NOT_A_REAL_WAV_HEADER_DATA_GARBAGE_1234567890")

        # 3. Zero-byte file
        empty_wav = tmp_path / "empty_sample.wav"
        empty_wav.touch()

        # 4. Non-audio file
        text_file = tmp_path / "notes.txt"
        text_file.write_text("Hello VoxShield", encoding="utf-8")

        yield tmp_path


def test_manifest_schema_and_column_specification():
    """Verify manifest column schema matches the specification."""
    expected_cols = [
        "file_path",
        "dataset",
        "split",
        "label",
        "language",
        "language_code",
        "speaker_id",
        "generator_id",
        "session_id",
        "sample_rate",
        "duration_seconds",
        "source_metadata",
        "license",
        "checksum",
    ]
    assert MANIFEST_COLUMNS == expected_cols


def test_audio_metadata_validation(temp_audio_dir):
    """Verify audio validator extracts accurate sample rate, duration, channels, and checksum."""
    valid_wav = str(temp_audio_dir / "valid_sample.wav")
    res = AudioFileValidator.validate_audio_file(valid_wav, compute_hash=True)

    assert res.is_valid is True
    assert res.sample_rate == 16000
    assert res.channels == 1
    assert pytest.approx(res.duration_seconds, 0.01) == 1.0
    assert res.checksum is not None
    assert len(res.checksum) == 64  # SHA-256 hex length
    assert res.error_message is None


def test_corrupted_and_empty_file_handling(temp_audio_dir):
    """Verify corrupted, zero-byte, and non-existent files are detected gracefully without exceptions."""
    corrupted_wav = str(temp_audio_dir / "corrupted_sample.wav")
    res_corrupt = AudioFileValidator.validate_audio_file(corrupted_wav)
    assert res_corrupt.is_valid is False
    assert "Corrupted or unsupported" in res_corrupt.error_message

    empty_wav = str(temp_audio_dir / "empty_sample.wav")
    res_empty = AudioFileValidator.validate_audio_file(empty_wav)
    assert res_empty.is_valid is False
    assert "Empty file" in res_empty.error_message

    non_existent = str(temp_audio_dir / "does_not_exist.wav")
    res_missing = AudioFileValidator.validate_audio_file(non_existent)
    assert res_missing.is_valid is False
    assert "does not exist" in res_missing.error_message


def test_label_validation_and_normalization():
    """Verify ground truth label validation, synonym mapping, and rejection of invalid labels."""
    bona_fide_inputs = ["bona_fide", "bonafide", "real", "genuine", "human", "original", "BONA_FIDE", " REAL "]
    for raw in bona_fide_inputs:
        lbl, is_valid = AudioFileValidator.normalize_label(raw)
        assert lbl == AudioLabel.BONA_FIDE
        assert is_valid is True

    spoof_inputs = ["spoof", "fake", "synthetic", "deepfake", "tts", "vc", "SPOOF", " Fake "]
    for raw in spoof_inputs:
        lbl, is_valid = AudioFileValidator.normalize_label(raw)
        assert lbl == AudioLabel.SPOOF
        assert is_valid is True

    invalid_inputs = ["maybe", "unknown_noise", "dog_bark", "", None]
    for raw in invalid_inputs:
        lbl, is_valid = AudioFileValidator.normalize_label(raw)
        assert lbl == AudioLabel.UNKNOWN
        assert is_valid is False


def test_language_validation_and_normalization():
    """Verify language name and ISO code resolution for Indian languages."""
    test_cases = [
        ("hi", ("Hindi", "hi")),
        ("Hindi", ("Hindi", "hi")),
        ("ta-IN", ("Tamil", "ta")),
        ("telugu", ("Telugu", "te")),
        ("bn", ("Bengali", "bn")),
        ("mr-IN", ("Marathi", "mr")),
        ("en-IN", ("Indian English", "en-IN")),
        ("en", ("English", "en")),
    ]

    for raw, expected in test_cases:
        display_name, code = AudioFileValidator.normalize_language(raw)
        assert (display_name, code) == expected

    # None handling
    assert AudioFileValidator.normalize_language(None) == (None, None)


def test_leakage_detection_speaker_overlap():
    """Verify detector catches the same speaker ID appearing across train and test splits."""
    records = [
        ManifestRecord(file_path="train/spk1_01.wav", split=SplitType.TRAIN.value, speaker_id="spk_001"),
        ManifestRecord(file_path="train/spk1_02.wav", split=SplitType.TRAIN.value, speaker_id="spk_001"),
        ManifestRecord(file_path="test/spk1_03.wav", split=SplitType.TEST.value, speaker_id="spk_001"),  # Leakage!
        ManifestRecord(file_path="test/spk2_01.wav", split=SplitType.TEST.value, speaker_id="spk_002"),
    ]

    report = LeakageDetector.check_records(records)
    assert report.is_clean is False
    assert report.total_violations == 1
    assert "spk_001" in report.speaker_overlaps
    assert report.speaker_overlaps["spk_001"] == ["test", "train"]
    assert "Speaker ID 'spk_001' appears across splits" in report.violations[0].description


def test_leakage_detection_session_and_checksum_overlap():
    """Verify detector catches session ID overlap and duplicate audio checksum collisions."""
    records = [
        ManifestRecord(
            file_path="train/clip1.wav",
            split=SplitType.TRAIN.value,
            speaker_id="spk_A",
            session_id="sess_100",
            checksum="hash_abc123",
        ),
        ManifestRecord(
            file_path="validation/clip2.wav",
            split=SplitType.VALIDATION.value,
            speaker_id="spk_B",
            session_id="sess_100",  # Session leakage!
            checksum="hash_def456",
        ),
        ManifestRecord(
            file_path="test/clip3_copy.wav",
            split=SplitType.TEST.value,
            speaker_id="spk_C",
            session_id="sess_300",
            checksum="hash_abc123",  # Binary checksum duplicate in test vs train!
        ),
    ]

    report = LeakageDetector.check_records(records)
    assert report.is_clean is False
    assert report.total_violations == 2
    assert "sess_100" in report.session_overlaps
    assert "hash_abc123" in report.checksum_overlaps


def test_clean_splits_no_leakage():
    """Verify clean partitioned datasets return clean leakage reports."""
    records = [
        ManifestRecord(file_path="train/s1.wav", split=SplitType.TRAIN.value, speaker_id="spk_1", session_id="sess_1", checksum="h1"),
        ManifestRecord(file_path="train/s2.wav", split=SplitType.TRAIN.value, speaker_id="spk_1", session_id="sess_1", checksum="h2"),
        ManifestRecord(file_path="validation/s3.wav", split=SplitType.VALIDATION.value, speaker_id="spk_2", session_id="sess_2", checksum="h3"),
        ManifestRecord(file_path="test/s4.wav", split=SplitType.TEST.value, speaker_id="spk_3", session_id="sess_3", checksum="h4"),
    ]

    report = LeakageDetector.check_records(records)
    assert report.is_clean is True
    assert report.total_violations == 0
    assert len(report.violations) == 0


def test_manifest_read_write_roundtrip(temp_audio_dir):
    """Verify manifest records serialize to CSV and deserialize accurately with missing fields."""
    manifest_csv = str(temp_audio_dir / "test_manifest.csv")

    records = [
        ManifestRecord(
            file_path="data/audio1.wav",
            dataset=DatasetName.INDICVOICES.value,
            split=SplitType.TRAIN.value,
            label=AudioLabel.BONA_FIDE.value,
            language="Hindi",
            language_code="hi",
            speaker_id="spk_hi_01",
            sample_rate=16000,
            duration_seconds=3.1415,
            license="CC-BY-4.0",
            checksum="sha256_hash_1",
        ),
        ManifestRecord(
            file_path="data/audio2.wav",
            dataset=DatasetName.ASVSPOOF2021.value,
            split=SplitType.TEST.value,
            label=AudioLabel.SPOOF.value,
            generator_id="A01",
            sample_rate=16000,
            duration_seconds=1.5000,
            checksum="sha256_hash_2",
            # speaker_id, language, license are deliberately None (missing metadata)
        ),
    ]

    out_path, leakage_rep = ManifestGenerator.generate_and_save(records, manifest_csv, check_leakage=True)
    assert os.path.exists(out_path)
    assert leakage_rep.is_clean is True

    # Read back
    read_recs = ManifestReader.read_manifest(out_path)
    assert len(read_recs) == 2

    # Check first record
    assert read_recs[0].file_path == "data/audio1.wav"
    assert read_recs[0].dataset == "indicvoices"
    assert read_recs[0].label == "bona_fide"
    assert read_recs[0].language == "Hindi"
    assert read_recs[0].speaker_id == "spk_hi_01"
    assert read_recs[0].sample_rate == 16000
    assert pytest.approx(read_recs[0].duration_seconds, 0.001) == 3.1415

    # Check second record (missing fields remain None)
    assert read_recs[1].speaker_id is None
    assert read_recs[1].language is None
    assert read_recs[1].generator_id == "A01"
    assert read_recs[1].label == "spoof"


def test_empty_dataset_handling(temp_audio_dir):
    """Verify empty dataset directories produce empty manifests and zero statistics without crashing."""
    empty_dir = temp_audio_dir / "empty_folder"
    empty_dir.mkdir()

    adapter = GenericAudioAdapter(str(empty_dir))
    records = adapter.process()
    assert records == []

    metrics = QualityReporter.compute_metrics(records)
    assert metrics.total_files == 0
    assert metrics.valid_files == 0
    assert metrics.total_duration_seconds == 0.0
    assert metrics.unique_speakers_count == 0

    report = QualityReporter.generate_markdown_report(metrics)
    assert "**Total Audio Files Discovered:** 0" in report
    assert "No cross-split data leakage detected" in report


def test_asvspoof_adapter_with_protocol(temp_audio_dir):
    """Verify ASVSpoofAdapter parses trial protocol and audio files."""
    asv_dir = temp_audio_dir / "asvspoof"
    asv_dir.mkdir()

    # Create dummy audio file
    dummy_wav = asv_dir / "DF_E_0001.wav"
    with wave.open(str(dummy_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 8000)

    # Create protocol file
    proto_file = asv_dir / "trial_metadata.txt"
    proto_file.write_text("LA_0001 DF_E_0001 - A01 spoof eval\n", encoding="utf-8")

    adapter = ASVSpoofAdapter(str(asv_dir), protocol_file_path=str(proto_file))
    records = adapter.process()

    assert len(records) == 1
    assert records[0].dataset == DatasetName.ASVSPOOF2021.value
    assert records[0].speaker_id == "LA_0001"
    assert records[0].generator_id == "A01"
    assert records[0].label == AudioLabel.SPOOF.value
    assert pytest.approx(records[0].duration_seconds, 0.01) == 0.5


def test_quality_reporter_metrics_calculation():
    """Verify quality reporter statistical percentiles and distributions."""
    records = [
        ManifestRecord(file_path="f1.wav", split="train", label="bona_fide", language="Hindi", sample_rate=16000, duration_seconds=1.0, speaker_id="s1"),
        ManifestRecord(file_path="f2.wav", split="train", label="bona_fide", language="Hindi", sample_rate=16000, duration_seconds=2.0, speaker_id="s2"),
        ManifestRecord(file_path="f3.wav", split="train", label="spoof", language="Tamil", sample_rate=16000, duration_seconds=3.0, generator_id="g1"),
        ManifestRecord(file_path="f4.wav", split="test", label="spoof", language="Tamil", sample_rate=8000, duration_seconds=4.0, generator_id="g1"),
        ManifestRecord(file_path="f5.wav", split="test", label="spoof", language="Tamil", sample_rate=8000, duration_seconds=10.0, generator_id="g2"),
    ]

    metrics = QualityReporter.compute_metrics(records, invalid_files_count=1)
    assert metrics.total_files == 6
    assert metrics.valid_files == 5
    assert metrics.invalid_files == 1
    assert pytest.approx(metrics.total_duration_seconds, 0.01) == 20.0
    assert metrics.duration_min_seconds == 1.0
    assert metrics.duration_max_seconds == 10.0
    assert metrics.duration_mean_seconds == 4.0
    assert metrics.duration_median_seconds == 3.0
    assert metrics.sample_rate_distribution == {16000: 3, 8000: 2}
    assert metrics.label_distribution == {"bona_fide": 2, "spoof": 3}
    assert metrics.split_distribution == {"train": 3, "test": 2}
    assert metrics.unique_speakers_count == 2
    assert metrics.unique_generators_count == 2
