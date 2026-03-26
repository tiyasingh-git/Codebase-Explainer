import os

# Files extensions we care about
CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".go", ".rb", ".php", ".cs"
}

# Folders to skip
EXCLUDED_DIRS = {
    "node_modules", ".git", "venv", ".venv",
    "__pycache__", ".mypy_cache", "dist", "build"
}

def get_code_files(repo_dir: str) -> list[str]:
    """
    Walks the cloned repo directory and returns
    a list of paths to all relevant code files.
    """
    code_files = []

    for root, dirs, files in os.walk(repo_dir):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

        for file in files:
            _, ext = os.path.splitext(file)
            if ext in CODE_EXTENSIONS:
                full_path = os.path.join(root, file)
                code_files.append(full_path)

    print(f"📂 Found {len(code_files)} code files")
    return code_files