import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Download, AlertTriangle, CheckCircle, Crosshair, 
  Map as MapIcon, Loader2, Info, Eye, Layers, 
  ShieldAlert, Settings, FileText, ChevronRight,
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Lock, User,
  Power, Moon, Sun, Monitor, Activity, Terminal as TerminalIcon
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const AUTH_ID = "HQ_ADMIN";
const AUTH_PASS = "MA-786-PAK-26";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
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

  // --- HARDWARE-ACCELERATED CANVAS RENDERER (60FPS) ---
  const drawTacticalLayer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapRef.current) return;
    const ctx = canvas.getContext('2d');
    const transform = transformRef.current.instance.transformState;
    const scale = transform?.scale || 1;
    
    // Auto-match map image dimensions
    const imgElement = mapRef.current.querySelector('img');
    if (!imgElement) return;
    
    canvas.width = imgElement.clientWidth;
    canvas.height = imgElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // LOD (Level of Detail) Threshold
    const isZoomedOut = scale < 0.8;
    const clusterRadius = 30 / scale;
    const drawnMarkers = new Set();

    markers.forEach((m, idx) => {
      if (drawnMarkers.has(idx)) return;
      const px = (m.x / 100) * canvas.width;
      const py = (m.y / 100) * canvas.height;

      if (isZoomedOut) {
        let clusterCount = 1;
        markers.forEach((m2, idx2) => {
          if (idx === idx2 || drawnMarkers.has(idx2)) return;
          const dist = Math.sqrt(Math.pow((m.x - m2.x), 2) + Math.pow((m.y - m2.y), 2));
          if (dist < clusterRadius) { clusterCount++; drawnMarkers.add(idx2); }
        });
        ctx.beginPath();
        ctx.arc(px, py, 6 + (clusterCount * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = m.type === 'INPAINTED' ? 'rgba(57, 255, 20, 0.4)' : 'rgba(230, 57, 70, 0.4)';
        ctx.fill();
        ctx.strokeStyle = m.type === 'INPAINTED' ? 'rgba(57, 255, 20, 0.8)' : 'rgba(230, 57, 70, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        const size = m.type === 'INPAINTED' ? 4 : 8;
        ctx.beginPath();
        if (m.type === 'INPAINTED') {
          ctx.arc(px, py, size / scale, 0, Math.PI * 2);
          ctx.fillStyle = '#39FF14';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#39FF14';
        } else {
          ctx.rect(px - (size/2)/scale, py - (size/2)/scale, size/scale, size/scale);
          ctx.strokeStyle = '#E63946';
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
          ctx.fillStyle = 'rgba(230, 57, 70, 0.2)';
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
  }, [markers]);

  useEffect(() => {
    if (markers.length > 0) {
      const frame = requestAnimationFrame(drawTacticalLayer);
      return () => cancelAnimationFrame(frame);
    }
  }, [markers, drawTacticalLayer]);

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

  if (!isLoggedIn) return <LoginScreen setAuth={setIsLoggedIn} />;

  return (
    <div className={`fixed inset-0 select-none`}>
      <div className="scanline-hud" />
      
      {/* 1. MAP CANVAS (V3.0 Hardware-Accelerated View) */}
      <div className="absolute inset-0 bg-black overflow-hidden digital-grid">
        <TransformWrapper 
          ref={transformRef} 
          centerOnInit 
          minScale={0.05} 
          maxScale={12} 
          onTransformed={drawTacticalLayer}
          onZoomStop={drawTacticalLayer}
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
                           className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-90 mix-blend-screen z-[55]" 
                           alt="inference"
                         />
                       )}
                       {/* Hardware-Accelerated Overlay */}
                       <canvas 
                         ref={canvasRef}
                         className="absolute inset-0 w-full h-full pointer-events-none z-[60]"
                       />
                     </div>
                   ) : originalMapPreview ? (
                     <div className="relative">
                       <img src={originalMapPreview} className={`block max-w-[95vw] max-h-[90vh] object-contain transition-opacity ${isProcessing ? 'opacity-30 blur-sm' : 'opacity-100'}`} alt="preview" />
                       {isProcessing && (
                          <div className="absolute top-10 left-10 laser-text text-[10px] bg-near-black/90 p-4 border border-laser-green/30 animate-pulse z-[80] glass-module shadow-[0_0_30px_rgba(57,255,20,0.1)]">
                            {flickerCode || 'SYSTEM_SCANING...'}
                            <div className="mt-2 text-[8px] opacity-40">THREAD::WORKER_ACTIVE</div>
                          </div>
                       )}
                     </div>
                   ) : (
                      <motion.div 
                        key="upload" {...getRootProps()}
                        className={`w-[650px] h-[450px] border-2 border-dashed glass-module flex flex-col items-center justify-center cursor-pointer hover:border-laser-green ${isDragActive ? 'border-laser-green bg-laser-green/5' : 'border-tactical-primary/40'}`}
                      >
                        <input {...getInputProps()} />
                        <div className="w-24 h-24 bg-tactical-primary/10 rounded-full flex items-center justify-center mb-8 laser-text shadow-[inset_0_0_20px_rgba(75,83,32,0.2)]">
                          <MapIcon className="w-12 h-12" />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 leading-none italic">Initialize Tactical Cockpit</h2>
                        <p className="text-[10px] font-mono opacity-40 uppercase mb-10 tracking-[0.2em]">Drop mapping datasets (PDF/TIFF/PNG)</p>
                        <button className="bg-tactical-primary/80 hover:bg-tactical-primary text-white px-12 py-5 rounded-sm font-black text-[10px] tracking-[0.5em] transition-all border border-tactical-primary/50 shadow-xl">INIT_MISSION_PROTOCOL</button>
                      </motion.div>
                   )}
                 </div>
               </div>
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* 2. TOP HUD (Priority Z-Layer) */}
      <div className="absolute top-8 inset-x-8 flex justify-between pointer-events-none z-[200]">
        <GlassModule className="px-8 py-5 flex items-center gap-8 pointer-events-auto border-l-4 border-l-laser-green shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="relative">
             <img src="/logo.png" className="w-14 h-14 object-contain mix-blend-screen opacity-100" alt="logo" />
             <div className="absolute inset-0 border-2 border-laser-green rounded-full animate-ping opacity-10" />
          </div>
          <div className="flex flex-col border-l border-tactical-primary/30 pl-8">
            <h1 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Operation <span className="laser-text">Map-Scan</span> <span className="text-[10px] bg-laser-green text-near-black px-2 py-0.5 ml-2 font-bold not-italic">V3.0.1_BETA</span></h1>
             <div className="flex gap-6 text-[10px] font-mono tracking-widest opacity-60 items-center mt-2 uppercase">
                <span className="flex items-center gap-2 font-black text-laser-green"><div className="w-1.5 h-1.5 bg-laser-green rounded-full pulse" /> {AUTH_ID}::LOGGED_IN</span>
                <span className="w-px h-3 bg-tactical-primary/40" />
                <span className="flex items-center gap-2"><Maximize2 size={10}/> Sector_Alpha_9</span>
             </div>
          </div>
        </GlassModule>

        <div className="flex items-center gap-5 pointer-events-auto">
          {file && (
            <GlassModule className="px-6 py-4 text-[10px] font-black uppercase flex items-center gap-3 laser-text cursor-pointer hover:bg-laser-green/10 border border-laser-green/20" onClick={resetMap}>
              <RotateCcw size={16} /> Wipe_Cache
            </GlassModule>
          )}
          <GlassModule className="px-8 py-3 flex flex-col items-end border-r-4 border-r-rose-700 bg-rose-950/10">
            <div className="text-[10px] font-black text-rose-500 tracking-[0.3em] uppercase italic">Restricted_Access</div>
            <div className="text-[14px] font-mono laser-text mt-1">{timestamp}_GMT</div>
          </GlassModule>
          <button onClick={() => setIsLoggedIn(false)} className="glass-module p-5 bg-rose-900/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-xl"><Power size={24} /></button>
        </div>
      </div>

      {/* 3. MODULAR UTILITY BAR (Left) */}
      <div className="absolute left-8 top-52 bottom-12 w-24 pointer-events-none z-[200]">
        <GlassModule className="h-full flex flex-col items-center py-10 gap-12 overflow-y-auto w-full pointer-events-auto shadow-[10px_0_40px_rgba(0,0,0,0.5)]">
           <ToolbarIcon icon={<Activity size={28}/>} active />
           <ToolbarIcon icon={<Eye size={28}/>} />
           <ToolbarIcon icon={<TerminalIcon size={28}/>} />
           <ToolbarIcon icon={<Layers size={28}/>} />
           <div className="flex-1" />
           <ToolbarIcon icon={<Settings size={28}/>} />
        </GlassModule>
      </div>

      {/* 4. TACTICAL SOP CONSOLE (Right) */}
      <div className={`absolute right-8 top-52 bottom-12 transition-all duration-700 ${isRightPanelCollapsed ? 'w-16' : 'w-96'} pointer-events-none z-[200]`}>
        <GlassModule className="h-full pointer-events-auto flex flex-col overflow-hidden shadow-[-10px_0_40px_rgba(0,0,0,0.5)] border-r-4 border-r-tactical-primary">
          <div className="p-6 border-b border-tactical-primary/20 flex justify-between items-center bg-tactical-primary/10">
             {!isRightPanelCollapsed && <span className="text-[12px] font-black tracking-[0.3em] laser-text italic uppercase flex items-center gap-3"><ShieldAlert size={16}/> Cockpit_Protocols</span>}
             <button onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)} className="p-2 hover:bg-laser-green/10 rounded-lg transition-all">
                <ChevronRight size={24} className={`transition-transform duration-700 ${isRightPanelCollapsed ? 'rotate-180' : ''}`} />
             </button>
          </div>

          {!isRightPanelCollapsed && (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
               {file && !processedMap && (
                 <button onClick={runAnalysis} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-5 mb-6 text-[12px] tracking-[0.5em] uppercase rounded-sm shadow-[0_0_30px_rgba(230,57,70,0.3)] transition-all animate-pulse">
                    {isProcessing ? 'SCANNING_NEURAL_NET...' : 'ENGAGE_COGNITIVE_SCAN'}
                 </button>
               )}

               <SOPAccordionItem 
                 id="SOP-01" label="Interval_Inpaint_V5" 
                 status={isProcessing ? "SCANNING..." : (processedMap ? "SYNERGY_SYNCED" : "OPTIMAL_CORES")} 
                 errors={markers.filter(e => e.type === 'INPAINTED').length} 
                 isOpen={activeAccordion === 'SOP-01'} onToggle={() => setActiveAccordion('SOP-01')}
               />
               <SOPAccordionItem 
                 id="SOP-02" label="Context_Integrity" 
                 status={isProcessing ? "PROCESSING..." : (processedMap ? "ISOLATION_DONE" : "STANDBY")} 
                 errors={markers.filter(e => e.type === 'INTEGRITY_ERROR').length}
                 isOpen={activeAccordion === 'SOP-02'} onToggle={() => setActiveAccordion('SOP-02')}
               />
               <div className="flex-1" />
               
               {markers.length > 0 && (
                 <div className="mt-6 border-t border-tactical-primary/30 pt-6 flex flex-col gap-3">
                    <div className="text-[11px] font-black laser-text mb-4 uppercase italic tracking-[0.3em] flex justify-between border-b border-laser-green/20 pb-2">Mission_Anomalies ({markers.length}) <Info size={14}/></div>
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                      {markers.map(err => {
                         const zl = 4;
                         return (
                         <div key={err.id} onClick={() => {
                            const vW = mapRef.current.clientWidth;
                            const vH = mapRef.current.clientHeight;
                            transformRef.current.setTransform((vW/2) - (err.x/100*vW*zl), (vH/2) - (err.y/100*vH*zl), zl, 1000);
                         }} className={`p-3 border rounded-sm text-[10px] font-mono cursor-pointer transition-all backdrop-blur-md ${err.type === 'INPAINTED' ? 'border-laser-green/40 bg-laser-green/5 hover:bg-laser-green/10' : 'border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10'}`}>
                            <div className="flex justify-between items-center mb-2">
                               <span className={err.type === 'INPAINTED' ? 'text-laser-green font-bold' : 'text-rose-500 font-bold'}>[{err.type}]</span>
                               <span className={`px-2 py-0.5 rounded-full text-[8px] ${err.status === 'RESOLVED' ? 'bg-laser-green/20 text-laser-green' : 'bg-rose-500/20 text-rose-500'}`}>{err.status}</span>
                            </div>
                            <p className="opacity-70 leading-relaxed uppercase">{err.message}</p>
                         </div>
                      )})}
                    </div>
                 </div>
               )}
            </div>
          )}

          {file && processedMap && !isRightPanelCollapsed && (
             <div className="p-6 border-t border-tactical-primary/20 bg-tactical-primary/5">
                <button onClick={() => alert("Decrypting Mission Data...")} className="w-full bg-laser-green text-near-black font-black py-5 rounded-sm hover:bg-[#2bff00] transition-all flex items-center justify-center gap-4 text-[12px] tracking-[0.2em] shadow-2xl">
                   <Download size={18}/> EXFIL_AUDIT_REPORT
                </button>
             </div>
          )}
        </GlassModule>
      </div>

      {/* 5. TACTICAL HUD FOOTER (Telemetry) */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-black laser-text uppercase flex items-center gap-8 bg-near-black/90 px-12 py-3 rounded-full border border-tactical-primary/40 backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto">
         <div className="flex items-center gap-3">
           <span className="opacity-40 tracking-widest italic">Zoom_Factor:</span> 
           <span className="w-12 text-center text-white">{transformRef.current?.instance.transformState.scale.toFixed(2)}x</span>
         </div>
         <div className="w-px h-4 bg-tactical-primary/40" />
         <button onClick={() => setShowInference(!showInference)} className={`flex items-center gap-2 transition-all hover:scale-105 ${showInference ? 'laser-text font-black' : 'opacity-20 translate-y-1'}`}>
            <Layers size={14}/> Continuation_Grid::{showInference ? 'ACTIVE' : 'DECOUPLED'}
         </button>
         <div className="w-px h-4 bg-tactical-primary/40" />
         <div className="flex items-center gap-2 opacity-60">
            <Monitor size={14}/> GPU_ACCEL::ENABLED
         </div>
      </div>
    </div>
  );
}

