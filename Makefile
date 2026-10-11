# Olfactory Space Explorer — one-command workflows.  Run from the repository root.
PY       ?= python3
PIP      ?= $(PY) -m pip
TORCH_INDEX ?= https://download.pytorch.org/whl/cpu
BACKEND  := backend
FRONTEND := frontend

.PHONY: help bootstrap install install-backend install-frontend data train evaluate ablations export-static pages \
        backend frontend dev build test test-backend test-frontend test-e2e clean

help:
	@echo "make bootstrap   install everything, generate data, train the demo model"
	@echo "make dev         start backend (:8000) and frontend (:5173)"
	@echo "make test        backend + frontend + end-to-end tests"

bootstrap: install data train
	@echo "\nReady. Run 'make dev' and open http://127.0.0.1:5173"

install: install-backend install-frontend

install-# Export the trained model to ONNX + static JSON for the GitHub Pages build (needs: pip install onnx onnxscript)
export-static:
	cd $(BACKEND) && $(PY) scripts/export_static.py

# Build the static site locally (frontend/dist) and preview it at http://127.0.0.1:4173/olfactory-space-explorer/
pages:
	cd $(FRONTEND) && npm run build:pages && npx vite preview --mode pages --host 127.0.0.1 --port 4173

backend:
	$(PIP) install "torch>=2.2" --index-url $(TORCH_INDEX) || $(PIP) install "torch>=2.2"
	$(PIP) install -e "$(BACKEND)[dev]"

install-frontend:
	cd $(FRONTEND) && npm ci

data:
	cd $(BACKEND) && $(PY) scripts/generate_data.py

train:
	cd $(BACKEND) && $(PY) scripts/train_demo.py

evaluate:
	cd $(BACKEND) && $(PY) scripts/evaluate.py

ablations:
	cd $(BACKEND) && $(PY) scripts/run_ablations.py

# Export the trained model to ONNX + static JSON for the GitHub Pages build (needs: pip install onnx onnxscript)
export-static:
	cd $(BACKEND) && $(PY) scripts/export_static.py

# Build the static site locally (frontend/dist) and preview it at http://127.0.0.1:4173/olfactory-space-explorer/
pages:
	cd $(FRONTEND) && npm run build:pages && npx vite preview --mode pages --host 127.0.0.1 --port 4173

backend:
	cd $(BACKEND) && $(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000

frontend:
	cd $(FRONTEND) && npm run dev -- --host 127.0.0.1 --port 5173

dev:
	@trap 'kill 0' INT TERM EXIT; \
	(cd $(BACKEND) && $(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000) & \
	(cd $(FRONTEND) && npm run dev -- --host 127.0.0.1 --port 5173) & \
	wait

build:
	cd $(FRONTEND) && npm run build

test: test-backend test-frontend test-e2e

test-# Export the trained model to ONNX + static JSON for the GitHub Pages build (needs: pip install onnx onnxscript)
export-static:
	cd $(BACKEND) && $(PY) scripts/export_static.py

# Build the static site locally (frontend/dist) and preview it at http://127.0.0.1:4173/olfactory-space-explorer/
pages:
	cd $(FRONTEND) && npm run build:pages && npx vite preview --mode pages --host 127.0.0.1 --port 4173

backend:
	cd $(BACKEND) && $(PY) -m pytest -q

test-frontend:
	cd $(FRONTEND) && npx tsc --noEmit -p . && npx vitest run

# First time only: cd frontend && npx playwright install chromium
# (or set PW_CHROMIUM_PATH to an existing Chromium binary)
test-e2e:
	cd $(FRONTEND) && npx playwright test && npx playwright test -c playwright.static.config.ts

clean:
	rm -rf $(FRONTEND)/dist $(FRONTEND)/test-results $(BACKEND)/.pytest_cache
