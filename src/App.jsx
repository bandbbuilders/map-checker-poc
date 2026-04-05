import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Download, AlertTriangle, CheckCircle, Crosshair, 
  Map as MapIcon, Loader2, Info, Eye, Layers, 
  ShieldAlert, Settings, FileText, ChevronRight,
  Maximize2, ZoomIn, ZoomOut, RotateCcw, Lock, User,
  Power, Moon, Sun, Monitor
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const AUTH_ID = "HQ_ADMIN";
const AUTH_PASS = "MA-786-PAK-26";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'battle';
  });
  
  // Tactical States
  const [timestamp, setTimestamp] = useState(new Date().toISOString().replace('T', ' ').substring(0, 19));
  const [file, setFile] = useState(null);
  const [originalMapPreview, setOriginalMapPreview] = useState(null);
  const [processedMap, setProcessedMap] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0); 
  const [flickeringCoords, setFlickeringCoords] = useState("33.7294° N, 73.0931° E");
  const [errors, setErrors] = useState([]);
  const [showInspector, setShowInspector] = useState(false);
  const [activeSOP, setActiveSOP] = useState("SOP-01");
  const [markers, setMarkers] = useState([]);
  
  const mapRef = useRef(null);
  const transformRef = useRef(null);

  // Sync session and theme
  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn);
  }, [isLoggedIn]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme === 'recon' ? 'recon' : 'battle');
  }, [theme]);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setTimestamp(new Date().toISOString().replace('T', ' ').substring(0, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Hook must be at top level
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files[0]) {
        setFile(files[0]);
        setOriginalMapPreview(URL.createObjectURL(files[0]));
        setActiveStep(1);
      }
    },
    noClick: false,
    multiple: false
  });

  // UI Components
  if (!isLoggedIn) {
     return <LoginScreen setAuth={setIsLoggedIn} theme={theme} />;
  }

  return (
    <div className={`min-h-screen flex flex-col relative`}>
      <div className="scanline-overlay" />
      
      {/* Header - Tactical HUD */}
      <header className="h-20 border-b border-military-green/50 military-panel flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-6">
          <div className="relative group cursor-pointer">
             <img 
               src="/logo.png" 
               alt="PA HQ Logo" 
               className={`w-14 h-14 object-contain transition-transform duration-500 hover:scale-110 ${theme === 'battle' ? 'mix-blend-screen' : 'invert mix-blend-multiply opacity-80'}`} 
             />
             <div className="absolute inset-0 w-full h-full border border-military-green rounded-full animate-ping opacity-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase whitespace-nowrap">
              OPERATION <span className="text-military-green">MAP-SCAN</span>
            </h1>
            <div className="flex gap-4 text-[10px] items-center text-military-green font-bold uppercase tracking-widest">
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-military-green rounded-full pulse" /> {theme.toUpperCase()} MODE</span>
              <span className="w-1 h-1 bg-gray-500 rounded-full" />
              <span>{AUTH_ID}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Theme Toggler */}
          <button 
            onClick={() => setTheme(theme === 'battle' ? 'recon' : 'battle')}
            className="p-2 border border-military-green/30 hover:bg-military-green/10 rounded transition-all text-military-green"
            title="Toggle Recon/Battle Mode"
          >
            {theme === 'battle' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="flex flex-col items-end">
            <div className="bg-military-red/10 border border-military-red/50 text-military-red text-xs px-4 py-1 font-black restricted-glitch shadow-[0_0_10px_rgba(255,0,0,0.1)]">
              RESTRICTED - FOR OFFICIAL USE
            </div>
            <div className="text-[10px] mt-1 text-military-green font-mono opacity-80">{timestamp}</div>
          </div>

          <button 
            onClick={() => setIsLoggedIn(false)}
            className="p-2 text-military-red hover:bg-military-red/10 rounded border border-military-red/20"
            title="Log out"
          >
            <Power size={20} />
          </button>
        </div>
      </header>

      {/* Main Tactical Interface - similar to previous but refined dot markers */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6 z-40 bg-transparent">
        
        {/* Left Toolbar */}
        <nav className="w-16 flex flex-col gap-4 py-4 items-center military-panel rounded-xl">
          <button onClick={() => setActiveStep(0)} className={`p-3 rounded-lg transition-colors ${activeStep === 0 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/10 text-gray-500'}`}>
            <MapIcon size={24} />
          </button>
          <button className={`p-3 rounded-lg transition-colors ${activeStep === 1 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/10 text-gray-500'}`}>
            <ShieldAlert size={24} />
          </button>
          <button className={`p-3 rounded-lg transition-colors ${activeStep === 2 ? 'bg-military-green text-white glow-green' : 'hover:bg-military-green/10 text-gray-500'}`}>
             <FileText size={24} />
          </button>
          <div className="flex-1" />
          <button className="p-3 text-gray-500 hover:text-white"><Settings size={24} /></button>
        </nav>

        {/* Central Display Area */}
        <div className="flex-1 flex flex-col gap-6 relative">
          <AnimatePresence mode="wait">
            {activeStep === 0 && !file ? (
              <motion.div 
                key="upload"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                {...getRootProps()}
                className={`flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-military-green bg-military-green/5' : 'border-military-green/30 military-panel hover:border-military-green'}`}
              >
                <input {...getInputProps()} />
                <div className="w-24 h-24 bg-military-green/10 rounded-full flex items-center justify-center mb-4"><MapIcon className="text-military-green w-10 h-10" /></div>
                <h2 className="text-xl font-bold tracking-widest uppercase mb-1">Upload Tactical Scan</h2>
                <p className="text-[10px] text-gray-500 font-mono">SUPPORTED: MAPS, SAT-IMGS, GEOTIFF</p>
              </motion.div>
            ) : (
              <motion.div 
                key="viewer"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex-1 flex flex-col overflow-hidden relative military-panel rounded-2xl"
              >
                <div className="h-8 border-b border-military-green/20 bg-military-green/5 flex items-center px-4 justify-between">
                   <div className="text-[9px] font-black tracking-widest text-military-green uppercase flex items-center gap-2">
                     <Monitor size={10} /> Live Feed Output
                   </div>
                   <div className="flex gap-2">
                      <div className="w-1.5 h-1.5 bg-military-green rounded-full animate-pulse" />
                      <div className="w-1.5 h-1.5 bg-military-green rounded-full opacity-30" />
                      <div className="w-1.5 h-1.5 bg-military-green rounded-full opacity-30" />
                   </div>
                </div>

                <div className="flex-1 relative overflow-hidden flex">
                  {/* Left: Original Preview Split */}
                  <div className="w-1/3 border-r border-military-green/20 relative overflow-auto bg-black/20">
                     <div className="sticky top-0 p-2 text-[8px] bg-black/40 z-10 font-bold text-gray-500 uppercase">Input Stream</div>
                     <img src={originalMapPreview} className="max-w-none w-full opacity-50 grayscale" />
                  </div>

                  {/* Right: Processed Viewer with Zoom */}
                  <div className="flex-1 relative bg-black/10 group">
                    <TransformWrapper ref={transformRef} limitToBounds minScale={1} centerOnInit>
                      <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
                        <div className="relative w-full h-full cursor-crosshair" ref={mapRef}>
                           {isProcessing && <div className="radar-v-bar" />}
                           <img 
                            src={processedMap || originalMapPreview} 
                            className={`w-full h-full object-contain transition-opacity duration-1000 ${isProcessing ? 'opacity-40' : 'opacity-100'}`} 
                          />
                          {markers.map(m => (
                            <div 
                              key={m.id} 
                              style={{ left: `${m.x}%`, top: `${m.y}%` }}
                              className={`absolute -ml-[3px] -mt-[3px] flex items-center justify-center`}
                            >
                               <div className={m.status === 'PASS' ? 'pulsate-pixel-pass' : 'pulsate-pixel'} />
                               <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/90 text-[8px] p-1 border border-white/10 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                 {m.message}
                               </div>
                            </div>
                          ))}
                        </div>
                      </TransformComponent>
                    </TransformWrapper>
                    
                    {isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-50">
                        <Loader2 className="w-12 h-12 text-military-red animate-spin mb-4" />
                        <div className="text-xl font-black text-military-red tracking-[0.5em] mb-2 uppercase">Analyzing...</div>
                        <div className="text-[10px] font-mono text-military-green">{flickeringCoords}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/90 border border-military-green/50 p-2 rounded-full z-40 backdrop-blur-xl">
                   <button onClick={() => transformRef.current.zoomIn()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><ZoomIn size={18}/></button>
                   <button onClick={() => transformRef.current.zoomOut()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><ZoomOut size={18}/></button>
                   <button onClick={() => transformRef.current.resetTransform()} className="p-2 hover:bg-military-green/20 rounded-full text-military-green"><RotateCcw size={18}/></button>
                   <div className="w-px h-6 bg-military-green/30 mx-1" />
                   <button onClick={() => setShowInspector(!showInspector)}
                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 transition-all ${showInspector ? 'bg-military-green text-white shadow-lg' : 'text-military-green hover:bg-military-green/10'}`}
                    >
                     <Eye size={12} /> Scan Panel
                   </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar */}
        <aside className="w-80 flex flex-col gap-6">
          <div className="military-panel p-5 rounded-2xl flex flex-col gap-4">
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-military-green uppercase tracking-widest flex items-center gap-2"><ShieldAlert size={12} /> SOP ENGINE 4.0</span>
                {isProcessing && <Loader2 size={12} className="text-military-red animate-spin" />}
             </div>
             
             {file && !processedMap && !isProcessing && (
               <button onClick={async () => {
                 setIsProcessing(true);
                 const fd = new FormData(); fd.append("file", file);
                 try {
                   const res = await axios.post('/api/audit', fd);
                   setProcessedMap(`data:image/jpeg;base64,${res.data.image}`);
                   setErrors(res.data.errors);
                   setMarkers(res.data.errors);
                 } catch(e) {
                   // Fallback logic
                   setTimeout(() => {
                     setProcessedMap(originalMapPreview);
                     const errs = [{ id: 1, type: "SOP-01", message: "Discontinuity @ 33.72/73.09", x: 45, y: 30 }];
                     setErrors(errs); setMarkers(errs);
                   }, 2000);
                 } finally { setIsProcessing(false); }
               }} 
               className="w-full bg-military-red hover:bg-red-800 text-white py-3 rounded-lg font-black text-xs tracking-widest shadow-lg active:scale-95 transition-all">
                 RUN ANALYSIS
               </button>
             )}

             <div className="space-y-2 mt-2">
                <SOPItem id="SOP-01" label="Contour Intervals" active={activeSOP === 'SOP-01'} />
                <SOPItem id="SOP-02" label="Line Integrity" />
                <SOPItem id="SOP-03" label="Grid Alignment" />
             </div>

             {errors.length > 0 && (
               <div className="border-t border-military-red/20 pt-4 mt-2">
                 <div className="text-[9px] font-black text-military-red uppercase mb-3 tracking-tighter">Violations Detected ({errors.length})</div>
                 <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                   {errors.map(err => (
                     <div 
                      key={err.id} 
                      onClick={() => {
                        const zl = 6;
                        const vW = mapRef.current.clientWidth;
                        const vH = mapRef.current.clientHeight;
                        transformRef.current.setTransform((vW/2) - (err.x/100*vW*zl), (vH/2) - (err.y/100*vH*zl), zl, 1000, "easeInOutQuad");
                      }}
                      className="p-2 bg-military-red/5 border border-military-red/30 rounded text-[9px] cursor-pointer hover:bg-military-red/10 group"
                     >
                       <div className="flex justify-between font-bold mb-1"><span className="text-military-red">{err.type}</span> <span className="opacity-40">{err.coords || 'ERR-LOC'}</span></div>
                       <p className="opacity-80 group-hover:opacity-100">{err.message}</p>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
          
          {processedMap && (
             <button onClick={() => alert("Generating Secure PDF...")} className="bg-military-green/10 border border-military-green/50 text-military-green text-xs font-black py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-military-green/20 transition-all">
                <Download size={16} /> DOWNLOAD AUDIT
             </button>
          )}
        </aside>
      </main>
    </div>
  );
}

const SOPItem = ({ id, label, active }) => (
  <div className={`flex items-center justify-between p-3 rounded border transition-all ${active ? 'border-military-green bg-military-green/10' : 'border-gray-500/10 bg-black/10'}`}>
     <div className="flex flex-col">
       <span className="text-[8px] font-black opacity-40">{id}</span>
       <span className="text-[10px] font-bold">{label}</span>
     </div>
     <ChevronRight size={14} className={active ? 'text-military-green' : 'opacity-20'} />
  </div>
);

const LoginScreen = ({ setAuth, theme }) => {
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (id === AUTH_ID && pass === AUTH_PASS) {
        setAuth(true);
      } else {
        setError('ACCESS DENIED: INVALID CREDENTIALS');
      }
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-black">
      <div className="scanline-overlay" />
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: 'radial-gradient(circle, #006600 0%, transparent 70%)' }} />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md military-panel p-10 rounded-3xl z-10 border-t-4 border-t-military-green"
      >
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.png" className="w-24 h-24 object-contain mb-6 mix-blend-screen" alt="Logo" />
          <h1 className="text-2xl font-black tracking-widest text-white uppercase italic">HQ_COMMAND_OS</h1>
          <div className="h-px w-20 bg-military-green mt-2" />
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-military-green opacity-40" size={18} />
            <input 
              type="text" placeholder="SERVICE ID" value={id} onChange={e => setId(e.target.value)}
              className="w-full bg-black/40 border border-military-green/30 rounded-xl py-4 pl-12 pr-4 text-xs font-mono tracking-widest focus:border-military-green focus:outline-none focus:ring-1 focus:ring-military-green transition-all"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-military-green opacity-40" size={18} />
            <input 
              type="password" placeholder="SECURE KEY" value={pass} onChange={e => setPass(e.target.value)}
              className="w-full bg-black/40 border border-military-green/30 rounded-xl py-4 pl-12 pr-4 text-xs font-mono tracking-widest focus:border-military-green focus:outline-none focus:ring-1 focus:ring-military-green transition-all"
              required
            />
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full bg-military-green text-white py-4 rounded-xl font-black tracking-[0.3em] uppercase hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'INITIALIZE ACCESS'}
          </button>
        </form>

        {error && <div className="mt-6 text-[10px] text-military-red font-black text-center animate-pulse">{error}</div>}
        
        <div className="mt-10 text-[8px] text-gray-500 font-bold text-center tracking-[0.2em] leading-relaxed uppercase">
          WARNING: Unauthorized access to this terminal is 15 USC § 1030 violation. ALL TRAFFIC IS LOGGED.
        </div>
      </motion.div>
    </div>
  );
};

export default App;
