#!/usr/bin/env python3
"""Teach every dsh publish path to cope with a filesystem that cannot hard-link.

Usage: apply-hardlink-patch.py <node_modules-root>

Android's SELinux policy refuses `link()` for apps (and for the shell) in
app-writable storage, so any "publish a new file without clobbering" step that
assumes hard links breaks outright:

    EACCES: permission denied, link '…/session.v4.jsonl.zstd.<hash>.tmp'
                                 -> '…/session.v4.jsonl.zstd'

PRoot's --link2symlink is not a fix: it answers link() with a relative symlink
into a staging directory that the caller then deletes, so the file silently
becomes a dangling link while the tool reports success. That is exactly the
`write` bug from the first test round.

`copyFile(src, dst, COPYFILE_EXCL)` keeps the guarantee these call sites are
after — publish fails with EEXIST when the target exists, never clobbers — and
needs no second name for the same inode. Four publish sites in three packages
need it:

  @deepseek-ai/dsh-fs-local                 writeFileAtomic (write/edit tools)
  @deepseek-ai/dsh-session-persistence-jsonl
                                            session log materialization and the
                                            current-generation publish (subagent
                                            sessions, workflow agent(), spawned
                                            teammates)
  @deepseek-ai/dsh-attachment-local         staged objects and immutable aliases

Idempotent: re-running replaces the injected helper and never duplicates it.
"""
from __future__ import annotations

import sys
from pathlib import Path

HELPER_MARKER = "const LINK_UNSUPPORTED_CODES"

HELPER = '''/**
 * Hard links are not a portable primitive: Android's SELinux policy denies
 * link() in app storage, and FUSE/VFAT answer ENOTSUP/EXDEV/EMLINK. Fall back to
 * copyFile with COPYFILE_EXCL, which preserves the create-if-absent contract
 * these call sites rely on (EEXIST instead of clobbering).
 */
const LINK_UNSUPPORTED_CODES = /* @__PURE__ */ new Set([
\t"EACCES",
\t"EPERM",
\t"EMLINK",
\t"ENOTSUP",
\t"EOPNOTSUPP",
\t"ENOSYS",
\t"EXDEV"
]);

async function linkOrCopy(source, target) {
\ttry {
\t\tawait link(source, target);
\t} catch (error) {
\t\tif (!LINK_UNSUPPORTED_CODES.has(error?.code)) throw error;
\t\tawait copyFile(source, target, 1);
\t}
}

'''

# file, (original import line, patched import line), injection anchor, call-site swaps
ESM_TARGETS = [
    (
        "@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js",
        ('import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, truncate } from "node:fs/promises";',
         'import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, truncate } from "node:fs/promises";'),
        "//#region",
        [("await link(tmp, finalPath)", "await linkOrCopy(tmp, finalPath)"),
         ("await internals.fs.link(staged, currentPath)", "await linkOrCopy(staged, currentPath)")],
    ),
    (
        "@deepseek-ai/dsh-attachment-local/lib/index.js",
        ('import { chmod, link, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";',
         'import { chmod, copyFile, link, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";'),
        "//#region",
        [("await link(staged.path, target)", "await linkOrCopy(staged.path, target)"),
         ("await link(source, target)", "await linkOrCopy(source, target)")],
    ),
    (
        "@deepseek-ai/dsh-fs-local/lib/index.js",
        ('import { chmod, link, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";',
         'import { chmod, copyFile, link, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";'),
        "//#region",
        [("await linkFile(tempPath, absolutePath);", "await linkOrCopy(tempPath, absolutePath);")],
    ),
]

# the worker bundle is CommonJS: same helper, module-qualified calls
CJS_TARGET = (
    "@deepseek-ai/dsh-session-persistence-jsonl/lib/worker.cjs",
    'let node_fs_promises = require("node:fs/promises");',
    [("await internals.fs.link(staged, currentPath)", "await linkOrCopy(staged, currentPath)")],
)


def inject_helper(source: str, anchor: str, cjs: bool) -> str:
    if HELPER_MARKER in source:
        return source
    if anchor not in source:
        raise LookupError(f"no injection anchor {anchor!r}")
    helper = HELPER
    if cjs:
        helper = helper.replace("= /* @__PURE__ */ new Set([", "= new Set([")
        helper = helper.replace("await copyFile(", "await node_fs_promises.copyFile(")
        helper = helper.replace("await link(source, target);", "await node_fs_promises.link(source, target);")
    index = source.index(anchor)
    return source[:index] + helper + source[index:]


def patch(root: Path, relative: str, imports, anchor: str, calls) -> str:
    path = root / relative
    if not path.is_file():
        return f"skip {relative}: missing"
    source = path.read_text(encoding="utf-8")
    if isinstance(imports, tuple):
        original, patched = imports
        if patched not in source:
            if original not in source:
                return f"skip {relative}: unexpected import list"
            source = source.replace(original, patched, 1)
    source = inject_helper(source, anchor, cjs=relative.endswith(".cjs"))
    for old, new in calls:
        if new in source:
            continue
        if old not in source:
            return f"skip {relative}: call site missing: {old[:50]!r}"
        source = source.replace(old, new, 1)
    path.write_text(source, encoding="utf-8")
    return f"patched {relative} ({len(calls)} call sites)"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = Path(sys.argv[1]).resolve()
    results = [patch(root, rel, imp, anchor, calls) for rel, imp, anchor, calls in ESM_TARGETS]
    rel, import_line, calls = CJS_TARGET
    results.append(patch(root, rel, None, import_line, calls))
    for line in results:
        print(" ", line)
    if any(line.startswith("skip") for line in results):
        sys.exit("error: a publish site was not patched (upstream changed?)")


if __name__ == "__main__":
    main()
