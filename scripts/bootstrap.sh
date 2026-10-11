#!/usr/bin/env bash
# One-command setup + launch: installs dependencies, generates the synthetic dataset,
# trains the demo model (~3 min on 2 CPU cores) and starts both servers.
set -euo pipefail
cd "$(dirname "$0")/.."
make bootstrap
make dev
