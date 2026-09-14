"""
Stage 4 — ML Inference Service

Loads the Stage 2 artifacts once (via FastAPI lifespan) and serves
predict + explain. Artifact layout matches backend/ml/train.py:

  model.pkl                  — CalibratedClassifierCV wrapping a Pipeline
                               for the PRODUCTION model (winner). Call
                               predict / predict_proba on a raw feature DataFrame.
  model_<name>.pkl           — One calibrated pkl per model family. Used by
                               the Clinician Sandbox for on-demand What-If
                               re-scoring; loaded lazily, NOT at startup.
  preprocessor.pkl           — ColumnTransformer (scale age + passthrough items).
                               Required before SHAP; do NOT re-apply before model
                               predict (that would double-transform).
  feature_columns.pkl        — ordered feature name list used at training time
  shap_explainer.pkl         — TreeExplainer fit on the uncalibrated tree
  production_model_name.txt  — name of the production model (e.g. "xgboost")

No mock fallback: if any required artifact is missing or unloadable, load()
fails and callers get 503 with a clear "model not trained" message.

Only the production model is loaded at startup (model.pkl). The other named
models (model_logistic_regression.pkl, etc.) are loaded on-demand by the
Clinician Sandbox to avoid unnecessary memory overhead.
"""

from __future__ import annotations

import logging
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Canonical label order used by Stage 2 (columns.LABEL_ORDER). Duplicated
# here so the API package does not import from backend/ml at request time.
LABEL_ORDER = ["Typical", "Monitor", "Refer"]

DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "ml" / "artifacts"

# Required artifacts that must be present before the service will start
ARTIFACT_FILES = (
    "model.pkl",
    "preprocessor.pkl",
    "feature_columns.pkl",
    "shap_explainer.pkl",
)

# Named pkl file pattern for on-demand sandbox loading
MODEL_PKL_NAMES = {
    "logistic_regression": "model_logistic_regression.pkl",
    "random_forest": "model_random_forest.pkl",
    "xgboost": "model_xgboost.pkl",
}



class ModelNotLoadedError(RuntimeError):
    """Raised when inference is requested but artifacts are not loaded."""


class FeatureColumnMismatchError(ValueError):
    """Raised when a feature vector does not match feature_columns.pkl."""


@dataclass
class PredictionResult:
    ml_classification: str
    ml_score: float  # probability of the ML-chosen class
    probabilities: dict[str, float]
    final_classification: str
    safety_override_triggered: bool
    override_rule: str | None
    shap_values: dict[str, float] = field(default_factory=dict)
    top_contributing_features: list[dict[str, Any]] = field(default_factory=list)


