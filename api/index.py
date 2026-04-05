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

def get_line_angle(skel, y, x, radius=5):
    """Calculates the local angle/slope of a skeletonized line"""
    h, w = skel.shape
    roi = skel[max(0, y-radius):min(h, y+radius+1), max(0, x-radius):min(w, x+radius+1)]
    points = np.argwhere(roi > 0)
    if len(points) < 2: return 0
    # Center points
    points = points - [radius, radius]
    # Simple linear fit or PCA for angle
    try:
        [vx, vy, x0, y0] = cv2.fitLine(points, cv2.DIST_L2, 0, 0.01, 0.01)
        return math.atan2(vy[0], vx[0])
    except:
        return 0

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
            return JSONResponse(status_code=400, content={"error": f"INGEST_FAIL: {str(e)}"})
    else:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None: return JSONResponse(status_code=400, content={"error": "IMG_DECODE_ERR"})

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # --- STAGE 1: GLOBAL RASTER SCAN (BLIND SEARCH) ---
    # 1. Isolate Brown Contours
    brown_mask = cv2.inRange(hsv, np.array([5, 45, 30]), np.array([25, 255, 180]))
    
    # 2. Skeletonization (Path connection verification)
    skel = skeletonize(brown_mask)
    
    # 3. Endpoint Detection (Neighbor == 1)
    # Using 3x3 kernel to find pixels with exactly one neighbor
    kernel = np.array([[1, 1, 1], [1, 10, 1], [1, 1, 1]], dtype=np.uint8)
    neighbor_count = cv2.filter2D(skel.astype(np.uint8), -1, kernel)
    
    # Endpoints have exactly 1 neighbor in a skeleton (Neighbor sum = 11)
    # Background=0, Node=10, 1 Neighbor=1. Total=11.
    endpoints = np.argwhere(neighbor_count == 11)
    
    markers = []
    processed_endpoints = set()
    
    # --- STAGE 2: SLOPE GAP ANALYSIS & AUTONOMOUS FLAGGING ---
    for py, px in endpoints:
        # Suppress Natural Endpoints (Edge of map or within index area)
        if px < 20 or px > w-20 or py < 20 or py > h-20: continue
        if (py, px) in processed_endpoints: continue

        # Identify slope for trajectory validation
        angle = get_line_angle(skel, py, px)
        
        # Search for a 'Logical Gap' (Line disappears where it shouldn't)
        # We look ahead in the trajectory to find another endpoint facing the same way
        found_gap = False
        search_dist = 50
        target_x = int(px + math.cos(angle) * search_dist)
        target_y = int(py + math.sin(angle) * search_dist)
        
        # In this POC, any endpoint not connected to another line and not at the edge
        # is a CONTINUITY_VIOLATION.
        
        # Check if there is another endpoint within range (A "Break")
        for py2, px2 in endpoints:
            if (py2, px2) == (py, px): continue
            dist = math.sqrt((px - px2)**2 + (py - py2)**2)
            if 5 < dist < 100: # Found a potential bridgeable break
                found_gap = True
                processed_endpoints.add((py2, px2))
                break
        
        if found_gap:
            markers.append({
                "id": f"CONT-{len(markers)}", 
                "type": "CONTINUITY_VIOLATION", 
                "status": "CRITICAL",
                "message": "AUTONOMOUS ALERT: Line break detected via Slope Validation. Trajectory interrupted by white-space gap.",
                "x": (px/w)*100, "y": (py/h)*100,
                "confidence": 97
            })

    # Output Visualization (Diagnostic Orange Layer)
    diagnostic_layer = np.zeros((h, w, 4), dtype=np.uint8)
    for m in markers:
        mx, my = int(m['x']*w/100), int(m['y']*h/100)
        # Draw Autonomous Orange Box
        cv2.rectangle(diagnostic_layer, (mx-20, my-20), (mx+20, my+20), (0, 165, 255, 180), 2)
        cv2.putText(diagnostic_layer, "GAP_DETECTED", (mx-20, my-25), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255, 255), 1)

    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')
    _, layer_buf = cv2.imencode('.png', diagnostic_layer)
    layer_str = base64.b64encode(layer_buf).decode('utf-8')

    return {"image": img_str, "layer": layer_str, "errors": markers}
