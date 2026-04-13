from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import torch
import torch.nn as nn
import numpy as np
import xgboost as xgb

# -----------------------------
# Model Configuration
# -----------------------------
CONTEXT_LENGTH = 96
PREDICTION_LENGTH = 96
FEATURE_COUNT = 8

# -----------------------------
# DeepAR Model Definition
# -----------------------------
class DeepAR(nn.Module):
    def __init__(self, hidden_size=64):
        super().__init__()
        self.lstm = nn.LSTM(1, hidden_size, batch_first=True)
        self.fc_mu = nn.Linear(hidden_size, PREDICTION_LENGTH)
        self.fc_sigma = nn.Linear(hidden_size, PREDICTION_LENGTH)

    def forward(self, x):
        out, _ = self.lstm(x)
        last_hidden = out[:, -1, :]
        mu = self.fc_mu(last_hidden)
        sigma = torch.exp(self.fc_sigma(last_hidden)) + 1e-6
        return mu, sigma


# -----------------------------
# Load Models
# -----------------------------
model = DeepAR()
model.load_state_dict(torch.load("deepar_model.pth", map_location="cpu"))
model.eval()

xgb_model = xgb.XGBRegressor()
xgb_model.load_model("xgb_model.json")

# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI(title="Microgrid Forecast API", version="1.0.0")


# -----------------------------
# Request Schema
# -----------------------------
class InferenceInput(BaseModel):
    load_window: List[float]
    features: List[float]


# -----------------------------
# Forecast Endpoint
# -----------------------------
@app.post("/forecast")
def forecast(data: InferenceInput):

    try:
        # Validate lengths
        if len(data.load_window) != CONTEXT_LENGTH:
            return {
                "error": f"load_window must contain exactly {CONTEXT_LENGTH} float values"
            }

        if len(data.features) != FEATURE_COUNT:
            return {
                "error": f"features must contain exactly {FEATURE_COUNT} float values"
            }

        # DeepAR Inference
        input_tensor = torch.tensor(data.load_window, dtype=torch.float32)
        input_tensor = input_tensor.unsqueeze(0).unsqueeze(-1)

        with torch.no_grad():
            mu, sigma = model(input_tensor)

        # 1-step ahead prediction (first horizon)
        deepar_pred = mu.detach().cpu().numpy()[0, 0]

        # XGBoost Inference
        xgb_pred = xgb_model.predict(
            np.array(data.features).reshape(1, -1)
        )[0]

        # Ensemble
        final_pred = 0.6 * deepar_pred + 0.4 * xgb_pred

        return {
            "deepar_mean": float(deepar_pred),
            "xgb_prediction": float(xgb_pred),
            "ensemble_prediction": float(final_pred)
        }

    except Exception as e:
        return {"error": str(e)}

