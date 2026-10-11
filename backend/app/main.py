"""FastAPI application entry point: `uvicorn app.main:app --port 8000` (from backend/)."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .simulation.engine import OlfactoryEngine


@asynccontextmanager
async def lifespan(app: FastAPI):
    torch.set_num_threads(int(os.environ.get("OSE_TORCH_THREADS", "2")))
    app.state.engine = OlfactoryEngine()
    yield


app = FastAPI(title="Olfactory Space Explorer API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
