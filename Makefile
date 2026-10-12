# Olfactory Space Explorer — project commands (run at repository root).
PY          ?= python3
PIP         ?= $(PY) -m pip
TORCH_INDEX ?= https://download.pytorch.org/whl/cpu
BACKEND     := backend
FRONTEND    := frontend

.DEFAULT_GOAL := help
.PHONY: help bootstrap install install-backend install-frontend data train evaluate ablations \
        export-static pages backend frontend dev build test test-backend test-frontend test-e2e clean

help:
	@echo "make bootstrap       install dependencies, generate data, train demo model"
	@echo "make dev             run API on :8000 and frontend on :5173"
	@echo "make test            backend + frontend + end-to-end tests"
	@echo "make export-static   export ONNX and static assets (optional export deps)"

bootstrap: install data train
	@echo "Ready. Run 'make dev' and open http://127.0.0.1:5173"

install: install-backend install-frontend

install-backend:
	$(PIP) install "torch>=2.5" --index-url $(TORCH_INDEX) || $(PIP) install "torch>=2.5"
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

export-static:
	cd $(BACKEND) && $(PY) scripts/export_static.py

pages:
	cd $(FRONTEND) && npm run build:pages && npx vite preview --mode pages --host 127.0.0.1 --port 4173

backend:
	cd $(BACKEND) && $(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000

frontend:
	cd $(FRONTEND) && npm run dev -- --host 127.0.0.1 --port 5173

dev:
	@set -e; \
	(cd $(BACKEND) && $(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000) & api_pid=$$!; \
	(cd $(FRONTEND) && npm run dev -- --host 127.0.0.1 --port 5173) & web_pid=$$!; \
	trap 'kill $$api_pid $$web_pid 2>/dev/null || true' EXIT INT TERM; \
	wait

build:
	cd $(FRONTEND) && npm run build

test: test-backend test-frontend test-e2e

test-backend:
	cd $(BACKEND) && $(PY) -m pytest -q

test-frontend:
	cd $(FRONTEND) && npx tsc --noEmit -p . && npx vitest run

test-e2e:
	cd $(FRONTEND) && npx playwright test && npx playwright test -c playwright.static.config.ts

clean:
	rm -rf $(FRONTEND)/dist $(FRONTEND)/test-results $(BACKEND)/.pytest_cache
