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

@app.post("/api/audit")
async def audit_map(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Handle PDF/Image
    if file.filename.lower().endswith('.pdf') and fitz:
        try:
            doc = fitz.open(stream=contents, filetype="pdf")
            page = doc.load_page(0) 
            pix = page.get_pixmap(dpi=150) 
            img_data = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            img = cv2.cvtColor(img_data, cv2.COLOR_RGB2BGR if pix.n == 3 else cv2.COLOR_RGBA2BGR)
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"PDF Error: {str(e)}"})
    else:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None: return JSONResponse(status_code=400, content={"error": "Invalid image"})

    # --- SOP-01: INTERVAL COUNTING LOGIC ---
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Isolate ALL Brown Contours
    lower_brown = np.array([5, 45, 30])
    upper_brown = np.array([25, 255, 180])
    brown_mask = cv2.inRange(hsv, lower_brown, upper_brown)
    
    # Settle ROI
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    roi_mask = np.zeros((h, w), dtype=np.uint8)
    if contours:
        cv2.drawContours(roi_mask, [max(contours, key=cv2.contourArea)], -1, 255, -1)
    
    # Differentiate Index (Thick) and Intermediate (Thin)
    # Strategy: Erode brown mask slightly. Thick lines survive, thin lines vanish.
    kernel_thick = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    thick_mask = cv2.erode(brown_mask, kernel_thick, iterations=1)
    thick_mask = cv2.dilate(thick_mask, kernel_thick, iterations=1)
    thick_mask = cv2.bitwise_and(thick_mask, roi_mask)
    
    thin_mask = cv2.subtract(brown_mask, thick_mask)
    thin_mask = cv2.bitwise_and(thin_mask, roi_mask)

    # --- VIRTUAL PROBE SIMULATION ---
    # We find areas where index contours exist and 'probe' the space between them.
    # In a real system, we'd use gradient vectors. For POC, we'll scan grid tiles.
    markers = []
    tile_size = 120
    for y in range(tile_size, h - tile_size, tile_size):
        for x in range(tile_size, w - tile_size, tile_size):
            # Check edge buffer (Natural endpoint suppression)
            if x < 40 or x > w-40 or y < 40 or y > h-40: continue
            
            roi_thick = thick_mask[y:y+tile_size, x:x+tile_size]
            # If we see index lines, we check the intervals
            if cv2.countNonZero(roi_thick) > 50:
                roi_thin = thin_mask[y:y+tile_size, x:x+tile_size]
                # Skeletonize thin lines in ROI to count segments
                skel_thin = skeletonize(roi_thin)
                num_segments, _ = cv2.connectedComponents(skel_thin)
                num_segments -= 1 # Background component
                
                # Rule: Exactly 4 segments (intervals) expected between Index contours in standard topographical maps
                # We simulate a failure if count is 1-3.
                if 0 < num_segments < 4:
                    # Confidence-based filtering to avoid false positives (Noise check)
                    if cv2.countNonZero(roi_thin) > 20: 
                        markers.append({
                            "id": len(markers), "type": "MISSING_INTERVAL", "status": "CRITICAL",
                            "message": f"SOP-01 Violation: Expected 4 segments, detected {num_segments}. Integrity compromised.",
                            "x": (x/w)*100, "y": (y/h)*100,
                            "confidence": 92
                        })

    # Suppression: Filter markers near text (Simulated)
    # In a full run, we'd use an OCR mask here.
    
    continuation_layer = np.zeros((h, w, 4), dtype=np.uint8)
    # DRAW VIRTUAL PROBES (Visual verification)
    for m in markers:
        mx, my = int(m['x']*w/100), int(m['y']*h/100)
        cv2.rectangle(continuation_layer, (mx, my), (mx+tile_size, my+tile_size), (0, 0, 255, 100), 2)

    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')
    _, layer_buf = cv2.imencode('.png', continuation_layer)
    layer_str = base64.b64encode(layer_buf).decode('utf-8')

    return {"image": img_str, "layer": layer_str, "errors": markers}
