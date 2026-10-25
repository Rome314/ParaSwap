#!/usr/bin/env python3
"""Check that project files are local before tools try to read cloud placeholders.

Uses metadata only: never reads credentials, downloads files, or runs Git/npm.
"""

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
SF_DATALESS = 0x40000000  # macOS sys/stat.h; absent st_flags means a normal file.
EXCLUDED_DIRS = {
    "node_modules", "artifacts", "cache", "coverage", "dist",
    "__pycache__", ".venv", ".harness2", "worktrees",
}
REQUIRED = ("README.md", "package.json", "package-lock.json", "frontend/package.json",
            "blockchain/package.json", "packages/contracts/package.json", "subgraph/package.json",
            "backend/go.mod", "blockchain/hardhat.config.ts", "frontend/vite.config.ts")


def is_private(name):
    return (name.startswith(".env") and name != ".env.example") or name in {
        "settings.local.json", "CLAUDE.local.md", ".DS_Store",
    }


def scan(root):
    """Inventory metadata without opening source files or following symlinks."""
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    placeholders = []
    errors = []
    checked = 0

    def walk_error(error):
        errors.append(str(Path(error.filename).relative_to(root)))

    for base, dirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS
                         and (Path(base) / d).relative_to(root).as_posix() != "blockchain/types"
                         and not (Path(base) / d).is_symlink())
        for name in sorted(files):
            if is_private(name):
                continue
            path = Path(base) / name
            if path.is_symlink():
                continue
            try:
                info = path.stat()
            except OSError:
                errors.append(str(path.relative_to(root)))
                continue
            checked += 1
            if getattr(info, "st_flags", 0) & SF_DATALESS:
                placeholders.append(str(path.relative_to(root)))

    source = [p for p in placeholders if not p.startswith(".git/")]
    git = [p for p in placeholders if p.startswith(".git/")]
    tools = {name: shutil.which(name) is not None for name in ("node", "npm", "git")}
    return {
        "ok": not (missing or placeholders or errors) and all(tools.values()),
        "checked_files": checked,
        "missing": missing,
        "source_placeholders": source,
        "git_placeholder_count": len(git),
        "metadata_errors": errors,
        "tools": tools,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable results")
    args = parser.parse_args()
    result = scan(ROOT)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("PASS: project files are local" if result["ok"] else "BLOCKED: project preflight")
        print(f"Checked {result['checked_files']} files using metadata only.")
        if result["source_placeholders"] or result["git_placeholder_count"]:
            print(f"Cloud placeholders: {len(result['source_placeholders'])} project files; "
                  f"{result['git_placeholder_count']} Git files.")
            for name in result["source_placeholders"][:12]:
                print(f"  {name}")
            print("In Finder, select Download Now / Keep Downloaded for this project, then retry.")
            print("Keep an active development checkout outside cloud-managed folders if downloads stall.")
        for key, label in (("missing", "Missing required file"), ("metadata_errors", "Cannot inspect")):
            for name in result[key]:
                print(f"{label}: {name}")
        for name, found in result["tools"].items():
            if not found:
                print(f"Missing executable: {name}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