const GlassModule = ({ children, className = "", onClick }) => (
  <div onClick={onClick} className={`glass-module ${className}`}>
    {children}
  </div>
);

const ToolbarIcon = ({ icon, active }) => (
  <button className={`p-4 rounded-xl transition-all ${active ? 'bg-laser-green/10 text-laser-green shadow-[0_0_20px_rgba(57,255,20,0.2)]' : 'text-tactical-primary opacity-60 hover:opacity-100 hover:text-laser-green'}`}>
    {icon}
  </button>
);

const SOPAccordionItem = ({ id, label, status, errors = 0, isOpen, onToggle }) => (
  <div className={`border rounded-lg transition-all ${isOpen ? 'border-laser-green/40 bg-laser-green/5' : 'border-tactical-primary/20 hover:border-tactical-primary/50'}`}>
    <div onClick={onToggle} className="p-3 flex justify-between items-center cursor-pointer">
      <div className="flex flex-col">
        <span className="text-[7px] font-mono opacity-40 uppercase">{id}</span>
        <span className="text-[10px] font-black uppercase tracking-tight">{label}</span>
      </div>
      <div className="flex items-center gap-2">
         {errors > 0 && <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 rounded">{errors}</span>}
         <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90 text-laser-green' : 'opacity-20'}`} />
      </div>
    </div>
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
          <div className="p-3 pt-0 border-t border-tactical-primary/10 text-[9px] font-mono leading-relaxed space-y-2 pt-3">
             <div className="flex justify-between"><span>STATUS:</span> <span className="laser-text">{status}</span></div>
             <div className="flex justify-between"><span>DECRYPTION:</span> <span className="opacity-60">ACTIVE_HYBRID</span></div>
             <div className="flex justify-between"><span>ISO_COMPLIANCE:</span> <span className="opacity-60 text-emerald-400">MIL-STD-1913</span></div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const LoginScreen = ({ setAuth }) => {
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const handleLogin = (e) => {
    e.preventDefault();
    if (id === AUTH_ID && pass === AUTH_PASS) setAuth(true);
    else alert("AUTH_FAIL: INVALID_SERVICE_ID");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center digital-grid">
      <div className="scanline-hud" />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-[450px] glass-module p-12 flex flex-col items-center">
         <img src="/logo.png" className="w-24 h-24 mb-10 mix-blend-screen" alt="logo" />
         <h1 className="text-xl font-black italic tracking-widest mb-8 laser-text">TACTICAL_ACCESS_POINT</h1>
         <form onSubmit={handleLogin} className="w-full space-y-6">
            <input 
              type="text" placeholder="SERVICE_ID" value={id} onChange={e => setId(e.target.value)}
              className="w-full bg-black/40 border-b border-tactical-primary/40 p-4 font-mono text-xs focus:outline-none focus:border-laser-green laser-text" 
            />
            <input 
              type="password" placeholder="SECURE_KEY" value={pass} onChange={e => setPass(e.target.value)}
              className="w-full bg-black/40 border-b border-tactical-primary/40 p-4 font-mono text-xs focus:outline-none focus:border-laser-green laser-text" 
            />
            <button className="w-full bg-tactical-primary/30 border border-tactical-primary text-white font-black py-5 tracking-[0.4em] hover:bg-tactical-primary/60 transition-all uppercase text-xs">Authorize</button>
         </form>
         <div className="mt-12 text-[7px] text-center opacity-30 tracking-[0.2em] font-mono leading-relaxed">
            RESTRICTED ACCESS ONLY. ATTEMPTED BREACH WILL TRIGGER COUNTER-ELINT PROTOCOLS.
         </div>
      </motion.div>
    </div>
  );
};

export default App;
