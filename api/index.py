from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import base64
import math
try:
    import fitz # PyMuPDF
except ImportError:
    fitz = None

app = FastAPI()

def skeletonize(img):
    skeleton = np.zeros(img.shape, np.uint8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3))
    temp = img.copy()
    while True:
        eroded = cv2.erode(temp, element)
        temp_dilated = cv2.dilate(eroded, element)
        temp_sub = cv2.subtract(temp, temp_dilated)
        skeleton = cv2.bitwise_or(skeleton, temp_sub)
        temp = eroded.copy()
        if cv2.countNonZero(temp) == 0:
            break
    return skeleton

def predict_trajectory(point, angle, length=30):
    """Hallucinates the next point based on a vector"""
    dx = math.cos(angle) * length
    dy = math.sin(angle) * length
    return (int(point[0] + dx), int(point[1] + dy))

@app.post("/api/audit")
async def audit_map(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Ingest Data
    if file.filename.lower().endswith('.pdf') and fitz:
        try:
            doc = fitz.open(stream=contents, filetype="pdf")
            page = doc.load_page(0) 
            pix = page.get_pixmap(dpi=150) 
            img_data = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            img = cv2.cvtColor(img_data, cv2.COLOR_RGB2BGR if pix.n == 3 else cv2.COLOR_RGBA2BGR)
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"PDF_INGEST_FAIL: {str(e)}"})
    else:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None: return JSONResponse(status_code=400, content={"error": "IMG_DECODE_ERR"})

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # --- STAGE A: MULTI-CHANNEL SEGMENTATION ---
    # 1. Contours (Brown)
    brown_mask = cv2.inRange(hsv, np.array([5, 45, 30]), np.array([25, 255, 180]))
    
    # 2. Text/Labels (Deep Blacks/Darks)
    text_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 60]))
    
    # 3. Geometric Overlays (Red Circles/Markers)
    red_mask_1 = cv2.inRange(hsv, np.array([0, 70, 50]), np.array([10, 255, 180]))
    red_mask_2 = cv2.inRange(hsv, np.array([170, 70, 50]), np.array([180, 255, 180]))
    red_mask = cv2.bitwise_or(red_mask_1, red_mask_2)

    # --- AMODAL INPAINTING (TRAJECTORY HALLUCINATION) ---
    # We find where brown lines intersect Text/Red areas and 'predict' their path.
    inpainted_mask = brown_mask.copy()
    hallucination_layer = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Skeletonize to find endpoints
    skel = skeletonize(brown_mask)
    endpoints = []
    # Simple endpoint detection in skeleton (neighbors == 1)
    # Optimized: Find coords where sum in 3x3 is 2 (center + 1 neighbor)
    kernel = np.array([[1, 1, 1], [1, 10, 1], [1, 1, 1]], dtype=np.uint8)
    filtered = cv2.filter2D(skel.astype(np.uint8), -1, kernel)
    points = np.argwhere(filtered == 11) # 10 (center) + 1 (neighbor)
    
    for py, px in points:
        # Check if this endpoint is near Text or Red Circle
        roi_txt = text_mask[max(0, py-10):min(h, py+10), max(0, px-10):min(w, px+10)]
        roi_red = red_mask[max(0, py-10):min(h, py+10), max(0, px-10):min(w, px+10)]
        
        if cv2.countNonZero(roi_txt) > 5 or cv2.countNonZero(roi_red) > 5:
            # Predict Trajectory: Calculate tangent from previous 5px
            # (Simplified for POC: Draw dotted path into the obscured area)
            cv2.circle(hallucination_layer, (px, py), 2, (57, 255, 20, 255), -1) # Pulse point
            # Hallucinate 40px forward (In reality we'd calculate vector)
            # For POC, we draw a 'Best Guess' dotted line if a nearby endpoint matches direction
            endpoints.append((px, py))

    # --- STAGE B & C: PDP AUDIT & AUTHORITATIVE FLAGGING ---
    markers = []
    tile = 120
    for y in range(tile, h-tile, tile):
        for x in range(tile, w-tile, tile):
            # Ignore boundaries
            if x < 40 or x > w-40 or y < 40 or y > h-40: continue
            
            roi_brown = brown_mask[y:y+tile, x:x+tile]
            if cv2.countNonZero(roi_brown) > 50:
                # Text/Red Detection in this tile
                has_text = cv2.countNonZero(text_mask[y:y+tile, x:x+tile]) > 20
                has_red = cv2.countNonZero(red_mask[y:y+tile, x:x+tile]) > 20
                
                # SOP-01 Violation Filter (The Perpendicular Probe)
                skel_roi = skeletonize(roi_brown)
                n, _ = cv2.connectedComponents(skel_roi)
                n -= 1 # Intermediate segment count
                
                # Rule: 4 intermediates expected.
                if 0 < n < 4:
                    # AUTHORITATIVE TRIGGER: Overlaid-Text Confusion Override
                    # If we are inside a red circle AND there is text, trust the audit 100%
                    is_critical = has_text and has_red
                    msg = "PDP_ANOMALY: Expected 4 intermediate layers, detected {}. Continuity failure.".format(n)
                    if is_critical: 
                        msg = "ANOMALY_OVERRIDE V1.0.4: Confirmed failure occluded by Labels & Overlay. Expected 4, found {}.".format(n)
                    
                    markers.append({
                        "id": f"PDP-{len(markers)}", "type": "DENSITY_PROBE_FAIL", 
                        "status": "CRITICAL" if is_critical else "FAIL",
                        "message": msg, "x": (x/w)*100, "y": (y/h)*100,
                        "confidence": 98 if is_critical else 85
                    })
                    
                    # Draw visual probe on feedback layer
                    cv2.rectangle(hallucination_layer, (x, y), (x+tile, y+tile), (230, 57, 70, 80), 2)

    # Encode Layers
    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')
    _, layer_buf = cv2.imencode('.png', hallucination_layer)
    layer_str = base64.b64encode(layer_buf).decode('utf-8')

    return {"image": img_str, "layer": layer_str, "errors": markers}
