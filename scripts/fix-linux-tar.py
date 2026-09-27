"""Repair executable modes in an electron-builder Linux tar made on Windows.

Usage: python scripts/fix-linux-tar.py input.tar.gz output.tar.gz
This is only for a private portable test archive. Native Linux CI should build packages.
"""

import sys
import tarfile
from pathlib import PurePosixPath


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/fix-linux-tar.py input.tar.gz output.tar.gz")
    source, destination = sys.argv[1:]
    executable_names = {"llama-desktop-launcher", "chrome-sandbox", "chrome_crashpad_handler"}
    with tarfile.open(source, "r:gz") as archive, tarfile.open(destination, "w:gz") as repaired:
        for item in archive:
            if item.isdir():
                item.mode = 0o755
            elif item.isfile() and PurePosixPath(item.name).name in executable_names:
                item.mode = 0o755
            repaired.addfile(item, archive.extractfile(item) if item.isfile() else None)


if __name__ == "__main__":
    main()
