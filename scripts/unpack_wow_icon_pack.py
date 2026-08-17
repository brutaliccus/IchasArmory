#!/usr/bin/env python3
"""Unpack barrens.chat wowiconpack.zip into assets/wow-icons/large/ and refresh data/wow-icons.json."""
from __future__ import annotations

import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP_PATH = ROOT / "assets" / "wow-icons" / "wowiconpack.zip"
UNPACK_DIR = ROOT / "assets" / "wow-icons" / "_unpack"
OUT_DIR = ROOT / "assets" / "wow-icons" / "large"
MANIFEST_PATH = ROOT / "data" / "wow-icons.json"
MIN_ICONS = 4000


def find_pack_root(base: Path) -> Path | None:
    if not base.exists():
        return None
    for child in base.iterdir():
        if child.is_dir() and "icon pack" in child.name.lower():
            return child
    return base if any(base.rglob("*.png")) else None


def flatten_pack(pack_root: Path) -> list[str]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    seen: dict[str, int] = {}
    manifest: list[str] = []

    for src in sorted(pack_root.rglob("*.png")):
        if src.name.startswith("."):
            continue
        base = src.stem.lower()
        if base in seen:
            seen[base] += 1
            base = f"{base}_{seen[base]}"
        else:
            seen[base] = 1
        dst = OUT_DIR / f"{base}.png"
        shutil.copy2(src, dst)
        manifest.append(base)

    manifest.sort()
    MANIFEST_PATH.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return manifest


def main() -> int:
    force = "--force" in sys.argv
    if (
        not force
        and MANIFEST_PATH.exists()
        and len(list(OUT_DIR.glob("*.png"))) >= MIN_ICONS
    ):
        print(f"[icons] Skipping unpack ({len(list(OUT_DIR.glob('*.png')))} icons present)")
        return 0

    if not ZIP_PATH.exists():
        print(f"[icons] Missing {ZIP_PATH}", file=sys.stderr)
        return 1

    if UNPACK_DIR.exists():
        shutil.rmtree(UNPACK_DIR)
    UNPACK_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(ZIP_PATH) as zf:
        zf.extractall(UNPACK_DIR)

    pack_root = find_pack_root(UNPACK_DIR)
    if not pack_root:
        print("[icons] Could not locate icon pack root in zip", file=sys.stderr)
        return 1

    manifest = flatten_pack(pack_root)
    shutil.rmtree(UNPACK_DIR, ignore_errors=True)
    print(f"[icons] Unpacked {len(manifest)} icons -> {OUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
