#!/usr/bin/env python3
"""Delete a tree that `rm -rf` refuses to touch.

Inside PRoot with --link2symlink, files created through link() become symlinks
whose targets live in `.l2s.*` temp names. Once those temps are gone, `stat()`
on the symlink itself fails with EPERM, and `rm` gives up ("can't stat …")
without ever unlinking it — which leaves a directory that cannot be cleaned and
therefore cannot be replaced.

`os.unlink()` does not stat first, so it removes the link and the tree becomes
deletable again. Directories are removed bottom-up with `os.rmdir`.

Usage: force_rmtree.py <path> [<path>…]
"""
from __future__ import annotations

import os
import sys


def force_rmtree(root: str) -> int:
    removed = 0
    # Top-down walk so we know every path, then delete children before parents.
    stack = [root]
    order: list[str] = []
    while stack:
        current = stack.pop()
        order.append(current)
        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    stack.append(entry.path)
        except OSError:
            continue
    for path in reversed(order):
        try:
            if os.path.islink(path) or not os.path.isdir(path):
                os.unlink(path)
                removed += 1
            else:
                os.rmdir(path)
                removed += 1
        except OSError as error:
            print(f"  skip {path}: {error}", file=sys.stderr)
    return removed


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for target in sys.argv[1:]:
        if os.path.exists(target) or os.path.islink(target):
            print(f"{target}: removed {force_rmtree(target)} entries")
        else:
            print(f"{target}: not present")


if __name__ == "__main__":
    main()
