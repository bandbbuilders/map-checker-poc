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

def get_endpoints(skeleton):
    # Kernel to find endpoints
    kernel = np.array([[1, 1, 1],
                       [1, 10, 1],
                       [1, 1, 1]], dtype=np.uint8)
    filtered = cv2.filter2D(skeleton, -1, kernel)
    # 11 = 10 (center) + 1 (neighbor)
    endpoints = (filtered == 11).astype(np.uint8)
    return endpoints

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
    MAX_RES = 1200 # Capped for Vercel 10s stability
    if orig_w > MAX_RES or orig_h > MAX_RES:
        scale = MAX_RES / max(orig_w, orig_h)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    h, w, _ = img.shape
    processed = img.copy()

    # --- COLOR SEGMENTATION (Isolate Brown/Contours) ---
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_brown = np.array([5, 40, 30]) # Wider range for diverse map prints
    upper_brown = np.array([35, 255, 220])
    brown_mask = cv2.inRange(hsv, lower_brown, upper_brown)

    errors = []

    # --- SOP-02: FAST LINE CONTINUITY DETECTION ---
    # We find "broken ends" by comparing the mask with its closed version
    # and looking for "terminal" blobs
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5))
    closed = cv2.morphologyEx(brown_mask, cv2.MORPH_CLOSE, kernel)
    
    # Skeletonize the mask to find endpoints effectively
    # Using a fast 1-pass thinning approximation
    eroded = cv2.erode(brown_mask, np.ones((3,3), np.uint8), iterations=1)
    diff = cv2.subtract(brown_mask, eroded)
    
    # Focus on the diff regions to find potential breaks
    contours, _ = cv2.findContours(diff, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 0.5 < area < 50: # Likely an endpoint or small break
            M = cv2.moments(cnt)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                
                # Check if this endpoint is truly "terminal"
                # (lone dot on a line end)
                roi = brown_mask[max(0, cy-10):min(h, cy+10), max(0, cx-10):min(w, cx+10)]
                if cv2.countNonZero(roi) < 30: # It's a lonely tip!
                    errors.append({
                        "id": len(errors) + 1,
                        "type": "SOP-02",
                        "message": f"Detected Potential Line Break",
                        "coords": f"{cx}, {cy}",
                        "x": (cx / w) * 100,
                        "y": (cy / h) * 100
                    })
                    cv2.circle(processed, (cx, cy), 15, (0, 0, 255), 2)
    
    # 3. Analyze endpoint clusters (lone endpoints away from edges)
    edge_buf = 20
    ep_y, ep_x = np.where(endpoints_img > 0)
    
    # We group nearby endpoints because a single "break" has two ends
    detected_breaks = []
    for (ex, ey) in zip(ep_x, ep_y):
        # Filter out image edges
        if ex < edge_buf or ex > w - edge_buf or ey < edge_buf or ey > h - edge_buf:
            continue
            
        # Is this a "lone" endpoint? (No other endpoints very close, or part of a small island)
        is_far = True
        for (dx, dy) in detected_breaks:
            if abs(dx-ex) < 15 and abs(dy-ey) < 15:
                is_far = False
                break
        
        if is_far:
            detected_breaks.append((int(ex), int(ey)))
            
    # Add real errors from detected breaks
    for i, (bx, by) in enumerate(detected_breaks[:10]): # Cap for UI performance
        errors.append({
            "id": len(errors) + 1,
            "type": "SOP-02",
            "message": f"Critical Contour Break detected @ PT-{i+1}",
            "coords": f"{bx}, {by}",
            "x": (bx / w) * 100,
            "y": (by / h) * 100
        })
        cv2.circle(processed, (bx, by), 10, (0, 0, 255), 2)

    # --- SOP-01: CONTOUR INTERVALS (Density Check) ---
    # Look for "dead zones" where brown density is unexpectedly low in active areas
    dist_transform = cv2.distanceTransform(brown_mask, cv2.DIST_L2, 5)
    # Large gaps in contours show up as high values in distance transform
    _, gap_threshold = cv2.threshold(dist_transform, 40, 255, cv2.THRESH_BINARY)
    gap_threshold = gap_threshold.astype(np.uint8)
    
    gap_contours, _ = cv2.findContours(gap_threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for i, cnt in enumerate(gap_contours):
        if cv2.contourArea(cnt) > 200:
            gx, gy, gw, gh = cv2.boundingRect(cnt)
            cx, cy = gx + gw//2, gy + gh//2
            if cx < edge_buf or cx > w - edge_buf or cy < edge_buf or cy > h - edge_buf:
                continue
                
            errors.append({
                "id": len(errors) + 1,
                "type": "SOP-01",
                "message": f"Interval Violation: Sparse contour cluster",
                "coords": f"{cx}, {cy}",
                "x": (cx / w) * 100,
                "y": (cy / h) * 100
            })
            cv2.rectangle(processed, (gx, gy), (gx+gw, gy+gh), (0, 165, 255), 1)

    # Encode
    _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 90])
    img_str = base64.b64encode(buffer).decode('utf-8')

    return {
        "image": img_str, 
        "errors": errors
    }
