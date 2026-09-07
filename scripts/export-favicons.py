#!/usr/bin/env python3
"""Export the Pension Restart favicon family from a transparent square master."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


PNG_SIZES = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "favicon-48x48.png": 48,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(args.source) as source:
        master = source.convert("RGBA")

        if master.width != master.height:
            raise ValueError("The favicon master must be square")

        master.save(args.output_dir / "favicon-master.png", optimize=True)

        for filename, size in PNG_SIZES.items():
            icon = master.resize((size, size), Image.Resampling.LANCZOS)
            icon.save(args.output_dir / filename, optimize=True)

        master.save(
            args.output_dir / "favicon.ico",
            format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48)],
        )


if __name__ == "__main__":
    main()
