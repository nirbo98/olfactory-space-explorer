"""Download Keller & Vosshall (2016) from pyrfume-data (pinned commit, SHA-256 verified)
and write the compact processed files that are kept in git.

    python scripts/fetch_keller.py            # download + process
    python scripts/fetch_keller.py --process  # re-process existing raw files only
"""
import argparse
import json

import _path  # noqa: F401
from app.datasets import keller

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--process", action="store_true", help="skip download, re-process raw files")
    a = ap.parse_args()
    if not a.process:
        keller.fetch()
    print(json.dumps(keller.process(), indent=1))
