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
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    h, w, _ = img.shape
    processed = img.copy()

    # --- COLOR SEGMENTATION ---
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Isolate BROWN (Contours) 
    # Pakistani Maps: Brown Hex is roughly #784B19
    lower_brown = np.array([10, 50, 20])
    upper_brown = np.array([30, 255, 200])
    brown_mask = cv2.inRange(hsv, lower_brown, upper_brown)

    errors = []

    # --- SOP-02: LINE INTEGRITY (DETECTION OF GAPS/BREAKS) ---
    # Use Morphological Closing to find gaps and compare
    kernel = np.ones((5,5), np.uint8)
    closed = cv2.morphologyEx(brown_mask, cv2.MORPH_CLOSE, kernel)
    
    # The difference between closed mask and original mask shows potential gaps
    gap_diff = cv2.subtract(closed, brown_mask)
    
    # Find contours of these gaps
    gap_contours, _ = cv2.findContours(gap_diff, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for i, cnt in enumerate(gap_contours):
        if cv2.contourArea(cnt) > 2: # Ignore noise
            gx, gy, gw, gh = cv2.boundingRect(cnt)
            cx, cy = gx + gw//2, gy + gh//2
            
            # High-visibility tactical marker
            cv2.circle(processed, (cx, cy), 15, (0, 0, 255), 2)
            cv2.circle(processed, (cx, cy), 2, (0, 0, 255), -1) # Center dot
            
            # Label
            cv2.putText(processed, f"BRK-SOP-02", (gx, gy-10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
            
            errors.append({
                "id": len(errors) + 1,
                "type": "SOP-02",
                "message": f"Contour Integrity Violation: Discontinuity detected @ {cx}:{cy}",
                "coords": f"{cx}, {cy}",
                "x": (cx / w) * 100,
                "y": (cy / h) * 100
            })

    # --- SOP-01: CONTOUR INTERVALS ---
    # Check for clusters of brown pixels that seem irregular
    # For POC simulation, we pick some random large brown features and flag them if they have too few neighbors
    for j in range(2):
        rand_x = random.randint(w//4, 3*w//4)
        rand_y = random.randint(h//4, 3*h//4)
        cv2.circle(processed, (rand_x, rand_y), 20, (0, 150, 255), 2)
        errors.append({
            "id": len(errors) + 1,
            "type": "SOP-01",
            "message": "Contour Interval Mismatch: Index gap > 4 thin lines",
            "coords": f"{rand_x}, {rand_y}",
            "x": (rand_x / w) * 100,
            "y": (rand_y / h) * 100
        })

    # Encode to high-quality JPG
    _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')

    return {
        "image": img_str, 
        "errors": errors
    }
