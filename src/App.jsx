import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Download, AlertTriangle, CheckCircle, Crosshair, 
  Map as MapIcon, Loader2, Info, Eye, Layers, 
  ShieldAlert, Settings, FileText, ChevronRight,
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Lock, User,
  Power, Monitor, Activity, Terminal as TerminalIcon
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const AUTH_ID = "HQ_ADMIN";
const AUTH_PASS = "MA-786-PAK-26";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [isUnveiling, setIsUnveiling] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'battle');
  
  // Tactical States
  const [timestamp, setTimestamp] = useState(new Date().toISOString().substring(0, 19));
  const [file, setFile] = useState(null);
  const [originalMapPreview, setOriginalMapPreview] = useState(null);
  const [processedMap, setProcessedMap] = useState(null);
  const [continuationLayer, setContinuationLayer] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [showInference, setShowInference] = useState(true);
  const [activeAccordion, setActiveAccordion] = useState('SOP-01');
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [flickerCode, setFlickerCode] = useState('');

  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const transformRef = useRef(null);

  // Sync session and theme
  useEffect(() => { localStorage.setItem('isLoggedIn', isLoggedIn); }, [isLoggedIn]);
  useEffect(() => { 
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // HUD Update Loop (Flicker code)
  useEffect(() => {
    const codes = ["SCANNING... CONTOUR_INTEGRITY_CHECK [OK]", "MAPPING_TEXTURE... (BROWN_SEGMENT_5.4)", "ELEVATION_EXTRAPOLATION_INIT...", "SKELETON_PASS_COMPLETED.", "GEOMETRIC_INFERENCE_ENGINE_V5_STABLE"];
    const interval = setInterval(() => {
      setTimestamp(new Date().toISOString().substring(11, 19));
      if (isProcessing) {
        setFlickerCode(codes[Math.floor(Math.random() * codes.length)]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // --- HARDWARE-ACCELERATED LERP RENDERER (120Hz Smooth) ---
  const [currentScale, setCurrentScale] = useState(1);
  const targetScaleRef = useRef(1);
  const renderScaleRef = useRef(1);

  const drawTacticalLayer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapRef.current) return;
    const ctx = canvas.getContext('2d');
    
    // Auto-match map image dimensions
    const imgElement = mapRef.current.querySelector('img');
    if (!imgElement) return;
    
    canvas.width = imgElement.clientWidth;
    canvas.height = imgElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = renderScaleRef.current;
    
    markers.forEach((m) => {
      const px = (m.x / 100) * canvas.width;
      const py = (m.y / 100) * canvas.height;

      // MISSION_FOCUS: Only render critical SOP Violations (PDP Core)
      if (m.type === 'DENSITY_PROBE_FAIL' || m.status === 'CRITICAL') {
        const size = 60 / scale;
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = 2 / scale;
        ctx.rect(px, py, size, size);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(230, 57, 70, 0.05)';
        ctx.fill();

        if (scale > 0.4) {
          ctx.fillStyle = '#E63946';
          ctx.font = `500 ${Math.max(10, 12/scale)}px JetBrains Mono`;
          ctx.fillText("! PDP_ANOMALY", px, py - 8);
        }
      }
    });
  }, [markers]);

  // High-performance LERP Loop
  useEffect(() => {
    let frame;
    const loop = () => {
      const lerpFactor = 0.15; // Smoothness coefficient
      const diff = targetScaleRef.current - renderScaleRef.current;
      
      if (Math.abs(diff) > 0.001) {
        renderScaleRef.current += diff * lerpFactor;
        drawTacticalLayer();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [drawTacticalLayer]);

  const handleTransform = (e) => {
    targetScaleRef.current = e.state.scale;
    setCurrentScale(e.state.scale);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      const selected = files[0];
      if (selected) {
        setFile(selected);
        const reader = new FileReader();
        reader.onload = (e) => {
          setOriginalMapPreview(e.target.result);
          setProcessedMap(null);
          setMarkers([]);
        };
        reader.readAsDataURL(selected);
      }
    },
    noClick: false,
    multiple: false
  });

  const runAnalysis = async () => {
    if (!file) return;
    setIsProcessing(true);
    setMarkers([]); 
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await axios.post('/api/audit', fd);
      setProcessedMap(`data:image/jpeg;base64,${res.data.image}`);
      setContinuationLayer(res.data.layer);
      setErrors(res.data.errors);
      // Asynchronous coordinate mapping
      setTimeout(() => setMarkers(res.data.errors), 100);
    } catch(e) {
      alert(`TACTICAL SCAN ERROR: ${e.message}`);
    } finally { setIsProcessing(false); }
  };

  const resetMap = () => {
    setFile(null); setOriginalMapPreview(null); setProcessedMap(null); 
    setErrors([]); setMarkers([]); setContinuationLayer(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0,0, canvas.width, canvas.height);
  };

  // Login Sequence (The Wipe-Clean)
  const handleAuthSuccess = () => {
    setIsUnveiling(true);
    setTimeout(() => {
      setIsLoggedIn(true);
      setIsUnveiling(false);
    }, 1200); // 1.2s "Wipe-Clean" duration as requested
  };

  return (
    <>
      <AnimatePresence>
        {(!isLoggedIn || isUnveiling) && (
          <LoginOverlay 
            isUnveiling={isUnveiling} 
            onSuccess={handleAuthSuccess} 
          />
        )}
      </AnimatePresence>

      <div className={`fixed inset-0 select-none bg-near-black ${!isLoggedIn ? 'overflow-hidden' : ''}`} style={{ zIndex: 1 }}>
        {/* 1. MAP CANVAS */}
        <div className="absolute inset-0 bg-black overflow-hidden digital-grid">
          <TransformWrapper 
            ref={transformRef} 
            centerOnInit 
            minScale={0.05} 
            maxScale={12} 
            onTransformed={handleTransform}
            onZoomStop={handleTransform}
          >
            <TransformComponent wrapperStyle={{ width: '100vw', height: '100vh' }}>
              <div className="relative flex items-center justify-center min-w-screen min-h-screen" ref={mapRef}>
                <div className="relative overflow-hidden shadow-[0_0_80px_rgba(3,7,1,1)] border border-tactical-primary/30 bg-black group">
                  {isProcessing && <div className="scanning-lattice z-[70]" />}
                  
                  <div className="relative">
                    {processedMap ? (
                      <div className="relative">
                        <img src={processedMap} className="block max-w-[95vw] max-h-[90vh] object-contain" alt="map" />
                        {continuationLayer && showInference && (
                          <img 
                            src={`data:image/png;base64,${continuationLayer}`} 
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-100 mix-blend-screen z-[55]" 
                            style={{ filter: 'drop-shadow(0 0 5px rgba(57, 255, 20, 0.4))' }}
                            alt="pdp-hallucination-layer"
                          />
                        )}
                        {/* Hardware-Accelerated High-Frequency HUD Overlay */}
                        <canvas 
                          ref={canvasRef}
                          className="absolute inset-0 w-full h-full pointer-events-none z-[60]"
                        />
                      </div>
                    ) : originalMapPreview ? (
                      <div className="relative">
                        <img src={originalMapPreview} className={`block max-w-[95vw] max-h-[90vh] object-contain transition-opacity ${isProcessing ? 'opacity-30 blur-sm' : 'opacity-100'}`} alt="preview" />
                        {isProcessing && (
                           <div className="absolute top-10 left-10 toxic-neon text-[10px] bg-near-black/90 p-4 border border-toxic-neon/30 animate-pulse z-[80] glass-module shadow-[0_0_30px_rgba(57,255,20,0.1)]">
                             <div className="tactical-mono">{flickerCode || 'PDP_SCAN_ACTIVE...'}</div>
                             <div className="mt-2 text-[8px] secondary-text tracking-widest">THREAD::PDP_PROBE_V2</div>
                           </div>
                        )}
                      </div>
                    ) : (
                        <motion.div 
                          key="upload" {...getRootProps()}
                          className={`w-[650px] h-[450px] border-2 border-dashed glass-module flex flex-col items-center justify-center cursor-pointer hover:border-toxic-neon ${isDragActive ? 'border-toxic-neon bg-toxic-neon/5' : 'border-tactical-primary/40'}`}
                        >
                          <input {...getInputProps()} />
                          <div className="w-24 h-24 bg-tactical-primary/10 rounded-full flex items-center justify-center mb-8 toxic-neon shadow-[inset_0_0_20px_rgba(75,83,32,0.2)]">
                            <MapIcon className="w-12 h-12" />
                          </div>
                          <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 leading-none italic">Initialize Tactical Cockpit</h2>
                          <p className="text-[10px] tactical-mono secondary-text uppercase mb-10 tracking-[0.2em]">Drop mapping datasets (PDF/TIFF/PNG)</p>
                          <button className="bg-toxic-neon/10 hover:bg-toxic-neon/20 text-toxic-neon px-12 py-5 rounded-sm font-black text-[10px] tracking-[0.5em] transition-all border border-toxic-neon/20 shadow-xl active-glow uppercase">INIT_MISSION_PROTOCOL</button>
                        </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>

        {/* 2. TOP HUD */}
        <div className="absolute top-8 inset-x-8 flex justify-between pointer-events-none z-[200]">
          <div className="flex items-center gap-6 pointer-events-auto">
            <div className="glass-module p-1 px-4 border-toxic-neon/30 border flex items-center gap-3 active-glow">
               <div className="w-2 h-2 bg-toxic-neon rounded-full" />
               <span className="text-[10px] font-black toxic-neon tracking-[0.2em] tactical-mono italic uppercase">AI-PLUS QUANTUM</span>
            </div>
            
            <div className="flex flex-col">
              <h1 className="text-3xl font-semibold header-title italic leading-none text-white drop-shadow-lg">
                OPERATION <span className="toxic-neon">MAP-SCAN</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-5 pointer-events-auto">
            {file && (
              <div className="glass-module px-6 py-4 text-[10px] font-black uppercase flex items-center gap-3 toxic-neon cursor-pointer hover:bg-toxic-neon/5 border border-toxic-neon/10" onClick={resetMap}>
                <RotateCcw size={14} /> Wipe_Cache
              </div>
            )}
            <div className="glass-module px-8 py-3 flex flex-col items-end border-r-4 border-r-toxic-neon active-glow">
              <div className="text-[10px] font-black toxic-neon tracking-[0.3em] uppercase italic opacity-70">Battle_Mode_Active</div>
              <div className="text-[18px] tactical-mono toxic-neon mt-1 leading-none">{timestamp}</div>
            </div>
            <button onClick={() => setIsLoggedIn(false)} className="glass-module p-5 bg-rose-900/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-xl"><Power size={24} /></button>
          </div>
        </div>

        {/* 3. MODULAR UTILITY BAR */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 w-20 pointer-events-none z-[200]">
          <div className="flex flex-col items-center py-6 gap-6 pointer-events-auto">
             <ToolbarIcon icon={<Activity size={24}/>} active />
             <ToolbarIcon icon={<Eye size={24}/>} />
             <ToolbarIcon icon={<TerminalIcon size={24}/>} />
             <ToolbarIcon icon={<Layers size={24}/>} />
             <div className="h-20 w-px bg-white/5 my-4" />
             <ToolbarIcon icon={<Settings size={24}/>} />
          </div>
        </div>

        {/* 4. TACTICAL SOP CONSOLE */}
        <div className={`absolute right-8 top-52 bottom-12 transition-all duration-700 ${isRightPanelCollapsed ? 'w-16' : 'w-96'} pointer-events-none z-[200]`}>
          <GlassModule className="h-full pointer-events-auto flex flex-col overflow-hidden shadow-[-10px_0_40px_rgba(0,0,0,0.2)] border-r border-white/5">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/2">
               {!isRightPanelCollapsed && <span className="text-[12px] font-black tracking-[0.3em] toxic-neon italic uppercase flex items-center gap-3"><ShieldAlert size={16}/> PDP_ENGINE_BETA</span>}
               <button onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)} className="p-2 hover:bg-toxic-neon/5 rounded-lg transition-all">
                  <ChevronRight size={24} className={`transition-transform duration-700 ${isRightPanelCollapsed ? 'rotate-180' : ''}`} />
               </button>
            </div>

            {!isRightPanelCollapsed && (
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                 {file && !processedMap && (
                   <button onClick={runAnalysis} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-5 mb-6 text-[12px] tracking-[0.5em] uppercase rounded-sm shadow-[0_0_30px_rgba(230,57,70,0.2)] transition-all">
                      {isProcessing ? 'CALIBRATING_PROBE...' : 'INIT_PDP_AUDIT'}
                   </button>
                 )}

                 <SOPAccordionItem 
                   id="SOP-01" label="Elevation_Density_Probe" 
                   status={isProcessing ? "SAMPLING..." : (processedMap ? "PROBE_SYNCED" : "READY")} 
                   confidence={85}
                   errors={markers.filter(e => e.type === 'DENSITY_PROBE_FAIL').length} 
                   isOpen={activeAccordion === 'SOP-01'} onToggle={() => setActiveAccordion('SOP-01')}
                 />
                 <SOPAccordionItem 
                   id="SOP-02" label="Perpendicular_Scan" 
                   status={isProcessing ? "PROCESSING..." : (processedMap ? "SCAN_DONE" : "STANDBY")} 
                   confidence={92}
                   errors={markers.filter(e => e.type === 'INTEGRITY_ERROR').length}
                   isOpen={activeAccordion === 'SOP-02'} onToggle={() => setActiveAccordion('SOP-02')}
                 />
                 <div className="flex-1" />
                 
                 {markers.length > 0 && (
                   <div className="mt-6 border-t border-white/5 pt-6 flex flex-col gap-3">
                      <div className="text-[11px] font-black toxic-neon mb-4 uppercase italic tracking-[0.3em] flex justify-between border-b border-toxic-neon/10 pb-2">PDP_ANOMALIES ({markers.length}) <Info size={14}/></div>
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {markers.map(err => (
                           <div key={err.id} onClick={() => {
                              const vW = mapRef.current.clientWidth;
                              const vH = mapRef.current.clientHeight;
                              const zl = 4;
                              transformRef.current.setTransform((vW/2) - (err.x/100*vW*zl), (vH/2) - (err.y/100*vH*zl), zl, 1000);
                            }} className={`p-4 glass-module border rounded-sm text-[10px] tactical-mono cursor-pointer transition-all ${err.type === 'DENSITY_PROBE_FAIL' ? 'border-toxic-neon/20 bg-toxic-neon/2 hover:bg-toxic-neon/5' : 'border-rose-500/20 bg-rose-500/2 hover:bg-rose-500/5'}`}>
                              <div className="flex justify-between items-center mb-2">
                                 <span className={err.type === 'DENSITY_PROBE_FAIL' ? 'toxic-neon font-bold' : 'text-rose-500 font-bold'}>[{err.type}]</span>
                                 <span className={`px-2 py-0.5 rounded-full text-[8px] ${err.status === 'RESOLVED' ? 'bg-toxic-neon/10 toxic-neon' : 'bg-rose-500/10 text-rose-500'}`}>{err.status}</span>
                              </div>
                              <p className="secondary-text leading-relaxed uppercase">{err.message}</p>
                           </div>
                        ))}
                      </div>
                   </div>
                 )}
              </div>
            )}

            {file && processedMap && !isRightPanelCollapsed && (
               <div className="p-6 border-t border-white/5 bg-white/2">
                  <button onClick={() => alert("Decrypting Mission Data...")} className="w-full bg-toxic-neon text-near-black font-black py-5 rounded-sm hover:opacity-90 transition-all flex items-center justify-center gap-4 text-[12px] tracking-[0.2em] shadow-2xl">
                     <Download size={18}/> EXFIL_AUDIT_REPORT
                  </button>
               </div>
            )}
          </GlassModule>
        </div>

        {/* 5. TACTICAL HUD FOOTER */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-black toxic-neon uppercase flex items-center gap-8 bg-near-black/90 px-12 py-3 rounded-full border border-white/5 backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto">
           <div className="flex items-center gap-3">
             <span className="secondary-text tracking-widest italic uppercase">Zoom:</span> 
             <span className="w-12 text-center text-white tactical-mono">{currentScale.toFixed(2)}x</span>
           </div>
           <div className="w-px h-4 bg-white/10" />
           <button onClick={() => setShowInference(!showInference)} className={`flex items-center gap-2 transition-all hover:scale-105 ${showInference ? 'toxic-neon font-black' : 'secondary-text opacity-50'}`}>
              <Layers size={14}/> PDP_OVERLAY::{showInference ? 'ACTIVE' : 'OFF'}
           </button>
           <div className="w-px h-4 bg-white/10" />
           <div className="flex items-center gap-2 secondary-text uppercase tracking-tighter">
              <Monitor size={14}/> GPU_LERP_RENDERER::ENABLED
           </div>
        </div>
      </div>
    </>
  );
}

const LoginOverlay = ({ isUnveiling, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email === "admin@pdp.gov" && pass === "MA-786-PAK-26") {
      onSuccess();
    } else {
      alert("AUTH_FAIL: INVALID_CREDENTIALS");
    }
  };

  return (
    <div className={`military-frosted-glass ${isUnveiling ? 'wipe-clean' : ''}`}>
      <div className="noise-overlay" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.8 } }}
        className="login-card"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-toxic-neon/10 rounded-sm flex items-center justify-center mb-6 border border-toxic-neon/20">
             <Lock className="toxic-neon" size={24} />
          </div>
          <h1 className="text-[14px] font-black tracking-[0.4em] toxic-neon uppercase tactical-mono">Secure_Entry_V4</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] tactical-mono secondary-text uppercase tracking-widest ml-1">Credential::Email</label>
            <input 
              type="email" 
              placeholder="operator@pdp.gov" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="login-input"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[9px] tactical-mono secondary-text uppercase tracking-widest ml-1">Credential::Secure_Pass</label>
            <input 
              type="password" 
              placeholder="••••••••••••" 
              value={pass} 
              onChange={e => setPass(e.target.value)}
              className="login-input"
              required
            />
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-4 h-4 border border-white/20 rounded-sm flex items-center justify-center transition-colors group-hover:border-toxic-neon/50 ${remember ? 'bg-toxic-neon border-toxic-neon' : 'bg-white/5'}`}>
                {remember && <CheckCircle size={10} className="text-near-black" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={remember} 
                onChange={() => setRemember(!remember)} 
              />
              <span className="text-[9px] tactical-mono secondary-text uppercase tracking-widest">Persistence_Mode</span>
            </label>
          </div>

          <button type="submit" className="login-button mt-4 shadow-[0_0_30px_rgba(57,255,20,0.2)]">
            INIT_MISSION_PROTOCOL
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5 text-[7px] secondary-text tracking-[0.2em] tactical-mono leading-relaxed uppercase text-center">
          RESTRICTED PROTOCOL. AUTHENTICATION REQUIRED FOR TOPOGRAPHICAL ACCESS.
        </div>
      </motion.div>
    </div>
  );
};

const GlassModule = ({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`glass-module ${className}`}>
    {children}
  </div>
);

const ToolbarIcon = ({ icon, active }) => (
  <button className={`relative w-14 h-14 rounded-2xl glass-module flex items-center justify-center transition-all group ${active ? 'active-glow toxic-neon' : 'text-white/20 hover:text-white/40 hover:border-white/10'}`}>
    {active && <div className="absolute left-0 w-0.5 h-6 bg-toxic-neon shadow-[0_0_15px_rgba(57,255,20,1)]" />}
    {icon}
  </button>
);

const SOPAccordionItem = ({ id, label, status, confidence = 0, errors = 0, isOpen, onToggle }) => (
  <div className={`glass-module transition-all ${isOpen ? 'border-toxic-neon/40 shadow-[0_0_20px_rgba(57,255,20,0.05)]' : 'border-white/5 hover:border-white/10'}`}>
    <div onClick={onToggle} className="p-4 flex justify-between items-center cursor-pointer">
      <div className="flex flex-col">
        <span className="text-[8px] tactical-mono opacity-40 uppercase tracking-widest">{id}</span>
        <span className="text-[11px] font-black uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div className="flex items-center gap-3">
         {errors > 0 && <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm active-glow">{errors}</span>}
         <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90 text-toxic-neon' : 'opacity-20'}`} />
      </div>
    </div>
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-white/5 space-y-4 pt-4">
             <div className="space-y-1">
                <div className="flex justify-between text-[9px] tactical-mono mb-1">
                  <span className="secondary-text uppercase">Probe_Confidence:</span>
                  <span className="toxic-neon font-black">{confidence}%</span>
                </div>
                <div className="segmented-progress">
                   {[...Array(10)].map((_, i) => (
                     <div key={i} className={`progress-segment ${i < confidence / 10 ? 'active' : ''}`} />
                   ))}
                </div>
             </div>
             <div className="text-[9px] tactical-mono leading-relaxed space-y-2">
                <div className="flex justify-between">
                  <span className="secondary-text uppercase">status:</span> 
                  <span className="toxic-neon uppercase">{status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="secondary-text uppercase">isolation:</span> 
                  <span className="text-emerald-400 font-bold uppercase tracking-tighter">MIL-STD-1913</span>
                </div>
             </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default App;
