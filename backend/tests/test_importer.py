import json
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from app.datasets.importer import ExperimentalDataset, to_arrays

TEMPLATE = Path(__file__).resolve().parents[2] / "data" / "examples" / "experimental_dataset_template.json"


def _base():
    return json.loads(TEMPLATE.read_text())


def test_template_validates_and_keeps_missing_as_nan():
    exp = ExperimentalDataset.model_validate(_base())
    arr = to_arrays(exp)
    assert np.isnan(arr["receptor_targets"]).any()
    assert np.isnan(arr["intensity_targets"]).any()
    assert not (arr["receptor_targets"] == 0).all()


def test_unknown_compound_rejected():
    d = _base()
    d["mixtures"][0]["components"][0]["compound_id"] = "NOPE"
    with pytest.raises(ValidationError):
        ExperimentalDataset.model_validate(d)


def test_negative_concentration_rejected():
    d = _base()
    d["mixtures"][0]["components"][0]["concentration"] = -1
    with pytest.raises(ValidationError):
        ExperimentalDataset.model_validate(d)
