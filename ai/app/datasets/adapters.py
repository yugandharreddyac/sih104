"""VOXSHIELD Dataset Adapters
Provides configurable ingestion adapters for ASVspoof 2021 DF, AI4Bharat IndicVoices,
Indic Parler-TTS, and generic audio repositories.
"""

from __future__ import annotations
import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ai.app.datasets.types import (
    AudioLabel,
    DatasetName,
    ManifestRecord,
    SplitType,
)
from ai.app.datasets.validator import AudioFileValidator


class BaseDatasetAdapter(ABC):
    """Abstract base adapter for dataset discovery and manifest record creation."""

    def __init__(self, root_dir: str, dataset_name: DatasetName = DatasetName.CUSTOM):
        self.root_dir = Path(root_dir)
        self.dataset_name = dataset_name

    @abstractmethod
    def process(self, compute_hash: bool = True) -> List[ManifestRecord]:
        """Scan the dataset directory and produce standardized ManifestRecord instances."""
        pass


class GenericAudioAdapter(BaseDatasetAdapter):
    """Configurable adapter for arbitrary or unstructured audio folder hierarchies."""

    def __init__(
        self,
        root_dir: str,
        dataset_name: DatasetName = DatasetName.CUSTOM,
        default_split: SplitType = SplitType.UNASSIGNED,
        default_label: AudioLabel = AudioLabel.UNKNOWN,
        default_language: Optional[str] = None,
        license_tag: Optional[str] = None,
    ):
        super().__init__(root_dir, dataset_name)
        self.default_split = default_split
        self.default_label = default_label
        self.default_language = default_language
        self.license_tag = license_tag

    def process(self, compute_hash: bool = True) -> List[ManifestRecord]:
        records: List[ManifestRecord] = []
        if not self.root_dir.exists():
            return records

        audio_files = AudioFileValidator.discover_audio_files(str(self.root_dir))
        lang_name, lang_code = AudioFileValidator.normalize_language(self.default_language)

        for audio_path in audio_files:
            val_res = AudioFileValidator.validate_audio_file(audio_path, compute_hash=compute_hash)
            if not val_res.is_valid:
                continue

            records.append(
                ManifestRecord(
                    file_path=str(Path(audio_path).resolve()),
                    dataset=self.dataset_name.value,
                    split=self.default_split.value,
                    label=self.default_label.value,
                    language=lang_name,
                    language_code=lang_code,
                    sample_rate=val_res.sample_rate,
                    duration_seconds=val_res.duration_seconds,
                    license=self.license_tag,
                    checksum=val_res.checksum,
                )
            )

        return records


