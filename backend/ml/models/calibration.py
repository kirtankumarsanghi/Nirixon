"""
Stage 2 — Calibration

Wraps an already-fitted model in CalibratedClassifierCV so its predicted
probabilities are trustworthy ("80% confident" should actually mean
something close to 80% right), not just a raw, uncalibrated score.

NOTE ON SKLEARN VERSION: the design doc's original plan
(CalibratedClassifierCV(model, cv='prefit')) is written against an older
sklearn API. cv='prefit' was removed in the installed version
(scikit-learn 1.8) - confirmed by actually running it and hitting a
ValueError, not assumed from documentation. The current replacement is
FrozenEstimator, used here instead. If you're running an older sklearn
locally, this line is the one thing to check first.
"""

from __future__ import annotations

from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator


def calibrate_model(fitted_model, X_val, y_val, method: str = "isotonic"):
    """
    fitted_model: an already-trained estimator/pipeline (fit on the
                  TRAINING split, not validation - calibration must be
                  fit on data the model hasn't already seen, or the
                  calibration curve will look better than it really is).
    X_val, y_val: held-out validation split used ONLY for calibration.
    """
    calibrated = CalibratedClassifierCV(FrozenEstimator(fitted_model), method=method)
    calibrated.fit(X_val, y_val)
    return calibrated
