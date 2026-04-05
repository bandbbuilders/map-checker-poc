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

def get_endpoints(skeleton):
    skel = (skeleton > 0).astype(np.uint8)
    kernel = np.array([[1, 1, 1],
                       [1, 10, 1],
                       [1, 1, 1]], dtype=np.uint8)
    filtered = cv2.filter2D(skel, -1, kernel)
    return (filtered == 11).astype(np.uint8)

def get_tangent(skel, x, y, radius=10):
    h, w = skel.shape
    r = radius
    roi = skel[max(0, y-r):min(h, y+r), max(0, x-r):min(w, x+r)]
    coords = np.column_stack(np.where(roi > 0))
    if len(coords) < 3: return 0.0
    [vx, vy, x0, y0] = cv2.fitLine(coords, cv2.DIST_L2, 0, 0.01, 0.01)
    return math.atan2(float(vy[0]), float(vx[0]))

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

    # Resize for processing speed
    orig_h, orig_w = img.shape[:2]
    MAX_RES = 1600
    if max(orig_h, orig_w) > MAX_RES:
        scale = MAX_RES / max(orig_h, orig_w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # SOP-01: Isolate Brown (Contour Layer)
    brown_mask = cv2.inRange(hsv, np.array([5, 45, 30]), np.array([25, 255, 180]))
    
    # Skeleton & Endpoints
    skel = skeletonize(brown_mask)
    eps_mask = get_endpoints(skel)
    ey, ex = np.where(eps_mask > 0)
    
    endpoints = []
    for x, y in zip(ex, ey):
        if 50 < x < w-50 and 50 < y < h-50:
            endpoints.append({'x': int(x), 'y': int(y), 'angle': get_tangent(skel, x, y)})

    continuation_layer = np.zeros((h, w, 4), dtype=np.uint8)
    markers = []
    used = set()
    
    # Match & Inpaint
    for i, ep1 in enumerate(endpoints):
        if i in used: continue
        match_idx = -1
        min_score = 1000
        
        for j, ep2 in enumerate(endpoints):
            if i == j or j in used: continue
            dist = math.sqrt((ep1['x']-ep2['x'])**2 + (ep1['y']-ep2['y'])**2)
            if dist < 60: # 50-60 radius
                angle_diff = abs(ep1['angle'] - ep2['angle'])
                if angle_diff > math.pi: angle_diff = abs(angle_diff - 2*math.pi)
                
                score = dist + (angle_diff * 40)
                if score < min_score:
                    min_score = score
                    match_idx = j
        
        if match_idx != -1 and min_score < 120:
            ep2 = endpoints[match_idx]
            used.add(i); used.add(match_idx)
            # Draw Dotted Neon Line (Visual Inpainting)
            cv2.line(continuation_layer, (ep1['x'], ep1['y']), (ep2['x'], ep2['y']), (57, 255, 20, 200), 2)
            markers.append({
                "id": len(markers), "type": "INPAINTED", "status": "RESOLVED",
                "message": "SOP-01: Line Continuity Restored",
                "x": ((ep1['x']+ep2['x'])/2/w)*100, "y": ((ep1['y']+ep2['y'])/2/h)*100
            })
        elif i not in used:
            markers.append({
                "id": len(markers), "type": "INTEGRITY_ERROR", "status": "CRITICAL",
                "message": "SOP-01: Physical Line Break Detected",
                "x": (ep1['x']/w)*100, "y": (ep1['y']/h)*100
            })

    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')
    _, layer_buf = cv2.imencode('.png', continuation_layer)
    layer_str = base64.b64encode(layer_buf).decode('utf-8')

    return {"image": img_str, "layer": layer_str, "errors": markers}
