"""SIH104 — Robust FFmpeg Discovery and Audio Decode Utility.

Discovers FFmpeg from multiple locations without hardcoding user-specific paths:
  1. Environment variable FFMPEG_PATH
  2. System PATH via shutil.which()
  3. WinGet Packages directory (Windows)
  4. Common installation directories (/usr/local/bin, C:/ffmpeg, Program Files)

Usage:
    from ai.app.ml.ffmpeg_util import decode_audio_to_float32, get_ffmpeg_exe

    samples = decode_audio_to_float32("path/to/audio.flac")
    # Returns np.ndarray of float32 samples at 16 kHz, mono
"""

from __future__ import annotations

import glob
import logging
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Target decoding parameters
TARGET_SR = 16000
TARGET_CHANNELS = 1
TARGET_FORMAT = "f32le"  # float32 little-endian PCM


@lru_cache(maxsize=1)
def get_ffmpeg_exe(ffmpeg_hint: Optional[str] = None) -> str:
    """Discover and validate FFmpeg executable path.

    Search order:
    1. Explicit hint (argument or FFMPEG_PATH env var)
    2. System PATH
    3. WinGet package directories (Windows)
    4. Common manual install locations

    Args:
        ffmpeg_hint: Optional explicit path to ffmpeg binary.

    Returns:
        Absolute path to a validated ffmpeg executable.

    Raises:
        RuntimeError: If no working FFmpeg is found.
    """
    candidates: list[str] = []

    # 1. Explicit hint or environment variable
    if ffmpeg_hint:
        candidates.append(str(ffmpeg_hint))
    env_path = os.environ.get("FFMPEG_PATH", "").strip()
    if env_path:
        candidates.append(env_path)

    # 2. System PATH
    path_exe = shutil.which("ffmpeg")
    if path_exe:
        candidates.append(path_exe)

    # 3. WinGet package directory (Windows-specific, non-hardcoded)
    userprofile = os.environ.get("USERPROFILE", "")
    if userprofile:
        winget_glob = os.path.join(
            userprofile,
            "AppData", "Local", "Microsoft", "WinGet", "Packages",
            "*ffmpeg*", "**", "ffmpeg.exe",
        )
        candidates.extend(glob.glob(winget_glob, recursive=True))

    # 4. Common manual install locations
    common_locations = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
    ]
    candidates.extend(common_locations)

    # Validate candidates
    for candidate in candidates:
        if not candidate:
            continue
        candidate = str(candidate).strip()
        if not os.path.isfile(candidate):
            continue
        try:
            result = subprocess.run(
                [candidate, "-version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=10,
            )
            if result.returncode == 0:
                logger.info("FFmpeg discovered at: %s", candidate)
                return candidate
        except (OSError, subprocess.TimeoutExpired):
            continue

    raise RuntimeError(
        "FFmpeg not found. Please install FFmpeg and ensure it is on your system PATH, "
        "or set the FFMPEG_PATH environment variable to the full path of your ffmpeg executable. "
        "Download from: https://ffmpeg.org/download.html"
    )


def decode_audio_to_float32(
    audio_path: str | Path,
    ffmpeg_exe: Optional[str] = None,
    target_sr: int = TARGET_SR,
) -> np.ndarray:
    """Decode an audio file to mono float32 PCM using FFmpeg.

    Supports any format FFmpeg can read: FLAC, WAV, MP3, OGG, M4A, etc.

    Args:
        audio_path: Path to the input audio file.
        ffmpeg_exe: Optional path to the FFmpeg binary. Auto-discovered if None.
        target_sr: Target sample rate in Hz (default: 16000).

    Returns:
        1-D np.ndarray of float32 samples at target_sr, mono.

    Raises:
        RuntimeError: If FFmpeg fails to decode the audio.
        FileNotFoundError: If the audio file does not exist.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    exe = ffmpeg_exe or get_ffmpeg_exe()

    cmd = [
        exe,
        "-v", "error",
        "-i", str(audio_path),
        "-f", TARGET_FORMAT,
        "-ac", str(TARGET_CHANNELS),
        "-ar", str(target_sr),
        "-",
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"FFmpeg timed out decoding: {audio_path}")

    if result.returncode != 0:
        stderr_msg = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(
            f"FFmpeg failed (code {result.returncode}) for {audio_path}: {stderr_msg}"
        )

    if not result.stdout:
        raise RuntimeError(f"FFmpeg produced no PCM output for: {audio_path}")

    samples = np.frombuffer(result.stdout, dtype=np.float32)
    if len(samples) == 0:
        raise RuntimeError(f"Empty audio decoded from: {audio_path}")

    return samples
