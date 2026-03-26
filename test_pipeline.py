import traceback
try:
    from core_parser.pipeline import run
    print("Starting pipeline...")
    result = run('https://github.com/pallets/flask')
    print(f"\nPipeline complete!")
    print(f"Repository: {result.repo_url}")
    print(f"Total files: {len(result.files)}")
    if result.files:
        print(f"First file: {result.files[0].path}")
        print(f"  Functions: {len(result.files[0].functions)}")
        print(f"  Classes: {len(result.files[0].classes)}")
except Exception as e:
    traceback.print_exc()
