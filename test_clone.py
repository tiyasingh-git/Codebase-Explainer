import traceback
try:
    from core_parser.cloner import clone_repo
    from core_parser.file_tree import get_code_files
    repo, tmp = clone_repo('https://github.com/pallets/flask')
    files = get_code_files(tmp)
    print('count:', len(files))
    print(files[:5])
except Exception as e:
    traceback.print_exc()
