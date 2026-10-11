"""Make `app` importable when scripts run as `python scripts/x.py` from backend/."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
