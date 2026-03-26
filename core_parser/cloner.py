import pygit2
import os

def clone_repo(repo_url: str, clone_dir: str = "output/cloned_repo") -> tuple[pygit2.Repository, str]:
    """
    Clones a remote GitHub repo into a permanent directory.
    Returns the repo object and the directory path.
    """
    os.makedirs(clone_dir, exist_ok=True)
    print(f"[*] Cloning {repo_url} into {clone_dir}...")
    
    repo = pygit2.clone_repository(repo_url, clone_dir)
    
    print(f"[+] Clone successful!")
    return repo, clone_dir