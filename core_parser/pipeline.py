import json
import os
from core_parser.cloner import clone_repo
from core_parser.file_tree import get_code_files
from core_parser.extractor import extract_metadata
from core_parser.models import RepoMetadata
from dataclasses import asdict

def run(repo_url: str, output_path: str = "output/metadata.json") -> RepoMetadata:
    """
    Full pipeline:
    1. Clone repo
    2. Get code files
    3. Extract metadata from each file
    4. Save to JSON
    """
    # Step 1 - Clone
    repo, tmp_dir = clone_repo(repo_url)

    # Step 2 - Get files
    code_files = get_code_files(tmp_dir)

    # Step 3 - Extract metadata
    repo_meta = RepoMetadata(
        repo_url=repo_url,
        default_branch="main"
    )

    for i, file_path in enumerate(code_files):
        print(f"[*] Parsing file {i+1}/{len(code_files)}: {file_path}")
        file_meta = extract_metadata(file_path, tmp_dir)
        repo_meta.files.append(file_meta)

    # Step 4 - Save to JSON
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(asdict(repo_meta), f, indent=2)

    print(f"\n[+] Done! Metadata saved to {output_path}")
    print(f"[*] Total files parsed: {len(repo_meta.files)}")
    return repo_meta