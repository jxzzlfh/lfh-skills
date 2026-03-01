#!/usr/bin/env python3
"""
ebook-convert batch helper
Usage:
  python convert.py input.epub pdf
  python convert.py input.epub pdf docx txt
  python convert.py "*.epub" pdf
  python convert.py "*.epub" pdf txt
  python convert.py input.epub pdf -- --pdf-page-numbers
"""
import subprocess
import sys
import glob
import os
from pathlib import Path


def convert(src: Path, fmt: str, extra_args: list) -> bool:
    dst = src.with_suffix("." + fmt)
    if dst == src:
        print(f"[SKIP] {src.name}: output same as input")
        return False
    cmd = ["ebook-convert", str(src), str(dst)] + extra_args
    print(f"[CONVERT] {src.name} -> {dst.name}")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"[ERROR] {result.stderr.strip()}")
        return False
    print(f"[OK] saved: {dst}")
    return True


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    extra_args = []
    if "--" in args:
        idx = args.index("--")
        extra_args = args[idx + 1:]
        args = args[:idx]

    if len(args) < 2:
        print("Error: need at least <input> <format>")
        sys.exit(1)

    pattern = args[0]
    formats = args[1:]

    files = sorted(glob.glob(pattern))
    if not files:
        if os.path.isfile(pattern):
            files = [pattern]
        else:
            print(f"[ERROR] No files matched: {pattern}")
            sys.exit(1)

    total = ok = 0
    for f in files:
        src = Path(f)
        for fmt in formats:
            total += 1
            if convert(src, fmt.lower().lstrip("."), extra_args):
                ok += 1

    print(f"\nDone: {ok}/{total} converted successfully.")


if __name__ == "__main__":
    main()
