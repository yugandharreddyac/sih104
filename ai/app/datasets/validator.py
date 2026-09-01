"""VOXSHIELD Audio File Validator & Metadata Extractor
Validates audio binary integrity, computes cryptographic checksums, extracts audio properties
(sample rate, duration, channels), and normalizes ground truth labels and language codes.
"""

from __future__ import annotations
import hashlib
import os
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import soundfile as sf

from ai.app.asr.language import LanguageIdentifier, LanguageCode
from ai.app.datasets.types import AudioLabel, AudioValidationResult


SUPPORTED_AUDIO_EXTENSIONS: Set[str] = {
    ".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aac", ".webm", ".wma", ".opus"
}

LABEL_SYNONYMS: Dict[str, AudioLabel] = {
    "bona_fide": AudioLabel.BONA_FIDE,
    "bonafide": AudioLabel.BONA_FIDE,
    "real": AudioLabel.BONA_FIDE,
    "genuine": AudioLabel.BONA_FIDE,
    "human": AudioLabel.BONA_FIDE,
    "original": AudioLabel.BONA_FIDE,
    "spoof": AudioLabel.SPOOF,
    "fake": AudioLabel.SPOOF,
    "synthetic": AudioLabel.SPOOF,
    "deepfake": AudioLabel.SPOOF,
    "tts": AudioLabel.SPOOF,
    "vc": AudioLabel.SPOOF,
}


class AudioFileValidator:
    """Provides safe, deterministic validation and property extraction for audio files."""

    @staticmethod
    def is_audio_file(file_path: str) -> bool:
        """Check if file extension matches supported audio formats."""
        ext = os.path.splitext(file_path)[1].lower()
        return ext in SUPPORTED_AUDIO_EXTENSIONS

    @staticmethod
    def compute_checksum(file_path: str, chunk_size: int = 65536) -> str:
        """Compute SHA-256 hexadecimal digest of a file in bounded chunks."""
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(chunk_size):
                hasher.update(chunk)
        return hasher.hexdigest()

    @classmethod
    def validate_audio_file(cls, file_path: str, compute_hash: bool = True) -> AudioValidationResult:
        """Thoroughly validate audio file readability and extract acoustic metadata.
        
        Catches corrupted headers, zero-byte files, and unreadable codecs without crashing.
        """
        path = Path(file_path)

        if not path.exists():
            return AudioValidationResult(
                file_path=file_path,
                is_valid=False,
                error_message=f"File does not exist: {file_path}",
            )

        if not path.is_file():
            return AudioValidationResult(
                file_path=file_path,
                is_valid=False,
                error_message=f"Path is not a regular file: {file_path}",
            )

        file_size = path.stat().st_size
        if file_size == 0:
            return AudioValidationResult(
                file_path=file_path,
                is_valid=False,
                file_size_bytes=0,
                error_message="Empty file (0 bytes)",
            )

        checksum = None
        if compute_hash:
            try:
                checksum = cls.compute_checksum(str(path))
            except Exception as e:
                return AudioValidationResult(
                    file_path=file_path,
                    is_valid=False,
                    file_size_bytes=file_size,
                    error_message=f"Failed to compute file checksum: {str(e)}",
                )

        try:
            # Use soundfile to inspect audio header and frames
            info = sf.info(str(path))
            sample_rate = info.samplerate
            channels = info.channels
            duration = info.duration

            if sample_rate <= 0 or duration <= 0 or channels <= 0:
                return AudioValidationResult(
                    file_path=file_path,
                    is_valid=False,
                    file_size_bytes=file_size,
                    checksum=checksum,
                    error_message=f"Invalid audio parameters: sr={sample_rate}, dur={duration}, ch={channels}",
                )

            return AudioValidationResult(
                file_path=file_path,
                is_valid=True,
                sample_rate=sample_rate,
                duration_seconds=duration,
                channels=channels,
                file_size_bytes=file_size,
                checksum=checksum,
            )

        except Exception as err:
            return AudioValidationResult(
                file_path=file_path,
                is_valid=False,
                file_size_bytes=file_size,
                checksum=checksum,
                error_message=f"Corrupted or unsupported audio format: {str(err)}",
            )

    @staticmethod
    def normalize_label(raw_label: Optional[str]) -> Tuple[AudioLabel, bool]:
        """Normalize arbitrary ground-truth label string to standard AudioLabel enum.
        
        Returns:
            Tuple of (AudioLabel, is_valid)
        """
        if not raw_label:
            return AudioLabel.UNKNOWN, False

        cleaned = str(raw_label).strip().lower()
        if cleaned in LABEL_SYNONYMS:
            return LABEL_SYNONYMS[cleaned], True

        return AudioLabel.UNKNOWN, False

    @staticmethod
    def normalize_language(raw_lang: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """Normalize language name or code using LanguageIdentifier.
        
        Returns:
            Tuple of (language_display_name, normalized_language_code)
        """
        if not raw_lang:
            return None, None

        code = LanguageIdentifier.normalize_language_code(raw_lang)
        if code in (LanguageCode.UNSUPPORTED, LanguageCode.UNKNOWN):
            # If not in standard list, return cleaned string as custom language
            return str(raw_lang).strip(), None

        display_names: Dict[LanguageCode, str] = {
            LanguageCode.HI: "Hindi",
            LanguageCode.TA: "Tamil",
            LanguageCode.TE: "Telugu",
            LanguageCode.BN: "Bengali",
            LanguageCode.MR: "Marathi",
            LanguageCode.EN_IN: "Indian English",
            LanguageCode.EN: "English",
        }

        return display_names.get(code, str(code.value)), code.value

    @classmethod
    def discover_audio_files(cls, directory_path: str, recursive: bool = True) -> List[str]:
        """Discover all supported audio files within a target directory tree."""
        discovered: List[str] = []
        root = Path(directory_path)

        if not root.exists() or not root.is_dir():
            return discovered

        if recursive:
            for entry in root.rglob("*"):
                if entry.is_file() and cls.is_audio_file(str(entry)):
                    discovered.append(str(entry.resolve()))
        else:
            for entry in root.glob("*"):
                if entry.is_file() and cls.is_audio_file(str(entry)):
                    discovered.append(str(entry.resolve()))

        return sorted(discovered)
