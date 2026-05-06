"""
Form Analysis Model — TensorFlow LSTM for exercise form pattern recognition.

Architecture:
    Input:  (batch, 30, 99) — 30-frame sliding window, 33 landmarks × 3 coords (X, Y, Z)
    Output: (batch, 6)      — Multi-label sigmoid probabilities for form labels

Labels:
    0: form_correct       — Overall form is correct
    1: elbows_flared      — Elbows flaring outward
    2: back_rounding      — Spine curvature / rounding
    3: hips_sagging       — Hips dropping below plank line
    4: not_deep_enough    — Insufficient range of motion
    5: knees_caving       — Knees collapsing inward

Usage:
    model = FormAnalysisModel()
    result = model.predict_form(sequence_array)  # shape (1, 30, 99)
"""

import os
import logging
import numpy as np
from pathlib import Path




import tensorflow as tf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)





SEQUENCE_LENGTH = 30       
NUM_LANDMARKS = 33         
COORDS_PER_LANDMARK = 3   
FEATURES_PER_FRAME = NUM_LANDMARKS * COORDS_PER_LANDMARK  

FORM_LABELS = [
    "form_correct",
    "elbows_flared",
    "back_rounding",
    "hips_sagging",
    "not_deep_enough",
    "knees_caving",
]

NUM_CLASSES = len(FORM_LABELS)


MODEL_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = MODEL_DIR / "form_lstm_model.h5"






class FormAnalysisModel:
    """
    TensorFlow LSTM model for exercise form analysis.
    
    Accepts a sliding window of 30 frames (each frame = 99 floats)
    and outputs confidence scores for 6 form labels.
    """

    def __init__(self):
        self.model = self._build_model()
        self._load_weights()

    def _build_model(self) -> tf.keras.Model:
        """
        Build the LSTM architecture.
        
        Architecture:
            LSTM(128, return_sequences=True) — Captures temporal patterns across frames
            Dropout(0.3)                     — Regularization
            LSTM(64)                         — Compresses sequence into a fixed vector
            Dense(64, relu)                  — Non-linear feature extraction
            Dropout(0.2)                     — Regularization
            Dense(6, sigmoid)                — Multi-label probabilities (independent per label)
        """
        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, FEATURES_PER_FRAME)),
            tf.keras.layers.LSTM(128, return_sequences=True),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.LSTM(64),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(NUM_CLASSES, activation='sigmoid'),
        ])

        model.compile(
            optimizer='adam',
            loss='binary_crossentropy',
            metrics=['accuracy']
        )

        logger.info(f"[FormModel] LSTM model built — Input: (None, {SEQUENCE_LENGTH}, {FEATURES_PER_FRAME}), Output: (None, {NUM_CLASSES})")
        return model

    def _load_weights(self):
        """Load pre-trained weights if available, otherwise use random initialization."""
        if MODEL_PATH.exists():
            try:
                self.model.load_weights(str(MODEL_PATH))
                logger.info(f"[FormModel] Loaded pre-trained weights from {MODEL_PATH}")
            except Exception as e:
                logger.warning(f"[FormModel] Failed to load weights: {e}. Using random initialization.")
        else:
            logger.warning(
                f"[FormModel] No pre-trained model found at {MODEL_PATH}. "
                f"Running with random weights (dev/demo mode). "
                f"Train and save a model to this path for real predictions."
            )

    def predict_form(self, sequence: np.ndarray) -> dict:
        """
        Run inference on a landmark sequence.

        Args:
            sequence: numpy array of shape (1, 30, 99) — normalized landmark data.

        Returns:
            dict with:
                - accuracy: float (0-100) — overall form correctness percentage
                - labels: dict[str, float] — per-label confidence (0.0 to 1.0)
                - alerts: list[dict] — items where error confidence > 0.5
                - joint_status: list[dict] — terminal-style status for each joint check
        """
        
        if sequence.shape != (1, SEQUENCE_LENGTH, FEATURES_PER_FRAME):
            raise ValueError(
                f"Expected shape (1, {SEQUENCE_LENGTH}, {FEATURES_PER_FRAME}), "
                f"got {sequence.shape}"
            )

        
        predictions = self.model.predict(sequence, verbose=0)[0]  

        
        labels = {}
        for i, label_name in enumerate(FORM_LABELS):
            labels[label_name] = round(float(predictions[i]), 4)

        
        accuracy = round(float(predictions[0]) * 100, 1)

        
        alerts = []
        for i in range(1, NUM_CLASSES):
            if predictions[i] > 0.5:
                alerts.append({
                    "label": FORM_LABELS[i],
                    "confidence": round(float(predictions[i]), 4),
                    "message": _get_alert_message(FORM_LABELS[i]),
                })

        
        joint_status = _build_joint_status(predictions)

        return {
            "accuracy": accuracy,
            "labels": labels,
            "alerts": alerts,
            "joint_status": joint_status,
        }

    def get_model_summary(self) -> str:
        """Return a string summary of the model architecture."""
        summary_lines = []
        self.model.summary(print_fn=lambda x: summary_lines.append(x))
        return "\n".join(summary_lines)






def _get_alert_message(label: str) -> str:
    """Return a human-readable coaching directive for a detected form error."""
    messages = {
        "back_rounding": "SPINE :: ROUNDING — Engage your core, flatten your back",
        "hips_sagging": "HIPS :: SAGGING — Squeeze glutes, lift hips to plank line",
        "not_deep_enough": "ROM :: INSUFFICIENT — Lower further for full range of motion",
        "knees_caving": "KNEES :: CAVING — Push knees outward, track over toes",
    }
    return messages.get(label, f"{label.upper()} :: ANOMALY DETECTED")


def _build_joint_status(predictions: np.ndarray) -> list:
    """
    Build a terminal-style status list for the UI.
    Each entry has: joint name, status string, severity level.
    """
    checks = [
        ("FORM_OVERALL", 0, False),   
        ("ELBOWS", 1, True),          
        ("BACK", 2, True),
        ("HIPS", 3, True),
        ("DEPTH", 4, True),
        ("KNEES", 5, True),
    ]

    status_list = []
    for joint_name, idx, is_error in checks:
        confidence = float(predictions[idx])

        if is_error:
            
            if confidence > 0.7:
                status = "CRITICAL — FIX_NOW"
                severity = "critical"
            elif confidence > 0.5:
                status = "WARNING — ADJUST"
                severity = "warning"
            else:
                status = "NOMINAL"
                severity = "ok"
        else:
            
            if confidence > 0.7:
                status = "LOCKED_IN"
                severity = "ok"
            elif confidence > 0.5:
                status = "ACCEPTABLE"
                severity = "warning"
            else:
                status = "DEGRADED"
                severity = "critical"

        status_list.append({
            "joint": joint_name,
            "status": status,
            "severity": severity,
            "confidence": round(confidence, 4),
        })

    return status_list






_model_instance = None

def get_form_model() -> FormAnalysisModel:
    """Get or create the singleton FormAnalysisModel instance."""
    global _model_instance
    if _model_instance is None:
        logger.info("[FormModel] Initializing LSTM model (first request)...")
        _model_instance = FormAnalysisModel()
    return _model_instance
