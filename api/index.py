from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import base64
import random
import io

app = FastAPI()

@app.get("/api/health")
def health():
    return {"status": "ok", "system": "PA-MIL-CV-ENGINE-V4"}

@app.post("/api/audit")
async def audit_map(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    # Decode image in color
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    # Clone for processing
    processed = img.copy()
    h, w, _ = processed.shape

    # --- COLOR SEGMENTATION (SOP-03) ---
    # Convert to HSV for better color isolation
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # 1. Isolate BROWN (Contours) - Approx Range
    # Brown in HSV is usually low Saturation, medium Value, low-mid Hue
    lower_brown = np.array([10, 50, 20])
    upper_brown = np.array([25, 255, 180])
    brown_mask = cv2.inRange(hsv, lower_brown, upper_brown)
    
    # 2. Isolate BLUE (Rivers/Hydro)
    lower_blue = np.array([100, 50, 50])
    upper_blue = np.array([130, 255, 255])
    blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)

    # --- SOP-01 Logic (4-Line Rule Check Mocking) ---
    # In a real engine, we'd use line thickness logic. Here we mock a detection.
    # We'll find a random cluster of brown pixels and flag it as a 4-line violation.
    contours, _ = cv2.findContours(brown_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    errors = []
    if len(contours) > 10:
        # Pick a few random spots to "flag" for the POC demonstration
        for i in range(min(2, len(contours))):
            target = random.choice(contours)
            x, y, w_box, h_box = cv2.boundingRect(target)
            cx, cy = x + w_box//2, y + h_box//2
            
            # Draw Tactical Overlay
            # Red "X" and Circle
            cv2.circle(processed, (cx, cy), 60, (0, 0, 255), 4)
            cv2.line(processed, (cx-30, cy-30), (cx+30, cy+30), (0, 0, 255), 5)
            cv2.line(processed, (cx-30, cy+30), (cx+30, cy-30), (0, 0, 255), 5)
            
            # Tooltip shadow text
            cv2.putText(processed, "ERR SOP-01: 3 LNS FOUND", (cx+70, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(processed, "ERR SOP-01: 3 LNS FOUND", (cx+70, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2, cv2.LINE_AA)
            
            # Map logical coordinates (mock grid)
            grid_x, grid_y = f"{cx:04d}", f"{cy:04d}"
            errors.append({
                "id": i + 1,
                "type": "SOP-01",
                "message": f"Contour frequency violation. Expected 4, found 3 lines between Index Contours.",
                "coords": f"GK {grid_x}-{grid_y}",
                "x": (cx / w) * 100,
                "y": (cy / h) * 100
            })

    # Add a "Scan Scanline" or similar visualization
    overlay = processed.copy()
    # cv2.addWeighted(overlay, 0.7, processed, 0.3, 0, processed)

    # Encode back to base64
    _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 85])
    img_str = base64.b64encode(buffer).decode('utf-8')

    return {
        "image": img_str, 
        "errors": errors,
        "metadata": {
            "resolution": f"{w}x{h}",
            "contours_detected": len(contours)
        }
    }
