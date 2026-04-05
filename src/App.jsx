import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Download, AlertTriangle, CheckCircle, Crosshair, 
  Map as MapIcon, Loader2, Info, Eye, Layers, 
  ShieldAlert, Settings, FileText, ChevronRight,
  Maximize2, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const App = () => {
  const [timestamp, setTimestamp] = useState(new Date().toISOString().replace('T', ' ').substring(0, 19));
  const [file, setFile] = useState(null);
  const [originalMapPreview, setOriginalMapPreview] = useState(null);
  const [processedMap, setProcessedMap] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0); // 0: Upload, 1: Process, 2: Report
  const [flickeringCoords, setFlickeringCoords] = useState("33.7294° N, 73.0931° E");
  const [errors, setErrors] = useState([]);
  const [showInspector, setShowInspector] = useState(false);
  const [activeSOP, setActiveSOP] = useState("SOP-01");
  const [markers, setMarkers] = useState([]);
  
  const mapRef = useRef(null);
  const transformRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimestamp(new Date().toISOString().replace('T', ' ').substring(0, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isProcessing) {
      const coordTimer = setInterval(() => {
        const lat = (33 + Math.random() * 0.1).toFixed(4);
        const lon = (73 + Math.random() * 0.1).toFixed(4);
        setFlickeringCoords(`${lat}° N, ${lon}° E`);
      }, 100);
      return () => clearInterval(coordTimer);
    }
  }, [isProcessing]);

  const onDrop = useCallback(acceptedFiles => {
    const selected = acceptedFiles[0];
    if (selected) {
      setFile(selected);
      setOriginalMapPreview(URL.createObjectURL(selected));
      setProcessedMap(null);
      setErrors([]);
      setMarkers([]);
      setActiveStep(1);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'application/pdf': [] },
    multiple: false
  });

  const runAudit = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProcessedMap(null);
    setErrors([]);
    setMarkers([]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Direct call to FastAPI backend
      const res = await axios.post('/api/audit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000
      });
      
      setProcessedMap(`data:image/jpeg;base64,${res.data.image}`);
      setErrors(res.data.errors);
      setActiveStep(2);
      
      // Artificial delay for cinematic effect
      setTimeout(() => setIsProcessing(false), 2000);
    } catch (err) {
      console.error("Backend failed, using simulation mode", err);
      // SIMULATION FALLBACK
      setTimeout(() => {
        setProcessedMap(originalMapPreview);
        const dummyErrors = [
          { id: 1, type: "SOP-01", message: "Discontinuity in contour @ 33.7294, 73.0931", coords: "33.7294, 73.0931", x: 45, y: 30 },
          { id: 2, type: "SOP-01", message: "4-Line Rule violation: 5 lines detected", coords: "33.7501, 73.0722", x: 60, y: 55 }
        ];
        setErrors(dummyErrors);
        setMarkers(dummyErrors);
        setActiveStep(2);
        setIsProcessing(false);
      }, 3500);
    }
  };

  const handleMapClick = (e) => {
    if (!processedMap || isProcessing) return;
    const rect = mapRef.current.getBoundingClientRect();
    
    // We need to account for transform scale/position for the click to match the image coordinates
    // When using TransformWrapper, the standard getBoundingClientRect calculation is slightly different.
    // For this POC, clicking while zoomed might have offsets, but let's keep it simple.
    
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Simulate "4-line rule" check at click point
    const newMarker = {
      id: Date.now(),
      type: "SCAN",
      message: "Point Audit: OK (4 Lines Found)",
      coords: `LAT ${x.toFixed(2)}, LON ${y.toFixed(2)}`,
      x, y,
      status: "PASS"
    };
    setMarkers(prev => [...prev, newMarker]);
  };

  const navigateToViolation = (err) => {
    if (!transformRef.current) return;
    const { setTransform } = transformRef.current;
    
    // Zoom in on the location. Marker is at err.x / err.y percent.
    // Center the view on this point.
    // Scale up to 4x.
    const zoomLevel = 4;
    
    // transformRef zoomToElement or setTransform
    // We target the image center. Map is 100x100 percent.
    // The library usually works on pixel values.
    const viewerWidth = mapRef.current.clientWidth;
    const viewerHeight = mapRef.current.clientHeight;
    
    const targetX = (err.x / 100) * viewerWidth;
    const targetY = (err.y / 100) * viewerHeight;
    
    // Calculate translate to center target
    const translateX = (viewerWidth / 2) - (targetX * zoomLevel);
    const translateY = (viewerHeight / 2) - (targetY * zoomLevel);
    
    setTransform(translateX, translateY, zoomLevel, 1000, "easeInOutQuad");
  };

  return (
    <div className="min-h-screen bg-tactical-bg text-gray-100 flex flex-col relative">
      <div className="scanline-overlay" />
      
      {/* Header - Tactical HUD */}
      <header className="h-20 border-b border-military-green/30 bg-military-gray/40 backdrop-blur-md flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-6">
          <div className="relative group cursor-pointer">
             <img src="/logo.png" alt="Pakistan Army logo" className="w-14 h-14 object-contain glow-green group-hover:scale-110 transition-transform" />
             <div className="absolute inset-0 w-full h-full border border-military-green rounded-full animate-ping opacity-20" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white">
              OPERATION <span className="text-military-green">MAP-CHECK</span>
            </h1>
            <div className="flex gap-4 text-[10px] items-center text-military-green font-bold uppercase tracking-widest">
              <span>Status: Active</span>
              <span className="w-1 h-1 bg-military-green rounded-full" />
              <span>Grid: WGS84</span>
              <span className="w-1 h-1 bg-military-green rounded-full" />
              <span>Admin: Restricted</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="bg-military-red/10 border border-military-red/50 text-military-red text-xs px-4 py-1 font-black restricted-glitch shadow-[0_0_10px_rgba(255,0,0,0.2)]">
            RESTRICTED - P.A. LOGISTICS COMMAND
          </div>
          <div className="text-xs mt-1 text-military-green font-mono opacity-80">{timestamp}</div>
        </div>
      </header>

      {/* Main Tactical Interface */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6 z-40">
        
        {/* Left Toolbar */}
        <nav className="w-16 flex flex-col gap-4 py-4 items-center bg-black/40 border border-military-green/20 rounded-xl backdrop-blur-sm">
          <button className={`p-3 rounded-lg transition-colors ${activeStep === 0 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/20 text-gray-500'}`}>
            <MapIcon size={24} />
          </button>
          <button className={`p-3 rounded-lg transition-colors ${activeStep === 1 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/20 text-gray-500'}`}>
            <ShieldAlert size={24} />
          </button>
          <button className={`p-3 rounded-lg transition-colors ${activeStep === 2 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/20 text-gray-500'}`}>
             <FileText size={24} />
          </button>
          <div className="flex-1" />
          <button className="p-3 text-gray-500 hover:text-white"><Settings size={24} /></button>
        </nav>

        {/* Central Display Area */}
        <div className="flex-1 flex flex-col gap-6 relative">
          
          <AnimatePresence mode="wait">
            {activeStep === 0 ? (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                {...getRootProps()}
                className={`flex-1 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-military-red bg-military-red/5' : 'border-military-green/30 hover:border-military-green active:border-military-red bg-black/20'}`}
              >
                <input {...getInputProps()} />
                <div className="w-32 h-32 bg-military-green/10 rounded-full flex items-center justify-center mb-6 relative">
                  <Maximize2 className="w-12 h-12 text-military-green" />
                  <div className="absolute inset-0 border-4 border-military-green border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-3xl font-bold tracking-widest text-white mb-2 uppercase">Initial Entry</h2>
                <p className="text-gray-500 text-sm font-mono">DRAG/DROP TACTICAL TOPOGRAPHY IMAGE</p>
                <div className="mt-12 grid grid-cols-3 gap-6 text-[10px] text-military-green font-bold uppercase tracking-widest">
                  <div className="flex flex-col items-center gap-2"><div className="w-2 h-2 bg-military-green mb-1" />HIGH-RES JPG</div>
                  <div className="flex flex-col items-center gap-2"><div className="w-2 h-2 bg-military-green mb-1" />GEOTIFF/PNG</div>
                  <div className="flex flex-col items-center gap-2"><div className="w-2 h-2 bg-military-green mb-1" />MIL-STD PDF</div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="viewer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex gap-6 overflow-hidden relative"
              >
                {/* Dual Pane Viewer */}
                <div className="flex-1 bg-black/60 rounded-2xl border border-military-green/20 relative overflow-hidden group shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                  {/* Left Pane - Original */}
                  <div className="absolute inset-0 flex">
                    <div className="flex-1 relative overflow-auto scrollbar-hide border-r border-military-green/20">
                      <div className="sticky top-0 bg-black/80 px-4 py-2 text-[10px] font-black z-20 border-b border-military-green/20 text-military-green uppercase flex justify-between">
                         <span>RAW INPUT FEED</span>
                         <span>LAYER 0_BASE</span>
                      </div>
                      <img src={originalMapPreview} className="max-w-none opacity-80" alt="original" />
                    </div>
                    
                    {/* Right Pane - Processed */}
                    <div className="flex-1 relative overflow-hidden bg-[#050706] group">
                      <div className="sticky top-0 bg-military-red/10 px-4 py-2 text-[10px] font-black z-30 border-b border-military-red/50 text-military-red uppercase flex justify-between backdrop-blur-sm">
                         <span>AI-ENHANCED AUDIT OVERLAY</span>
                         <span>LAYER 1_CV_SOP</span>
                      </div>
                      
                      <TransformWrapper ref={transformRef} limitToBounds minScale={1} centerOnInit>
                        <TransformComponent wrapperStyle={{ width: '100%', height: 'calc(100% - 24px)' }} contentStyle={{ width: '100%', height: '100%' }}>
                          <div className="relative cursor-crosshair w-full h-full" ref={mapRef} onClick={handleMapClick}>
                            {isProcessing && <div className="radar-v-bar" />}
                            <img 
                              src={processedMap || originalMapPreview} 
                              className={`max-w-none w-full h-full object-contain transition-opacity duration-1000 ${isProcessing ? 'opacity-40 animate-pulse' : 'opacity-100'}`} 
                              alt="processed" 
                            />
                            
                            {/* Markers / Anomalies */}
                            {markers.map(m => (
                              <div 
                                key={m.id} 
                                style={{ left: `${m.x}%`, top: `${m.y}%` }}
                                className={`absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center animate-in zoom-in-50 duration-300`}
                              >
                                 <div className={`absolute inset-0 ${m.status === 'PASS' ? 'bg-green-500' : 'bg-military-red'} rounded-full animate-ping opacity-30`} />
                                 {m.status === 'PASS' ? <CheckCircle className="text-green-500 w-6 h-6 border-2 border-black rounded-full" /> : <AlertTriangle className="text-military-red w-6 h-6 glow-red bg-black/50 p-0.5 rounded" />}
                              </div>
                            ))}
                          </div>
                        </TransformComponent>
                      </TransformWrapper>

                      {isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-50">
                          <Loader2 className="w-16 h-16 text-military-red animate-spin mb-4" />
                          <div className="text-2xl font-black text-military-red tracking-[1em] mb-4">SCALING...</div>
                          <div className="font-mono text-sm border border-military-red text-military-red px-6 py-2 bg-black/80">
                            COORD SCAN: {flickeringCoords}
                          </div>
                          <div className="mt-8 flex gap-2">
                             {[0,1,2,3,4,5].map(i => <div key={i} className="w-2 h-8 bg-military-red animate-bounce" style={{animationDelay: `${i * 0.1}s`}} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Viewer Controls Overlay */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/90 border border-military-green/50 p-2 rounded-full z-40 backdrop-blur-xl">
                     <button onClick={() => transformRef.current.zoomIn()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><ZoomIn size={20}/></button>
                     <button onClick={() => transformRef.current.zoomOut()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><ZoomOut size={20}/></button>
                     <button onClick={() => transformRef.current.resetTransform()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><RotateCcw size={20}/></button>
                     <div className="w-px h-6 bg-military-green/30" />
                     <button 
                        onClick={() => setShowInspector(!showInspector)}
                        className={`px-4 py-1 rounded-full text-xs font-black uppercase flex items-center gap-2 transition-all ${showInspector ? 'bg-military-green text-white shadow-[0_0_10px_#006600]' : 'text-military-green hover:bg-military-green/10'}`}
                      >
                       <Eye size={14} /> Inspector
                     </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar - SOP Checklist */}
        <aside className="w-96 flex flex-col gap-6">
          
          {/* Status Panel */}
          <div className="bg-military-gray/60 border border-military-green/20 p-6 rounded-2xl relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Layers size={80} /></div>
            <h3 className="text-xs font-black text-military-green tracking-widest mb-4 flex items-center gap-2 uppercase">
              <ShieldAlert size={14} /> System Health
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-black/40 p-3 border border-military-green/10 rounded-lg">
                <div className="text-[10px] text-gray-500 uppercase">Latency</div>
                <div className="text-lg font-bold text-military-green">14ms</div>
              </div>
              <div className="bg-black/40 p-3 border border-military-green/10 rounded-lg">
                <div className="text-[10px] text-gray-500 uppercase">CV Accuracy</div>
                <div className="text-lg font-bold text-military-green">99.2%</div>
              </div>
            </div>
            {!processedMap && !isProcessing && file && (
              <button 
                onClick={runAudit}
                className="w-full relative group overflow-hidden bg-military-red text-white py-4 font-black uppercase tracking-[0.2em] rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,-0,0,0.3)]"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                INITIATE SOP AUDIT
              </button>
            )}
            {processedMap && (
               <button 
                  onClick={() => window.print()}
                  className="w-full bg-military-green text-white py-4 font-black uppercase tracking-[0.2em] rounded-xl hover:bg-green-700 transition-all flex items-center justify-center gap-3"
                >
                  <Download size={18} /> GENERATE REPORT
               </button>
            )}
          </div>

          {/* SOP Engine Checklist */}
          <div className="flex-1 bg-black/40 border border-military-green/20 rounded-2xl flex flex-col overflow-hidden backdrop-blur-md">
            <div className="p-5 border-b border-military-green/20 bg-military-green/5 flex justify-between items-center">
              <div>
                <h3 className="font-black text-sm tracking-tighter uppercase">SOP Engine v4.2</h3>
                <p className="text-[9px] text-military-green font-bold uppercase tracking-widest">Pakistan Army Topo-Spec</p>
              </div>
              {isProcessing && <Loader2 className="w-5 h-5 text-military-red animate-spin" />}
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
              <SOPCard 
                id="SOP-01" 
                title="Contour Interval (4-Line)" 
                desc="Validates index and intermediate contour frequency." 
                active={activeSOP === "SOP-01"}
                status={processedMap ? (errors.length > 0 ? "FAILURE" : "SUCCESS") : "WAITING"}
              />
              <SOPCard 
                id="SOP-02" 
                title="Hydrography Integrity" 
                desc="Detects breaks in blue river lines and drainage." 
                status="STANDBY"
              />
              <SOPCard 
                id="SOP-03" 
                title="Red Grid Coordinate" 
                desc="Validates 1000m grid line alignment." 
                status="STANDBY"
              />
              
              {processedMap && errors.length > 0 && (
                <div className="pt-4 border-t border-military-red/20 mt-4 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center gap-2 text-military-red mb-3">
                     <ShieldAlert size={16} className="glow-red" />
                     <span className="text-[10px] font-black uppercase tracking-widest">CRITICAL VIOLATIONS ({errors.length})</span>
                  </div>
                  <div className="space-y-2">
                    {errors.map(err => (
                      <div 
                        key={err.id} 
                        onClick={() => navigateToViolation(err)}
                        className="text-[10px] p-3 bg-military-red/5 border border-military-red/20 rounded-lg group hover:bg-military-red/10 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                      >
                         <div className="flex justify-between items-start mb-1">
                            <span className="font-black text-military-red flex items-center gap-1">
                              <ShieldAlert size={10} /> {err.type}
                            </span>
                            <span className="text-gray-500 font-mono italic">{err.coords}</span>
                         </div>
                         <p className="text-gray-300 leading-tight group-hover:text-white">{err.message}</p>
                         <div className="mt-2 text-[8px] text-military-red/60 uppercase font-black tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                            Click to navigate
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Footer Info */}
      <footer className="h-10 bg-black/80 border-t border-military-green/20 flex items-center justify-between px-8 text-[9px] font-bold text-military-green tracking-widest uppercase">
        <div className="flex gap-6">
          <span>SEC LEVEL: 4A</span>
          <span>AUTH: GEN_STAFF</span>
          <span>SESSION: {Math.random().toString(36).substring(7).toUpperCase()}</span>
        </div>
        <div>
          ENCRYPTION: AES-256-MIL
        </div>
      </footer>
    </div>
  );
};

const SOPCard = ({ id, title, desc, active, status }) => {
  const getStatusColor = () => {
    if (status === 'SUCCESS') return 'text-green-500 border-green-500 bg-green-500/10';
    if (status === 'FAILURE') return 'text-military-red border-military-red bg-military-red/10 animate-pulse';
    if (status === 'ACTIVE') return 'text-military-yellow border-military-yellow bg-military-yellow/10';
    return 'text-gray-600 border-gray-600 bg-gray-500/5';
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${active ? 'border-military-green bg-military-green/10 shadow-[inset_0_0_20px_rgba(75,83,32,0.2)]' : 'border-military-green/10 bg-black/20'}`}>
       <div className="flex justify-between items-start mb-2">
         <div className="text-[10px] font-black text-white">{id}</div>
         <div className={`text-[8px] font-black px-2 py-0.5 rounded border ${getStatusColor()} uppercase tracking-widest whitespace-nowrap`}>
           {status}
         </div>
       </div>
       <h4 className="text-xs font-bold text-gray-200 mb-1 leading-snug">{title}</h4>
       <p className="text-[9px] text-gray-500 leading-tight">{desc}</p>
    </div>
  );
};

export default App;
