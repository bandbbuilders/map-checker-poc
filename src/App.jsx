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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      const selected = files[0];
      if (selected) {
        setFile(selected);
        const reader = new FileReader();
        reader.onload = (e) => {
          setOriginalMapPreview(e.target.result);
          setProcessedMap(null);
          setErrors([]);
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
    setErrors([]);
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await axios.post('/api/audit', fd);
      setProcessedMap(`data:image/jpeg;base64,${res.data.image}`);
      setContinuationLayer(res.data.layer);
      setErrors(res.data.errors);
      setMarkers(res.data.errors);
    } catch(e) {
      const errorMsg = e.response?.data?.error || e.message;
      alert(`TACTICAL SCAN ERROR: ${errorMsg}`);
    } finally { setIsProcessing(false); }
  };

  const resetMap = () => {
    setFile(null); setOriginalMapPreview(null); setProcessedMap(null); 
    setErrors([]); setMarkers([]); setContinuationLayer(null);
  };

  if (!isLoggedIn) return <LoginScreen setAuth={setIsLoggedIn} />;

  return (
    <div className={`fixed inset-0 select-none`}>
      <div className="scanline-hud" />
      
      {/* 1. MAP CANVAS (Main View - 100%) */}
      <div className="absolute inset-0 bg-black overflow-hidden digital-grid">
        <TransformWrapper ref={transformRef} centerOnInit minScale={0.1} maxScale={10} initialScale={1}>
          <TransformComponent wrapperStyle={{ width: '100vw', height: '100vh' }}>
            <div className="relative cursor-crosshair flex items-center justify-center min-w-screen min-h-screen" ref={mapRef}>
               {isProcessing && <div className="scanning-lattice" />}
               
               {/* Base Map Frame */}
               <div className="relative">
                 {processedMap ? (
                   <div className="relative">
                     <img src={processedMap} className="block max-w-[90vw] max-h-[85vh] object-contain" alt="map" />
                     {continuationLayer && showInference && (
                       <img 
                         src={`data:image/png;base64,${continuationLayer}`} 
                         className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-80 mix-blend-screen z-[55] transition-opacity" 
                         alt="inference-layer"
                       />
                     )}
                   </div>
                 ) : originalMapPreview ? (
                   <div className="relative">
                     <img src={originalMapPreview} className={`block max-w-[90vw] max-h-[85vh] object-contain transition-opacity ${isProcessing ? 'opacity-30 blur-sm' : 'opacity-100'}`} alt="preview" />
                     {isProcessing && (
                        <div className="absolute top-10 left-10 laser-text text-[10px] bg-black/40 p-2 animate-pulse z-50">
                          {flickerCode || 'SYSTEM_SCAN_ACTIVE...'}
                        </div>
                     )}
                   </div>
                 ) : (
                    <motion.div 
                      key="upload" {...getRootProps()}
                      className={`w-[600px] h-[400px] border-2 border-dashed glass-module flex flex-col items-center justify-center cursor-pointer hover:border-laser-green ${isDragActive ? 'border-laser-green bg-laser-green/5' : 'border-tactical-primary/40'}`}
                    >
                      <input {...getInputProps()} />
                      <div className="w-20 h-20 bg-tactical-primary/10 rounded-full flex items-center justify-center mb-6 laser-text">
                        <MapIcon className="w-10 h-10" />
                      </div>
                      <h2 className="text-xl font-black uppercase tracking-widest mb-2 leading-none">Initialize Tactical Feed</h2>
                      <p className="text-[9px] font-mono opacity-60 uppercase mb-8">Drop mapping files, PDF, or GEOTIFF here.</p>
                      <button className="bg-tactical-primary text-white px-10 py-4 rounded font-black text-xs tracking-[0.4em] hover:bg-green-900 transition-all">UPLOAD_SCAN_FILE</button>
                    </motion.div>
                 )}
               </div>

               {/* Tactical Flag Markers */}
               {!isProcessing && markers.map(m => (
                 <div 
                   key={m.id} 
                   style={{ left: `${m.x}%`, top: `${m.y}%` }}
                   className={`absolute -ml-4 -mt-4 w-8 h-8 flex items-center justify-center group z-[60]`}
                 >
                    {m.type === 'INPAINTED' ? (
                       <div className="w-3 h-3 bg-laser-green rounded-full shadow-[0_0_15px_#39FF14] animate-pulse" />
                    ) : (
                       <div className="w-8 h-8 error-wireframe rounded flex items-center justify-center bg-rose-500/10">
                          <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                       </div>
                    )}
                    
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 glass-module p-2 text-[8px] font-mono pointer-events-none opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] border-laser-green/30">
                       <div className="laser-text mb-1 italic">OBJECT_LOCATED: [{m.x.toFixed(1)}, {m.y.toFixed(1)}]</div>
                       <div className="opacity-80">STATUS: {m.status}</div>
                       <div className="text-rose-400 mt-1 uppercase">{m.message}</div>
                    </div>
                 </div>
               ))}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* 2. TOP HUD (Floating) */}
      <div className="absolute top-8 inset-x-8 flex justify-between pointer-events-none">
        <GlassModule className="px-6 py-4 flex items-center gap-6 pointer-events-auto">
          <div className="relative">
             <img src="/logo.png" className="w-12 h-12 object-contain mix-blend-screen opacity-90" alt="logo" />
             <div className="absolute inset-0 border border-laser-green rounded-full animate-ping opacity-20" />
          </div>
          <div className="flex flex-col border-l border-tactical-primary/30 pl-6">
            <h1 className="text-xl font-black uppercase tracking-tight italic">Operation <span className="laser-text">Map-Scan</span> <span className="text-[10px] opacity-40 ml-2">V2.0.4</span></h1>
             <div className="flex gap-4 text-[9px] font-mono tracking-widest opacity-60 items-center mt-1 uppercase">
                <span className="flex items-center gap-2"><div className="w-1 h-1 bg-laser-green rounded-full pulse" /> Active Terminal: {AUTH_ID}</span>
                <span className="w-px h-2 bg-tactical-primary/40" />
                <span>Sector: 33.72° N, 73.09° E</span>
             </div>
          </div>
        </GlassModule>

        <div className="flex items-center gap-4 pointer-events-auto">
          {file && (
            <GlassModule className="px-5 py-3 text-[10px] font-black uppercase flex items-center gap-3 laser-text cursor-pointer hover:bg-laser-green/10" onClick={resetMap}>
              <RotateCcw size={14} /> Clear Buffer
            </GlassModule>
          )}
          <GlassModule className="px-6 py-2 flex flex-col items-end">
            <div className="text-[10px] font-black text-rose-500 tracking-widest uppercase">Restrict_Prot::ELINT</div>
            <div className="text-[12px] font-mono laser-text mt-0.5">{timestamp}_GMT</div>
          </GlassModule>
          <button onClick={() => setIsLoggedIn(false)} className="glass-module p-4 text-rose-500 hover:bg-rose-500/20"><Power size={20} /></button>
        </div>
      </div>

      {/* 3. UNIFIED UTILITY BAR (Left) */}
      <div className="absolute left-8 top-44 bottom-8 w-20 pointer-events-none">
        <GlassModule className="h-full flex flex-col items-center py-8 gap-10 overflow-y-auto w-full pointer-events-auto">
           <ToolbarIcon icon={<Activity size={24}/>} active />
           <ToolbarIcon icon={<Eye size={24}/>} />
           <ToolbarIcon icon={<TerminalIcon size={24}/>} />
           <ToolbarIcon icon={<Layers size={24}/>} />
           <div className="flex-1" />
           <ToolbarIcon icon={<Settings size={24}/>} />
        </GlassModule>
      </div>

      {/* 4. SOP ACCORDION PANEL (Right) */}
      <div className={`absolute right-8 top-44 bottom-8 transition-all duration-500 ${isRightPanelCollapsed ? 'w-12' : 'w-80'} pointer-events-none`}>
        <GlassModule className="h-full pointer-events-auto flex flex-col overflow-hidden">
          <div className="p-4 border-b border-tactical-primary/20 flex justify-between items-center bg-tactical-primary/5">
             {!isRightPanelCollapsed && <span className="text-[10px] font-black tracking-[0.2em] laser-text italic uppercase flex items-center gap-2"><ShieldAlert size={12}/> Control_Protocols</span>}
             <button onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)} className="p-1 hover:text-laser-green transition-colors">
                <ChevronRight size={18} className={`transition-transform duration-500 ${isRightPanelCollapsed ? 'rotate-180' : ''}`} />
             </button>
          </div>

          {!isRightPanelCollapsed && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
               {file && !processedMap && (
                 <button onClick={runAnalysis} className="w-full bg-rose-700/80 hover:bg-rose-600 text-white font-black py-4 mb-4 text-[10px] tracking-[0.3em] uppercase rounded shadow-[0_0_20px_rgba(230,57,70,0.3)] transition-all">
                    {isProcessing ? 'SCANNING_GEOMETRY...' : 'START_COGNITIVE_SCAN'}
                 </button>
               )}

               <SOPAccordionItem 
                 id="SOP-01" label="Interval Inpainting" 
                 status={isProcessing ? "SCANNING..." : (processedMap ? "COMPLETE" : "OPTIMAL")} 
                 errors={errors.filter(e => e.type === 'INPAINTED').length} 
                 isOpen={activeAccordion === 'SOP-01'} onToggle={() => setActiveAccordion('SOP-01')}
               />
               <SOPAccordionItem 
                 id="SOP-02" label="Contextual Integrity" 
                 status={isProcessing ? "SCANNING..." : (processedMap ? "ANALYSIS_DONE" : "INFERENCE_ACTIVE")} 
                 errors={errors.filter(e => e.type === 'INTEGRITY_ERROR').length}
                 isOpen={activeAccordion === 'SOP-02'} onToggle={() => setActiveAccordion('SOP-02')}
               />
               <SOPAccordionItem id="SOP-03" label="Geometric Alignment" status="STANDBY" isOpen={activeAccordion === 'SOP-03'} onToggle={() => setActiveAccordion('SOP-03')} />
               
               {errors.length > 0 && (
                 <div className="mt-4 border-t border-tactical-primary/20 pt-4 flex flex-col gap-2">
                    <div className="text-[9px] font-black laser-text mb-2 uppercase italic tracking-widest flex justify-between">Detected_Anomalies ({errors.length}) <Info size={10}/></div>
                    {errors.map(err => {
                       const zl = 4;
                       return (
                       <div key={err.id} onClick={() => {
                          const vW = mapRef.current.clientWidth;
                          const vH = mapRef.current.clientHeight;
                          transformRef.current.setTransform((vW/2) - (err.x/100*vW*zl), (vH/2) - (err.y/100*vH*zl), zl, 800);
                       }} className={`p-2 border rounded text-[9px] font-mono cursor-pointer transition-all ${err.type === 'INPAINTED' ? 'border-laser-green/30 bg-laser-green/5 hover:bg-laser-green/10' : 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10'}`}>
                          <div className="flex justify-between items-center mb-1">
                             <span className={err.type === 'INPAINTED' ? 'text-laser-green' : 'text-rose-500'}>[{err.type}]</span>
                             <span className="opacity-40">{err.status}</span>
                          </div>
                          <p className="opacity-80 italic">{err.message}</p>
                       </div>
                    )})}
                 </div>
               )}
            </div>
          )}

          {file && processedMap && !isRightPanelCollapsed && (
             <div className="p-4 border-t border-tactical-primary/20">
                <button onClick={() => alert("Decrypting Report...")} className="w-full bg-tactical-primary/20 border border-tactical-primary/50 text-[10px] font-black uppercase laser-text py-4 rounded hover:bg-tactical-primary/30 transition-all flex items-center justify-center gap-3">
                   <Download size={14}/> Download_Audit_Bin
                </button>
             </div>
          )}
        </GlassModule>
      </div>

      {/* Inspector Toggle (Floating Bottom) */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[9px] font-black laser-text uppercase flex items-center gap-4 bg-black/60 p-2 px-8 rounded-full border border-tactical-primary/30 backdrop-blur-xl">
         <span className="opacity-40">Zoom_Lvl: {transformRef.current?.instance.transformState.scale.toFixed(2)}x</span>
         <span className="w-px h-3 bg-tactical-primary/30" />
         <button onClick={() => setShowInference(!showInference)} className={`transition-all ${showInference ? 'laser-text' : 'opacity-20'}`}>
            Continuation_Layer::{showInference ? 'ON' : 'OFF'}
         </button>
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