class ASVSpoofAdapter(BaseDatasetAdapter):
    """Adapter for ASVspoof 2021 (DF / LA) directory structures and protocol key files."""

    def __init__(
        self,
        root_dir: str,
        protocol_file_path: Optional[str] = None,
        default_split: SplitType = SplitType.TEST,
    ):
        super().__init__(root_dir, DatasetName.ASVSPOOF2021)
        self.protocol_file_path = protocol_file_path
        self.default_split = default_split

    def process(self, compute_hash: bool = True) -> List[ManifestRecord]:
        records: List[ManifestRecord] = []
        if not self.root_dir.exists():
            return records

        # 1. If a protocol metadata file is provided or discovered, parse it
        protocol_map: Dict[str, Dict[str, str]] = {}
        proto_path = self.protocol_file_path
        if not proto_path:
            # Check common ASVspoof protocol locations
            candidate_keys = list(self.root_dir.rglob("*.txt"))
            for ck in candidate_keys:
                if "key" in ck.name.lower() or "trial" in ck.name.lower() or "metadata" in ck.name.lower():
                    proto_path = str(ck)
                    break

        if proto_path and Path(proto_path).exists():
            protocol_map = self._parse_protocol_file(proto_path)

        # 2. Discover audio files
        audio_files = AudioFileValidator.discover_audio_files(str(self.root_dir))

        for audio_path in audio_files:
            file_name = Path(audio_path).name
            file_stem = Path(audio_path).stem

            val_res = AudioFileValidator.validate_audio_file(audio_path, compute_hash=compute_hash)
            if not val_res.is_valid:
                continue

            # Look up metadata from protocol if available
            meta = protocol_map.get(file_name) or protocol_map.get(file_stem) or {}

            raw_label = meta.get("label")
            label_enum, _ = AudioFileValidator.normalize_label(raw_label)
            if label_enum == AudioLabel.UNKNOWN:
                # Check filename conventions
                if "bonafide" in file_name.lower() or "bona_fide" in file_name.lower():
                    label_enum = AudioLabel.BONA_FIDE
                elif "spoof" in file_name.lower() or "fake" in file_name.lower():
                    label_enum = AudioLabel.SPOOF

            split_val = meta.get("split", self.default_split.value)
            speaker_id = meta.get("speaker_id")
            generator_id = meta.get("generator_id")

            records.append(
                ManifestRecord(
                    file_path=str(Path(audio_path).resolve()),
                    dataset=self.dataset_name.value,
                    split=split_val,
                    label=label_enum.value,
                    language="English",
                    language_code="en",
                    speaker_id=speaker_id,
                    generator_id=generator_id,
                    sample_rate=val_res.sample_rate,
                    duration_seconds=val_res.duration_seconds,
                    source_metadata=json.dumps(meta) if meta else None,
                    license="ASVSpoof-2021",
                    checksum=val_res.checksum,
                )
            )

        return records

    def _parse_protocol_file(self, protocol_path: str) -> Dict[str, Dict[str, str]]:
        """Parse standard ASVspoof whitespace-delimited trial metadata."""
        meta_map: Dict[str, Dict[str, str]] = {}
        try:
            with open(protocol_path, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if not parts or line.startswith("#"):
                        continue

                    # Typical ASVspoof LA/DF format:
                    # [SPEAKER_ID] [FILE_NAME] [ENV/CODEC] [ATTACK/GEN] [KEY (bonafide/spoof)]
                    # Or with split: [SPLIT] [SPEAKER_ID] [FILE_NAME] [SYSTEM_ID] [KEY]
                    if len(parts) >= 5:
                        spk = parts[0]
                        fname = parts[1]
                        gen = parts[3]
                        key = parts[4].lower()
                        meta_map[fname] = {
                            "speaker_id": spk,
                            "generator_id": gen if key == "spoof" else None,
                            "label": key,
                        }
                    elif len(parts) >= 2:
                        fname = parts[0]
                        key = parts[1].lower()
                        meta_map[fname] = {
                            "label": key,
                        }
        except Exception:
            pass
        return meta_map


class IndicVoicesAdapter(BaseDatasetAdapter):
    """Adapter for AI4Bharat IndicVoices real human Indian speech corpus."""

    def __init__(
        self,
        root_dir: str,
        default_split: SplitType = SplitType.TRAIN,
    ):
        super().__init__(root_dir, DatasetName.INDICVOICES)
        self.default_split = default_split

    def process(self, compute_hash: bool = True) -> List[ManifestRecord]:
        records: List[ManifestRecord] = []
        if not self.root_dir.exists():
            return records

        audio_files = AudioFileValidator.discover_audio_files(str(self.root_dir))

        for audio_path in audio_files:
            val_res = AudioFileValidator.validate_audio_file(audio_path, compute_hash=compute_hash)
            if not val_res.is_valid:
                continue

            path_obj = Path(audio_path)
            # Infer language and speaker ID from directory structure if available
            # e.g., datasets/raw/indicvoices/hi/speaker_001/audio.wav
            rel_parts = path_obj.relative_to(self.root_dir).parts if self.root_dir in path_obj.parents else path_obj.parts

            lang_candidate = None
            spk_candidate = None

            if len(rel_parts) >= 2:
                lang_candidate = rel_parts[0]
            if len(rel_parts) >= 3:
                spk_candidate = rel_parts[1]

            lang_name, lang_code = AudioFileValidator.normalize_language(lang_candidate)

            records.append(
                ManifestRecord(
                    file_path=str(path_obj.resolve()),
                    dataset=self.dataset_name.value,
                    split=self.default_split.value,
                    label=AudioLabel.BONA_FIDE.value,
                    language=lang_name,
                    language_code=lang_code,
                    speaker_id=spk_candidate,
                    generator_id=None,
                    sample_rate=val_res.sample_rate,
                    duration_seconds=val_res.duration_seconds,
                    license="CC-BY-4.0",
                    checksum=val_res.checksum,
                )
            )

        return records


class IndicParlerTTSAdapter(BaseDatasetAdapter):
    """Adapter for Indic Parler-TTS synthetic Indian speech corpus."""

    def __init__(
        self,
        root_dir: str,
        default_split: SplitType = SplitType.TRAIN,
        generator_model: str = "indic_parler_tts",
    ):
        super().__init__(root_dir, DatasetName.INDIC_PARLER_TTS)
        self.default_split = default_split
        self.generator_model = generator_model

    def process(self, compute_hash: bool = True) -> List[ManifestRecord]:
        records: List[ManifestRecord] = []
        if not self.root_dir.exists():
            return records

        audio_files = AudioFileValidator.discover_audio_files(str(self.root_dir))

        for audio_path in audio_files:
            val_res = AudioFileValidator.validate_audio_file(audio_path, compute_hash=compute_hash)
            if not val_res.is_valid:
                continue

            path_obj = Path(audio_path)
            # Infer language and speaker/voice ID from directory structure if available
            # e.g., datasets/raw/indic_parler_tts/hi/voice_01/audio.wav
            rel_parts = path_obj.relative_to(self.root_dir).parts if self.root_dir in path_obj.parents else path_obj.parts

            lang_candidate = None
            spk_candidate = None

            if len(rel_parts) >= 2:
                lang_candidate = rel_parts[0]
            if len(rel_parts) >= 3:
                spk_candidate = rel_parts[1]

            lang_name, lang_code = AudioFileValidator.normalize_language(lang_candidate)

            records.append(
                ManifestRecord(
                    file_path=str(path_obj.resolve()),
                    dataset=self.dataset_name.value,
                    split=self.default_split.value,
                    label=AudioLabel.SPOOF.value,
                    language=lang_name,
                    language_code=lang_code,
                    speaker_id=spk_candidate,
                    generator_id=self.generator_model,
                    sample_rate=val_res.sample_rate,
                    duration_seconds=val_res.duration_seconds,
                    license="CC-BY-4.0",
                    checksum=val_res.checksum,
                )
            )

        return records
