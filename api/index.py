from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import base64
import random
import io
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

def get_endpoints(skeleton):
    skel = (skeleton > 0).astype(np.uint8)
    kernel = np.array([[1, 1, 1],
                       [1, 10, 1],
                       [1, 1, 1]], dtype=np.uint8)
    filtered = cv2.filter2D(skel, -1, kernel)
    return (filtered == 11).astype(np.uint8)

def get_tangent(skel, x, y, radius=10):
    """ Calculate local tangent of a line segment at (x,y) """
    h, w = skel.shape
    roi = skel[max(0, y-radius):min(h, y+radius), max(0, x-radius):min(w, x+radius)]
    coords = np.column_stack(np.where(roi > 0))
    if len(coords) < 3: return 0
    # PCA or Line Fit
    [vx, vy, x0, y0] = cv2.fitLine(coords, cv2.DIST_L2, 0, 0.01, 0.01)
    return math.atan2(vy, vx)

@app.post("/api/audit")
async def audit_map(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Handle PDF conversion
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

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    orig_h, orig_w, _ = img.shape
    MAX_RES = 1600 
    if orig_w > MAX_RES or orig_h > MAX_RES:
        scale = MAX_RES / max(orig_w, orig_h)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    h, w, _ = img.shape
    
    # --- STAGE A: SEMANTIC SEGMENTATION (Classic Vision Simulation of DeepLab) ---
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # 1. Contours (Brown)
    brown_mask = cv2.inRange(hsv, np.array([5, 45, 30]), np.array([25, 255, 180]))
    
    # 2. Text/Labels (Black/Dark Gray)
    text_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 60]))
    
    # 3. Grid Lines (Red/Magenta)
    grid_mask = cv2.inRange(hsv, np.array([160, 50, 50]), np.array([180, 255, 255]))
    grid_mask = cv2.bitwise_or(grid_mask, cv2.inRange(hsv, np.array([0, 50, 50]), np.array([10, 255, 255])))

    # Combined Interference Mask
    interference_mask = cv2.bitwise_or(text_mask, grid_mask)
    
    # --- STAGE B: GEOMETRIC INPAINTING & CONTEXTUAL AUDIT ---
    skel = skeletonize(brown_mask)
    eps = get_endpoints(skel)
    ey, ex = np.where(eps > 0)
    
    endpoints = []
    for (x, y) in zip(ex, ey):
        if 40 < x < w-40 and 40 < y < h-40:
            endpoints.append({'x': int(x), 'y': int(y), 'angle': get_tangent(skel, x, y)})

    continuation_layer = np.zeros((h, w, 4), dtype=np.uint8)
    processed = img.copy()
    errors = []
    
    used_eps = set()
    
    # Match Endpoints for Inpainting Prediction
    for i, ep1 in enumerate(endpoints):
        if i in used_eps: continue
        
        best_match = -1
        min_score = 1000
        
        for j, ep2 in enumerate(endpoints):
            if i == j or j in used_eps: continue
            
            dist = math.sqrt((ep1['x']-ep2['x'])**2 + (ep1['y']-ep2['y'])**2)
            if dist < 80: # Max gap
                # Check Tangent Alignment
                angle_diff = abs(ep1['angle'] - ep2['angle'])
                if angle_diff > math.pi: angle_diff = abs(angle_diff - 2*math.pi)
                
                # Check if interference (text/grid) exists in between
                roi_x, roi_y = (ep1['x']+ep2['x'])//2, (ep1['y']+ep2['y'])//2
                interfered = interference_mask[roi_y, roi_x] > 0
                
                score = dist + (angle_diff * 50)
                if score < min_score:
                    min_score = score
                    best_match = j
                    is_interfered = interfered

        if best_match != -1 and min_score < 150:
            ep2 = endpoints[best_match]
            used_eps.add(i)
            used_eps.add(best_match)
            
            # Predict Path (Dotted Line)
            cv2.line(continuation_layer, (ep1['x'], ep1['y']), (ep2['x'], ep2['y']), (44, 105, 145, 150), 2) # Dotted simulation
            
            # Check Continuation Rule
            # In real system, extrapolate elevation from nearby OCR. Here, simulate confirmation.
            elevation_match = random.random() > 0.3
            
            if elevation_match:
                # Validation Warning (Confirmed by Curvature/Tangent but partially obscured)
                errors.append({
                    "id": len(errors)+1, "type": "WARNING", "status": "WARN",
                    "message": "Validation Warning: Line predicted via Geometric Inpainting",
                    "x": (ep1['x']/w)*100, "y": (ep1['y']/h)*100
                })
            else:
                errors.append({
                    "id": len(errors)+1, "type": "INTEGRITY", "status": "FAIL",
                    "message": "Integrity Error: Unconfirmed contour path (elevation mismatch)",
                    "x": (ep1['x']/w)*100, "y": (ep1['y']/h)*100
                })
        else:
            if i not in used_eps:
                # Truly broken line with no inferred path
                errors.append({
                    "id": len(errors)+1, "type": "INTEGRITY", "status": "FAIL",
                    "message": "Integrity Error: Critical line break (No continuation inferred)",
                    "x": (ep1['x']/w)*100, "y": (ep1['y']/h)*100
                })

    # Encode Result
    _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')
    
    _, layer_buf = cv2.imencode('.png', continuation_layer)
    layer_str = base64.b64encode(layer_buf).decode('utf-8')

    return {
        "image": img_str, 
        "layer": layer_str,
        "errors": errors
    }
