"""Standalone /api/predict — debug / internal inference path."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import require_parent
from app.db.models import User
from app.ml.inference_service import (
    FeatureColumnMismatchError,
    InferenceService,
    ModelNotLoadedError,
    inference_service,
)
from app.schemas.predict import PredictRequest, PredictResponse
from app.schemas.screen import ShapFeature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/predict", tags=["predict"])


def _get_inference() -> InferenceService:
    return inference_service


@router.post("", response_model=PredictResponse)
@router.post("/", response_model=PredictResponse, include_in_schema=False)
async def predict(
    body: PredictRequest,
    _user: Annotated[User, Depends(require_parent)],
    inference: Annotated[InferenceService, Depends(_get_inference)],
):
    if not inference.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=inference.load_error or "model not trained — run train.py",
        )
    try:
        pred = inference.predict(
            body.features,
            deterministic_override=body.deterministic_override,
            override_rule=body.override_rule,
        )
    except FeatureColumnMismatchError as exc:
        logger.error("Feature column mismatch on /api/predict: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return PredictResponse(
        final_classification=pred.final_classification,
        ml_classification=pred.ml_classification,
        ml_score=pred.ml_score,
        probabilities=pred.probabilities,
        safety_override_triggered=pred.safety_override_triggered,
        override_rule=pred.override_rule,
        shap_top_features=[ShapFeature(**f) for f in pred.top_contributing_features],
        shap_values=pred.shap_values,
    )
