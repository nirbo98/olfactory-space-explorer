"""Chemistry baselines. Every model sees (molecular features, log10 dilution) and
predicts all targets jointly; hyper-parameters are fixed in advance (no tuning on
test folds)."""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import RidgeCV
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def make_model(name: str, seed: int = 42):
    if name == "ridge_morgan":
        return make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-1, 5, 25)))
    if name in ("rf_morgan", "rf_descriptors"):
        return RandomForestRegressor(n_estimators=300, max_features=0.33, min_samples_leaf=2,
                                     n_jobs=-1, random_state=seed)
    if name == "mlp_morgan":
        return make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(256, 128), alpha=1e-2,
                                                            early_stopping=True, max_iter=500,
                                                            random_state=seed))
    raise KeyError(name)


def fit_predict(name: str, X_train, Y_train, X_test, seed: int = 42) -> np.ndarray:
    """Y may contain NaN (targets nobody could rate): those cells are filled with the
    training column mean for fitting only; evaluation ignores them."""
    Y = np.array(Y_train, dtype=float)
    col_mean = np.nanmean(Y, axis=0)
    Y = np.where(np.isnan(Y), col_mean[None], Y)
    scale = np.where(Y.std(0) > 0, Y.std(0), 1.0)      # joint fit on comparable scales
    m = make_model(name, seed)
    m.fit(X_train, (Y - col_mean) / scale)
    return m.predict(X_test) * scale + col_mean
