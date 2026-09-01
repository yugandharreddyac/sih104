import pandas as pd
import os
import csv
import soundfile as sf

# Existing Parquet files
files = {
    "hindi": [
        "datasets/indicvoices_download/hindi/valid-00000-of-00001.parquet"
    ],
    "telugu": [
        "datasets/indicvoices_download/telugu/valid-00000-of-00001.parquet"
    ],
    "tamil": [
        "datasets/indicvoices_download/tamil/valid-00000-of-00002.parquet",
        "datasets/indicvoices_download/tamil/valid-00001-of-00002.parquet"
    ],
    "malayalam": [
        "datasets/indicvoices_download/malayalam/valid-00000-of-00002.parquet",
        "datasets/indicvoices_download/malayalam/valid-00001-of-00002.parquet"
    ],
    "kannada": [
        "datasets/indicvoices_download/kannada/valid-00000-of-00002.parquet",
        "datasets/indicvoices_download/kannada/valid-00001-of-00002.parquet"
    ]
}

language_codes = {
    "hindi": "hi",
    "telugu": "te",
    "tamil": "ta",
    "malayalam": "ml",
    "kannada": "kn"
}

manifest_path = "datasets/metadata/dataset_manifest.csv"

rows = []

for language, parquet_files in files.items():

    code = language_codes[language]
    audio_dir = f"datasets/raw/indicvoices/{code}"

    print(f"\n========== {language.upper()} ==========")

    counter = 0

    for parquet_file in parquet_files:

        print(f"Reading: {parquet_file}")

        df = pd.read_parquet(parquet_file)

        print(f"Records: {len(df)}")

        for _, row in df.iterrows():

            filename = f"{code}_{counter:06d}.flac"
            audio_path = os.path.join(audio_dir, filename)

            if not os.path.exists(audio_path):
                print(f"Missing audio: {audio_path}")
                counter += 1
                continue

            try:
                info = sf.info(audio_path)

                sample_rate = info.samplerate
                duration_seconds = info.duration

            except Exception as e:
                print(f"Could not read {audio_path}: {e}")
                counter += 1
                continue

            rows.append({
                "dataset": "indicvoices",
                "label": "bona_fide",
                "language": language,
                "language_code": code,
                "file_path": audio_path.replace("\\", "/"),
                "generator_id": "",
                "speaker_id": row.get("speaker_id", ""),
                "gender": row.get("gender", ""),
                "age_group": row.get("age_group", ""),
                "sample_rate": sample_rate,
                "duration_seconds": round(duration_seconds, 4)
            })

            counter += 1

            if counter % 500 == 0:
                print(f"Processed {counter} files...")

print("\nCreating corrected manifest...")

fieldnames = [
    "dataset",
    "label",
    "language",
    "language_code",
    "file_path",
    "generator_id",
    "speaker_id",
    "gender",
    "age_group",
    "sample_rate",
    "duration_seconds"
]

os.makedirs(os.path.dirname(manifest_path), exist_ok=True)

with open(manifest_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print("\n================================")
print("MANIFEST REBUILD COMPLETE")
print("Total records:", len(rows))
print("Manifest:", manifest_path)
print("================================")