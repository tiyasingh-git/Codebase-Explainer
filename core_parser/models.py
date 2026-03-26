from dataclasses import dataclass, field
from typing import List

@dataclass
class FunctionInfo:
    name: str
    line_start: int
    line_end: int

@dataclass
class ClassInfo:
    name: str
    methods: List[str] = field(default_factory=list)

@dataclass
class RouteInfo:
    method: str       # GET, POST, PUT, DELETE
    path: str         # e.g. "/api/users"
    handler: str      # function name handling it

@dataclass
class FileMetadata:
    path: str         # relative path in repo e.g. "src/app.py"
    language: str     # "python", "javascript", etc.
    imports: List[str] = field(default_factory=list)
    classes: List[ClassInfo] = field(default_factory=list)
    functions: List[FunctionInfo] = field(default_factory=list)
    routes: List[RouteInfo] = field(default_factory=list)

@dataclass
class RepoMetadata:
    repo_url: str
    default_branch: str
    files: List[FileMetadata] = field(default_factory=list)