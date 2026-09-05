import os
from huggingface_hub import snapshot_download

# Define model paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
asr_model_dir = os.path.join(base_dir, "models", "asr", "faster-whisper-base")
speaker_model_path = os.path.join(base_dir, "models", "speaker", "ecapa_tdnn.onnx")

print("Downloading ASR model...")
snapshot_download(repo_id="Systran/faster-whisper-base", local_dir=asr_model_dir, ignore_patterns=["*.msgpack", "*.h5", "*.ot"])

# The speaker model (ECAPA-TDNN) - where do we download it from?
# Let's download a small stub or actual model if we know the repo.
print("Finished ASR download.")