class InferenceService:
    """Holds loaded artifacts and runs predict + explain."""

    def __init__(self) -> None:
        self.model: Any = None
        self.preprocessor: Any = None
        self.feature_columns: list[str] | None = None
        self.shap_explainer: Any = None
        self.artifacts_dir: Path | None = None
        self.load_error: str | None = None
        self._production_model_name: str | None = None

    @property
    def is_loaded(self) -> bool:
        return (
            self.model is not None
            and self.preprocessor is not None
            and self.feature_columns is not None
            and self.shap_explainer is not None
        )

    @property
    def production_model_name(self) -> str | None:
        """Name of the production model (from production_model_name.txt), e.g. 'xgboost'."""
        return self._production_model_name

    def load(self, artifacts_dir: str | Path | None = None) -> None:
        """
        Load all four artifacts. Raises FileNotFoundError / OSError /
        pickle errors on failure; sets load_error and clears partial state.
        """
        directory = Path(artifacts_dir) if artifacts_dir else DEFAULT_ARTIFACTS_DIR
        self.artifacts_dir = directory
        self.load_error = None

        missing = [name for name in ARTIFACT_FILES if not (directory / name).is_file()]
        if missing:
            msg = (
                f"model not trained — run train.py "
                f"(missing artifacts: {', '.join(missing)} in {directory})"
            )
            self._clear()
            self.load_error = msg
            raise FileNotFoundError(msg)

        try:
            with open(directory / "model.pkl", "rb") as f:
                self.model = pickle.load(f)
            with open(directory / "preprocessor.pkl", "rb") as f:
                self.preprocessor = pickle.load(f)
            with open(directory / "feature_columns.pkl", "rb") as f:
                self.feature_columns = list(pickle.load(f))
            with open(directory / "shap_explainer.pkl", "rb") as f:
                self.shap_explainer = pickle.load(f)
        except Exception as exc:  # noqa: BLE001 — surface any load failure
            self._clear()
            self.load_error = f"model not trained — run train.py ({exc})"
            raise

        # Read production model name (optional — graceful fallback to None)
        name_file = directory / "production_model_name.txt"
        if name_file.is_file():
            self._production_model_name = name_file.read_text(encoding="utf-8").strip()
            logger.info("Production model: %s", self._production_model_name)
        else:
            self._production_model_name = None
            logger.warning(
                "production_model_name.txt not found in %s — re-run train.py to generate it.",
                directory,
            )

        logger.info(
            "Loaded ML artifacts from %s (%d feature columns)",
            directory,
            len(self.feature_columns or []),
        )

    def _clear(self) -> None:
        self.model = None
        self.preprocessor = None
        self.feature_columns = None
        self.shap_explainer = None
        self._production_model_name = None

    def load_model_by_name(self, model_name: str) -> Any:
        """
        Load a named calibrated model on-demand from the artifacts directory.
        Used by the Clinician Sandbox for What-If re-scoring with a non-production
        model (e.g. the runner-up model). NOT called at startup — only on explicit
        Sandbox requests to avoid loading all three into memory simultaneously.

        Raises:
            FileNotFoundError if the model pkl is not found.
            KeyError if model_name is not a known model name.
        """
        if model_name not in MODEL_PKL_NAMES:
            raise KeyError(
                f"Unknown model name {model_name!r}. "
                f"Valid names: {sorted(MODEL_PKL_NAMES.keys())}"
            )
        if self.artifacts_dir is None:
            raise ModelNotLoadedError("Service not loaded — call load() first.")
        pkl_path = self.artifacts_dir / MODEL_PKL_NAMES[model_name]
        if not pkl_path.is_file():
            raise FileNotFoundError(
                f"Model pkl not found: {pkl_path}. Re-run train.py to generate it."
            )
        with open(pkl_path, "rb") as f:
            return pickle.load(f)

    def validate_feature_vector(self, features: dict[str, Any]) -> pd.DataFrame:
        """
        Validate names + order against feature_columns.pkl and return a
        single-row DataFrame in training column order.
        """
        if not self.is_loaded or self.feature_columns is None:
            raise ModelNotLoadedError(
                self.load_error or "model not trained — run train.py"
            )

        expected = self.feature_columns
        missing = [c for c in expected if c not in features]
        extra = [c for c in features if c not in expected]
        if missing or extra:
            raise FeatureColumnMismatchError(
                "Feature vector column mismatch against feature_columns.pkl: "
                f"missing={missing!r}, extra={extra!r}"
            )

        row = {c: features[c] for c in expected}
        return pd.DataFrame([row], columns=expected)

    def predict(
        self,
        features: dict[str, Any],
        *,
        model: Any = None,
        deterministic_override: str | None = None,
        override_rule: str | None = None,
        real_answer_keys: set[str] | None = None,
    ) -> PredictionResult:
        """
        Validate → model.predict/proba on raw frame → SHAP on preprocessed
        frame → apply explicit safety override if provided (never blend).
        """
        if not self.is_loaded:
            raise ModelNotLoadedError(
                self.load_error or "model not trained — run train.py"
            )

        X = self.validate_feature_vector(features)
        
        scoring_model = model if model is not None else self.model

        proba = np.asarray(scoring_model.predict_proba(X)[0], dtype=float)
        classes = list(scoring_model.classes_)
        # classes_ may be ints (0/1/2 → LABEL_ORDER) or string labels
        if all(isinstance(c, (int, np.integer)) for c in classes):
            label_for_idx = {int(c): LABEL_ORDER[int(c)] for c in classes}
            ordered_proba = {
                LABEL_ORDER[i]: float(proba[classes.index(i)])
                for i in range(len(LABEL_ORDER))
                if i in classes
            }
            # fill any missing labels
            for label in LABEL_ORDER:
                ordered_proba.setdefault(label, 0.0)
            pred_idx = int(scoring_model.predict(X)[0])
            ml_classification = label_for_idx[pred_idx]
        else:
            ordered_proba = {
                str(c): float(p) for c, p in zip(classes, proba, strict=True)
            }
            for label in LABEL_ORDER:
                ordered_proba.setdefault(label, 0.0)
            ml_classification = str(scoring_model.predict(X)[0])

        ml_score = float(ordered_proba.get(ml_classification, 0.0))

        shap_values, top_features = self._explain(
            X, ml_classification, real_answer_keys=real_answer_keys
        )

        safety_override_triggered = deterministic_override is not None
        if safety_override_triggered:
            final_classification = deterministic_override  # type: ignore[assignment]
            rule = override_rule or "deterministic_override"
            logger.warning(
                "safety_override triggered rule=%s ml=%s final=%s",
                rule,
                ml_classification,
                final_classification,
            )
        else:
            final_classification = ml_classification
            rule = None

        return PredictionResult(
            ml_classification=ml_classification,
            ml_score=ml_score,
            probabilities=ordered_proba,
            final_classification=final_classification,
            safety_override_triggered=safety_override_triggered,
            override_rule=rule,
            shap_values=shap_values,
            top_contributing_features=top_features,
        )

    def _explain(
        self,
        X_raw: pd.DataFrame,
        predicted_class: str,
        *,
        real_answer_keys: set[str] | None = None,
    ) -> tuple[dict[str, float], list[dict[str, Any]]]:
        """Transform through preprocessor.pkl, then run shap_explainer.pkl."""
        assert self.preprocessor is not None
        assert self.shap_explainer is not None
        assert self.feature_columns is not None

        X_pre = self.preprocessor.transform(X_raw)
        shap_raw = self.shap_explainer.shap_values(X_pre)
        shap_arr = np.asarray(shap_raw)

        predicted_class_idx = LABEL_ORDER.index(predicted_class)

        if shap_arr.ndim == 3 and shap_arr.shape[0] == len(LABEL_ORDER):
            contributions = shap_arr[predicted_class_idx, 0, :]
        elif shap_arr.ndim == 3:
            contributions = shap_arr[0, :, predicted_class_idx]
        else:
            contributions = shap_arr[0]

        shap_values = {
            col: float(contributions[i]) for i, col in enumerate(self.feature_columns)
        }

        # Prefer real caregiver answers in top features when mask provided
        ranked = sorted(shap_values.items(), key=lambda kv: abs(kv[1]), reverse=True)
        if real_answer_keys is not None:
            ranked_real = [kv for kv in ranked if kv[0] in real_answer_keys]
            ranked_rest = [kv for kv in ranked if kv[0] not in real_answer_keys]
            ranked = ranked_real + ranked_rest

        top_features = [
            {"feature": name, "shap_value": value} for name, value in ranked[:5]
        ]
        return shap_values, top_features


def build_feature_vector(
    *,
    corrected_age_months: float,
    real_answers: dict[str, int],
    imputed_answers: dict[str, int],
    feature_columns: list[str],
) -> dict[str, Any]:
    """
    Combine real + imputed answers into a raw feature dict keyed by
    feature_columns. Mandatory flags live in real_answers; age is passed
    explicitly. Values from real_answers win over imputed on collision.
    """
    from data.generator.age_brackets import map_to_bracket_ordinal
    
    combined: dict[str, Any] = {}
    combined.update(imputed_answers)
    combined.update(real_answers)
    combined["corrected_age_months"] = corrected_age_months
    combined["age_bracket_ordinal"] = map_to_bracket_ordinal(corrected_age_months)

    return {col: combined.get(col) for col in feature_columns}


# Process-wide singleton filled by FastAPI lifespan
inference_service = InferenceService()
