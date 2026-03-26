import traceback
try:
    from core_parser.cloner import clone_repo
    from core_parser.file_tree import get_code_files
    from core_parser.extractor import extract_metadata
    
    print("Starting test...")
    repo, tmp = clone_repo('https://github.com/pallets/flask')
    print(f"Cloned to: {tmp}")
    
    files = get_code_files(tmp)
    print(f"Found {len(files)} files")
    
    print(f"Extracting metadata from: {files[0]}")
    result = extract_metadata(files[0], tmp)
    
    print('file:', result.path)
    print('functions:', [f.name for f in result.functions])
    print('classes:', [c.name for c in result.classes])
    print('imports:', result.imports[:3] if result.imports else [])
except Exception as e:
    traceback.print_exc()
