import numpy as np
from sklearn.metrics import confusion_matrix, log_loss


def multiclass_brier(y: np.ndarray, proba: np.ndarray) -> float:
    return float(np.mean(np.sum((proba - np.eye(3)[y]) ** 2, axis=1)))


def score(y: np.ndarray, proba: np.ndarray) -> dict[str, float]:
    return {
        "log_loss": float(log_loss(y, proba, labels=[0, 1, 2])),
        "brier": multiclass_brier(y, proba),
        "accuracy": float(np.mean(proba.argmax(axis=1) == y)),
        "n": float(len(y)),
    }


def calibration_curve(y: np.ndarray, proba: np.ndarray, bins: int = 10) -> dict[str, list[dict]]:
    out = {}
    edges = np.linspace(0, 1, bins + 1)
    for k, name in enumerate(("home", "draw", "away")):
        rows = []
        for lo, hi in zip(edges[:-1], edges[1:], strict=True):
            mask = (proba[:, k] >= lo) & (proba[:, k] < hi)
            if mask.sum() >= 10:
                rows.append({"predicted": float(proba[mask, k].mean()),
                             "observed": float((y[mask] == k).mean()), "n": int(mask.sum())})
        out[name] = rows
    return out


def confusion(y: np.ndarray, proba: np.ndarray) -> list[list[int]]:
    return confusion_matrix(y, proba.argmax(axis=1), labels=[0, 1, 2]).tolist()


def apply_temperature(proba: np.ndarray, temperature: float) -> np.ndarray:
    logits = np.log(np.clip(proba, 1e-9, 1)) / temperature
    scaled = np.exp(logits)
    return scaled / scaled.sum(axis=1, keepdims=True)


def fit_temperature(y: np.ndarray, proba: np.ndarray) -> float:
    grid = np.arange(0.6, 1.81, 0.02)
    losses = [log_loss(y, apply_temperature(proba, t), labels=[0, 1, 2]) for t in grid]
    return float(grid[int(np.argmin(losses))])
