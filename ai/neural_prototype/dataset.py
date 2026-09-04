"""ASVspoof 2021 DF Benchmark Dataset for Neural Training.

Loads labeled audio records from datasets/processed/asvspoof_benchmark_2000.parquet,
resolves raw FLAC files from ASVspoof part directories, and yields 2-channel
spectrogram tensors for PyTorch DataLoader consumption.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import soundfile as sf
import torch
from torch.utils.data import Dataset

from ai.neural_prototype.features import TwoChannelSpectrogramExtractor

logger = logging.getLogger(__name__)

ASVSPOOF_PART_DIRS = [
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part00/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part01/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part02/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part03/ASVspoof2021_DF_eval/flac",
]


def resolve_flac_paths(audio_ids: set[str], repo_root: Path) -> Dict[str, str]:
    """Efficiently finds the file path for each audio_id in the ASVspoof parts."""
    flac_map: Dict[str, str] = {}
    for rel_dir in ASVSPOOF_PART_DIRS:
        abs_dir = repo_root / rel_dir
        if not abs_dir.exists():
            continue
        with os.scandir(abs_dir) as it:
            for entry in it:
                if entry.name.endswith(".flac"):
                    stem = entry.name[:-5]
                    if stem in audio_ids:
                        flac_map[stem] = entry.path
                        if len(flac_map) == len(audio_ids):
                            return flac_map
    return flac_map


class ASVSpoof2021BenchmarkDataset(Dataset):
    """PyTorch Dataset wrapping the ASVspoof 2021 2,000-sample benchmark partition."""

    def __init__(
        self,
        split: str = "train",
        parquet_path: str = "datasets/processed/asvspoof_benchmark_2000.parquet",
        repo_root: Optional[str] = None,
        preload_to_memory: bool = False,
    ) -> None:
        if split not in {"train", "val", "test"}:
            raise ValueError(f"Invalid split: {split}. Must be 'train', 'val', or 'test'.")

        self.split = split
        self.root = Path(repo_root) if repo_root else Path.cwd()
        abs_parquet = self.root / parquet_path

        if not abs_parquet.exists():
            raise FileNotFoundError(f"Benchmark parquet not found at {abs_parquet}")

        full_df = pd.read_parquet(abs_parquet)
        self.df = full_df[full_df["split"] == split].reset_index(drop=True)

        if len(self.df) == 0:
            raise ValueError(f"Split '{split}' has 0 samples in {parquet_path}")

        # Resolve FLAC audio files
        audio_ids = set(self.df["audio_id"])
        self.flac_map = resolve_flac_paths(audio_ids, self.root)

        missing = audio_ids - set(self.flac_map.keys())
        if missing:
            raise FileNotFoundError(f"Missing {len(missing)} FLAC files on disk. E.g.: {list(missing)[:3]}")

        self.extractor = TwoChannelSpectrogramExtractor()
        self.preload = preload_to_memory
        self._cache: Dict[int, Tuple[torch.Tensor, int, str]] = {}

        if self.preload:
            self._preload_all()

    def _preload_all(self) -> None:
        logger.info("Pre-loading %d samples for split '%s' into memory...", len(self.df), self.split)
        for idx in range(len(self.df)):
            self._cache[idx] = self._load_item(idx)

    def _load_item(self, index: int) -> Tuple[torch.Tensor, int, str]:
        row = self.df.iloc[index]
        audio_id = str(row["audio_id"])
        label = int(row["label"])
        flac_path = self.flac_map[audio_id]

        # Robust audio loading: try FFmpeg first (handles all FLAC variants), fallback to soundfile
        try:
            from ai.app.ml.ffmpeg_util import decode_audio_to_float32
            data = decode_audio_to_float32(flac_path, target_sr=16000)
        except Exception:
            data, _ = sf.read(flac_path, dtype="float32")

        wave_tensor = torch.from_numpy(data.copy())
        features = self.extractor.extract(wave_tensor)
        return features, label, audio_id

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, torch.Tensor, str]:
        if self.preload and index in self._cache:
            features, label, audio_id = self._cache[index]
        else:
            features, label, audio_id = self._load_item(index)

        return features, torch.tensor(label, dtype=torch.long), audio_id
