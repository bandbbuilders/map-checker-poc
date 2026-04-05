# OPERATION MAP-CHECK (POC V1)

## Overview
Tactical Military Map Auditor for Pakistan Army topographical verification.

### Features
- **SOP-01 (Contour Interval check)**: Validates 4-line rule (4 thin brown lines between thick index lines).
- **Dual-Pane Tactical UI**: Compare original map with AI-processed layers.
- **OpenCV Engine**: Automated color segmentation for brown (contours), blue (rivers), and red (grid) lines.
- **RESTRICTED Dashboard**: High-contrast military UI/UX with real-time coordinate tracking.

## Technology Stack
- **Frontend**: React.js, Tailwind CSS V4, Framer Motion, Lucide Icons.
- **Backend**: Python FastAPI, OpenCV, NumPy.
- **deployment**: Vercel Serverless Functions.

## Deployment
Live at: [https://map-checker-poc.vercel.app](https://map-checker-poc.vercel.app)

## Local Setup
1. `cd map-checker-poc`
2. `npm install`
3. `npm run dev`
4. For backend: `uvicorn api.index:app --reload`
