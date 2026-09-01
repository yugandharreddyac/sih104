import pandas as pd
import os
import csv

# Source Parquet files
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

# Language codes expected by the pipeline
language_codes = {
    "hindi": "hi",
    "telugu": "te",
    "tamil": "ta",
    "malayalam": "ml",
    "kannada": "kn"
}

manifest_path = "datasets/metadata/dataset_manifest.csv"

os.makedirs("datasets/metadata", exist_ok=True)

rows = []

for language, parquet_files in files.items():

    code = language_codes[language]
    output_dir = f"datasets/raw/indicvoices/{code}"
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n========== {language.upper()} ==========")

    counter = 0

    for parquet_file in parquet_files:

        print(f"Reading: {parquet_file}")

        df = pd.read_parquet(parquet_file)

        print(f"Records: {len(df)}")

        for _, row in df.iterrows():

            audio = row["audio_filepath"]

            if not isinstance(audio, dict) or "bytes" not in audio:
                print("Skipping record with missing audio")
                continue

            audio_bytes = audio["bytes"]

            filename = f"{code}_{counter:06d}.flac"
            output_path = os.path.join(output_dir, filename)

            with open(output_path, "wb") as f:
                f.write(audio_bytes)

            rows.append({
                "dataset": "indicvoices",
                "label": "bona_fide",
                "language_code": code,
                "file_path": f"datasets/raw/indicvoices/{code}/{filename}",
                "generator_id": "",
                "speaker_id": row.get("speaker_id", ""),
                "gender": row.get("gender", ""),
                "age_group": row.get("age_group", ""),
                "duration": row.get("duration", "")
            })

            counter += 1

            if counter % 500 == 0:
                print(f"Extracted {counter} files...")

    print(f"Finished {language}: {counter} audio files")

print("\nCreating manifest...")

fieldnames = [
    "dataset",
    "label",
    "language_code",
    "file_path",
    "generator_id",
    "speaker_id",
    "gender",
    "age_group",
    "duration"
]

with open(manifest_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print("\n================================")
print("EXTRACTION COMPLETE")
print("Total audio files:", len(rows))
print("Manifest:", manifest_path)
print("================================")