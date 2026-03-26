import pygit2
import tempfile
import os

def clone_repo(repo_url: str) -> tuple[pygit2.Repository, str]:
    """
    Clones a remote GitHub repo into a temporary directory.
    Returns the repo object and the temp directory path.
    """
    tmp_dir = tempfile.mkdtemp()
    print(f"📥 Cloning {repo_url} into {tmp_dir}...")
    
    repo = pygit2.clone_repository(repo_url, tmp_dir)
    
    print(f"✅ Clone successful!")
    return repo, tmp_dir