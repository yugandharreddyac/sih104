import pandas as pd
import numpy as np
from pathlib import Path

INPUT = "datasets/metadata/dataset_manifest.csv"
OUTPUT = "datasets/metadata/dataset_manifest_split.csv"

SEED = 42

df = pd.read_csv(INPUT)

df["speaker_id"] = df["speaker_id"].fillna("").astype(str).str.strip()

missing_speaker = df["speaker_id"] == ""

if missing_speaker.any():
    print(
        f"WARNING: {missing_speaker.sum()} records have no speaker_id "
        "and will remain unassigned."
    )

valid = df[~missing_speaker].copy()
unassigned = df[missing_speaker].copy()

speakers = valid["speaker_id"].unique().tolist()

print("Total speakers:", len(speakers))
print("Total audio files:", len(valid))

rng = np.random.default_rng(SEED)
rng.shuffle(speakers)

n = len(speakers)

train_end = int(0.70 * n)
val_end = train_end + int(0.15 * n)

train_speakers = set(speakers[:train_end])
val_speakers = set(speakers[train_end:val_end])
test_speakers = set(speakers[val_end:])

def assign_split(speaker):
    if speaker in train_speakers:
        return "train"
    if speaker in val_speakers:
        return "validation"
    if speaker in test_speakers:
        return "test"
    return "unassigned"

valid["split"] = valid["speaker_id"].apply(assign_split)

unassigned["split"] = "unassigned"

result = pd.concat([valid, unassigned], ignore_index=True)

Path(OUTPUT).parent.mkdir(parents=True, exist_ok=True)
result.to_csv(OUTPUT, index=False)

print("\n==============================")
print("SPEAKER SPLIT COMPLETE")
print("==============================")

print("\nSplit counts:")
print(result["split"].value_counts())

print("\nSpeaker counts:")
print("Train:", len(train_speakers))
print("Validation:", len(val_speakers))
print("Test:", len(test_speakers))

print("\nLanguage distribution:")
print(pd.crosstab(result["split"], result["language_code"]))

print("\nSaved to:")
print(OUTPUT)