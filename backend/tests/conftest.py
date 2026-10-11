import sys
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ModelConfig  # noqa: E402
from app.datasets.synthetic import load_or_generate  # noqa: E402
from app.models.olfactory_model import BioOlfactoryModel  # noqa: E402

torch.set_num_threads(2)


@pytest.fixture(scope="session")
def dataset():
    return load_or_generate()


@pytest.fixture()
def model():
    torch.manual_seed(0)
    return BioOlfactoryModel(ModelConfig()).eval()


@pytest.fixture(scope="session")
def engine(dataset):
    from app.simulation.engine import OlfactoryEngine
    return OlfactoryEngine(dataset=dataset)


@pytest.fixture(scope="session")
def client(engine):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        app.state.engine = engine
        yield c


def make_batch(dataset, rows):
    feats = torch.as_tensor(dataset["compound_features"])
    ci = torch.as_tensor(dataset["comp_idx"][rows])
    mask = torch.as_tensor(dataset["mask"][rows])
    return feats[ci.clamp(min=0)] * mask[..., None], torch.as_tensor(dataset["conc"][rows]) * mask, mask
