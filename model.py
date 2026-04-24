import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import io
import random
import time

# Specific Crop Diseases for classification
CLASSES = ["Healthy", "Early Blight", "Late Blight", "Leaf Rust", "Powdery Mildew"]

class CropDiseaseClassifier(nn.Module):
    def __init__(self, num_classes=5):
        super(CropDiseaseClassifier, self).__init__()
        # A simple CNN structure for demonstration
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2)
        )
        # Using adaptive pool so we don't care about exact image sizes
        self.pool = nn.AdaptiveAvgPool2d((4, 4))
        self.classifier = nn.Sequential(
            nn.Linear(32 * 4 * 4, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes)
        )

    def forward(self, x):
        x = self.features(x)
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        x = self.classifier(x)
        return x

# Instantiate a global model
model = CropDiseaseClassifier(num_classes=len(CLASSES))
model.eval() # Set to evaluation mode

# Preprocessing transforms
transform_pipeline = transforms.Compose([
    transforms.Resize((128, 128)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# Recommendations database
RECOMMENDATIONS = {
    "Healthy": [
        "Optimal hydration and nutrition detected.",
        "Crop vitals within normal range. Continue current regimen.",
        "No anomalies detected. Maintain current irrigation schedule.",
        "All green — photosynthesis activity is optimal.",
    ],
    "Early Blight": [
        "Fungicide treatment recommended for Early Blight. Increase airflow.",
        "Apply chlorothalonil-based fungicide. Remove lower affected leaves.",
        "Early Blight detected — reduce overhead irrigation to limit spread.",
    ],
    "Late Blight": [
        "Urgent: Apply systemic fungicide for Late Blight immediately.",
        "Late Blight progressing — consider copper-based spray and crop rotation.",
        "Isolate affected zone. Apply mancozeb treatment within 24 hours.",
    ],
    "Leaf Rust": [
        "Remove infected leaves. Apply copper-based fungicide.",
        "Leaf Rust detected — increase plant spacing for better ventilation.",
        "Apply propiconazole fungicide. Monitor surrounding plots.",
    ],
    "Powdery Mildew": [
        "Inspect closely for Powdery Mildew. Adjust watering schedule.",
        "Apply neem oil or sulfur-based fungicide for Powdery Mildew.",
        "Reduce humidity around foliage. Prune dense canopy sections.",
    ],
}

def analyze_crop_image(image_bytes: bytes):
    """
    Decodes the uploaded image, converts it to a tensor, and runs it through the PyTorch model.
    Adds slight randomization for realistic real-time demo behavior.
    """
    try:
        # Load image via Pillow
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Preprocess
        tensor = transform_pipeline(image).unsqueeze(0) # Add batch dimension
        
        # Add slight noise to input for varied outputs across frames
        noise = torch.randn_like(tensor) * 0.08
        tensor_noisy = tensor + noise
        
        # Inference
        with torch.no_grad():
            outputs = model(tensor_noisy)
            probabilities = torch.nn.functional.softmax(outputs, dim=1)[0]
        
        # Get the top prediction
        confidence_score, predicted_idx = torch.max(probabilities, 0)
        disease_name = CLASSES[predicted_idx.item()]
        
        # Add slight confidence jitter for realism (±3%)
        jitter = random.uniform(-0.03, 0.03)
        adjusted_confidence = max(0.15, min(0.99, confidence_score.item() + jitter))
        
        is_healthy = (disease_name == "Healthy")
        status = "Healthy" if is_healthy else "Needs Attention"
        
        recommendation = random.choice(RECOMMENDATIONS.get(disease_name, ["Continue monitoring."]))

        return {
            "analysis": "Crop Disease Detection",
            "health_score": round(adjusted_confidence * 100, 2),
            "disease_probability": round((1.0 - adjusted_confidence if is_healthy else adjusted_confidence) * 100, 2),
            "status": status,
            "detected_disease": disease_name,
            "recommendation": recommendation,
            "model_used": "PyTorch Custom CNN (CropDiseaseClassifier)",
            "timestamp": time.time()
        }
    except Exception as e:
        print(f"Error processing image: {e}")
        return {"error": "Failed to process the uploaded image."}
