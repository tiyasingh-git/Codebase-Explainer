import os
from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
from core_parser.models import FileMetadata, FunctionInfo, ClassInfo

# Setup languages
PY_LANGUAGE = Language(tspython.language())
JS_LANGUAGE = Language(tsjavascript.language())

LANGUAGE_MAP = {
    ".py": PY_LANGUAGE,
    ".js": JS_LANGUAGE,
    ".jsx": JS_LANGUAGE,
}

def get_language(file_path: str):
    _, ext = os.path.splitext(file_path)
    return LANGUAGE_MAP.get(ext, None)

def extract_metadata(file_path: str, repo_dir: str) -> FileMetadata:
    rel_path = os.path.relpath(file_path, repo_dir)
    _, ext = os.path.splitext(file_path)
    lang = get_language(file_path)

    metadata = FileMetadata(
        path=rel_path,
        language=ext.lstrip(".")
    )

    if lang is None:
        return metadata

    with open(file_path, "rb") as f:
        source = f.read()

    parser = Parser(lang)
    tree = parser.parse(source)
    root = tree.root_node

    # Extract functions
    for node in root.children:
        if node.type == "function_definition":  # Python
            name_node = node.child_by_field_name("name")
            if name_node:
                metadata.functions.append(FunctionInfo(
                    name=name_node.text.decode(),
                    line_start=node.start_point[0],
                    line_end=node.end_point[0]
                ))

        # Extract classes
        if node.type == "class_definition":  # Python
            name_node = node.child_by_field_name("name")
            if name_node:
                metadata.classes.append(ClassInfo(
                    name=name_node.text.decode()
                ))

        # Extract imports
        if node.type in ("import_statement", "import_from_statement"):
            metadata.imports.append(node.text.decode())

    return metadata