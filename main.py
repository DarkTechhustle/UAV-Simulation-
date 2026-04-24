from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random
import time

from model import analyze_crop_image

app = FastAPI(title="UAV Smart Agriculture API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# Pydantic models

class TelemetryData(BaseModel):
    x: float
    y: float
    z: float
    battery: float
    timestamp: float

# In-memory scan history (last 50 results)
scan_history = []
MAX_HISTORY = 50

# --- Routes ---

@app.post("/api/telemetry")
async def receive_telemetry(data: TelemetryData):
    return {"status": "success", "received": True}

@app.get("/api/telemetry-stream")
async def stream_mock_telemetry():
    # Returns an array of mock signal/range values for the frontend graph
    mock_bars = [random.randint(20, 100) for _ in range(10)]
    return {"data": mock_bars}

@app.post("/api/analyze")
async def analyze_crop(
    file: UploadFile = File(...)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    
    contents = await file.read()
    result = analyze_crop_image(contents)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    
    # Store in history
    scan_history.append(result)
    if len(scan_history) > MAX_HISTORY:
        scan_history.pop(0)
        
    return result

@app.get("/api/analysis-history")
async def get_analysis_history(limit: int = 10):
    """Return the last N scan results."""
    return {"history": scan_history[-limit:], "total_scans": len(scan_history)}

@app.get("/api/analysis-stats")
async def get_analysis_stats():
    """Return aggregate statistics for all scans performed this session."""
    if not scan_history:
        return {
            "total_scans": 0,
            "anomalies": 0,
            "avg_confidence": 0,
            "avg_health": 0,
            "disease_counts": {}
        }
    
    anomalies = sum(1 for s in scan_history if s.get("status") == "Needs Attention")
    avg_confidence = sum(s.get("health_score", 0) for s in scan_history) / len(scan_history)
    
    disease_counts = {}
    for s in scan_history:
        disease = s.get("detected_disease", "Unknown")
        disease_counts[disease] = disease_counts.get(disease, 0) + 1
    
    return {
        "total_scans": len(scan_history),
        "anomalies": anomalies,
        "avg_confidence": round(avg_confidence, 2),
        "disease_counts": disease_counts
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to the UAV Backend. Go to /static/index.html to view the dashboard."}
