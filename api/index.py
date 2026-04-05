from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import base64
import random
import io
try:
    import fitz # PyMuPDF
except ImportError:
    fitz = None

app = FastAPI()

@app.get("/api/health")
def health():
    return {"status": "ok", "system": "PA-MIL-CV-ENGINE-V4"}

@app.post("/api/audit")
async def audit_map(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Handle PDF conversion if necessary
    if file.filename.lower().endswith('.pdf') and fitz:
        try:
            doc = fitz.open(stream=contents, filetype="pdf")
            page = doc.load_page(0) 
            pix = page.get_pixmap(dpi=150) 
            img_data = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            if pix.n == 3: img = cv2.cvtColor(img_data, cv2.COLOR_RGB2BGR)
            elif pix.n == 4: img = cv2.cvtColor(img_data, cv2.COLOR_RGBA2BGR)
            else: img = img_data
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"PDF Error: {str(e)}"})
    else:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    orig_h, orig_w, _ = img.shape
    MAX_RES = 1200 # Capped for stability
    if orig_w > MAX_RES or orig_h > MAX_RES:
        scale = MAX_RES / max(orig_w, orig_h)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    h, w, _ = img.shape
    processed = img.copy()

    # --- COLOR SEGMENTATION (Isolate Brown/Contours) ---
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_brown = np.array([5, 40, 30]) 
    upper_brown = np.array([35, 255, 220])
    brown_mask = cv2.inRange(hsv, lower_brown, upper_brown)

    errors = []
    edge_buf = 30

    # --- SOP-02: FAST LINE CONTINUITY DETECTION ---
    # We find terminal points by eroding and looking for difference
    eroded = cv2.erode(brown_mask, np.ones((3,3), np.uint8), iterations=1)
    tips = cv2.subtract(brown_mask, eroded)
    
    contours, _ = cv2.findContours(tips, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    unique_breaks = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 1 or area > 100: continue
        
        M = cv2.moments(cnt)
        if M["m00"] == 0: continue
        cx, cy = int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"])
        
        # Edge filter
        if cx < edge_buf or cx > w - edge_buf or cy < edge_buf or cy > h - edge_buf:
            continue
            
        # Is it a lonely end? (Check local neighborhood in brown mask)
        roi = brown_mask[max(0, cy-15):min(h, cy+15), max(0, cx-15):min(w, cx+15)]
        if cv2.countNonZero(roi) < 40: 
            # Avoid duplicates
            if all(abs(dx-cx) > 20 or abs(dy-cy) > 20 for dx, dy in unique_breaks):
                unique_breaks.append((cx, cy))

    for i, (bx, by) in enumerate(unique_breaks[:15]):
        errors.append({
            "id": len(errors) + 1,
            "type": "SOP-02",
            "message": f"Line Break Anomaly detected",
            "coords": f"{bx}, {by}",
            "x": (bx / w) * 100,
            "y": (by / h) * 100
        })
        cv2.circle(processed, (bx, by), 20, (0, 0, 255), 2)

    # --- SOP-01: CONTOUR INTERVALS (Density Check) ---
    dist_transform = cv2.distanceTransform(brown_mask, cv2.DIST_L2, 5)
    _, gap_threshold = cv2.threshold(dist_transform, 45, 255, cv2.THRESH_BINARY)
    gap_threshold = gap_threshold.astype(np.uint8)
    
    gap_contours, _ = cv2.findContours(gap_threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for i, cnt in enumerate(gap_contours):
        if 500 < cv2.contourArea(cnt) < 5000:
            gx, gy, gw, gh = cv2.boundingRect(cnt)
            cx, cy = gx + gw//2, gy + gh//2
            if cx < edge_buf or cx > w - edge_buf or cy < edge_buf or cy > h - edge_buf:
                continue
                
            errors.append({
                "id": len(errors) + 1,
                "type": "SOP-01",
                "message": f"Interval Violation: Large gap between lines",
                "coords": f"{cx}, {cy}",
                "x": (cx / w) * 100,
                "y": (cy / h) * 100
            })
            cv2.rectangle(processed, (gx, gy), (gx+gw, gy+gh), (0, 165, 255), 1)

    # Encode
    _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 85])
    img_str = base64.b64encode(buffer).decode('utf-8')

    return {
        "image": img_str, 
        "errors": errors
    }
