import React, { useState, useEffect } from 'react';
import ScreenerPanel from './components/ScreenerPanel';
import ChartLayout from './components/ChartLayout';
import { 
  Tv, 
  Layers, 
  Grid, 
  Power, 
  Radio, 
  HelpCircle, 
  TrendingUp, 
  Info,
  ExternalLink 
} from 'lucide-react';

export default function App() {
  // 1. Theme State (persisted to localStorage)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('screener-theme') || 'cyber-obsidian';
  });

  // 2. Viewport State Array (Initial values populated for a stunning initial look)
  const [viewports, setViewports] = useState([
    { id: 1, symbol: 'NSE:RELIANCE-EQ', timeframe: '5m', chartType: 'renko' },
    { id: 2, symbol: 'NSE:TCS-EQ', timeframe: '5m', chartType: 'renko' },
    { id: 3, symbol: 'NSE:HDFCBANK-EQ', timeframe: '15m', chartType: 'candle' },
    { id: 4, symbol: 'NSE:INFY-EQ', timeframe: '1D', chartType: 'candle' },
    { id: 5, symbol: 'NSE:SBIN-EQ', timeframe: '5m', chartType: 'renko' },
    { id: 6, symbol: 'NSE:ICICIBANK-EQ', timeframe: '15m', chartType: 'renko' },
    { id: 7, symbol: 'NSE:BHARTIARTL-EQ', timeframe: 'H', chartType: 'candle' },
    { id: 8, symbol: 'NSE:ITC-EQ', timeframe: '5m', chartType: 'candle' }
  ]);

  const [activeViewportId, setActiveViewportId] = useState(1);
  const [layoutCount, setLayoutCount] = useState(4); // Default 4-chart layout

  // Global Renko settings managed in the Screener sidebar and pushed to chart renderers
  const [globalBrickSize, setGlobalBrickSize] = useState(1.0);
  const [globalSizeType, setGlobalSizeType] = useState('percent'); // percent, fixed, atr

  // Fyers API connection status state
  const [fyersStatus, setFyersStatus] = useState({
    status: 'disconnected',
    clientID: '',
    isMock: true,
    message: ''
  });

  // Apply theme class to body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('screener-theme', theme);
  }, [theme]);

  // 3. Fetch and Poll Fyers connection status
  const checkFyersStatus = async () => {
    try {
      const res = await fetch('/api/fyers/status');
      if (res.ok) {
        const data = await res.json();
        setFyersStatus(data);
      }
    } catch (err) {
      console.error('Error fetching Fyers status:', err);
    }
  };

  useEffect(() => {
    checkFyersStatus();
    
    // Poll every 3 seconds to auto-detect when OAuth popup flow finishes!
    const interval = setInterval(checkFyersStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleLoginPopup = (event) => {
    event.preventDefault();
    setFyersStatus(prev => ({
      ...prev,
      message: 'Opening Fyers login...'
    }));
    window.location.assign('/api/fyers/login');
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch('/api/fyers/disconnect');
      if (res.ok) {
        checkFyersStatus();
      }
    } catch (err) {
      console.error('Error disconnecting Fyers:', err);
    }
  };

  // 3. Viewport State Handlers
  const handleSelectViewport = (id) => {
    setActiveViewportId(id);
  };

  const handleUpdateViewport = (id, updates) => {
    setViewports(prev =>
      prev.map(vp => (vp.id === id ? { ...vp, ...updates } : vp))
    );
  };

  const handleLoadStockToActiveViewport = (symbol) => {
    setViewports(prev =>
      prev.map(vp => (vp.id === activeViewportId ? { ...vp, symbol } : vp))
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#07090e] font-sans">
      
      {/* LEFT: Quick Screener Sidebar */}
      <div className="w-[320px] flex-shrink-0 h-full">
        <ScreenerPanel
          activeViewportId={activeViewportId}
          onLoadStockToActiveViewport={handleLoadStockToActiveViewport}
          globalBrickSize={globalBrickSize}
          globalSizeType={globalSizeType}
          setGlobalBrickSize={setGlobalBrickSize}
          setGlobalSizeType={setGlobalSizeType}
        />
      </div>

      {/* RIGHT: Active workspace containing Header + Multi-Chart grid */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* TOP: Trading Terminal Control Banner */}
        <header className="h-14 bg-[#090c15] border-b border-slate-800 flex items-center justify-between px-4 z-20">
          
          {/* Logo and system status */}
          <div className="flex items-center gap-2.5">
            <div className="bg-[#12192c] p-1.5 rounded-lg border border-slate-800/80 text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.1)]">
              <TrendingUp size={16} />
            </div>
            <div>
              <h1 className="font-outfit font-extrabold text-sm tracking-wide text-slate-100 flex items-center gap-1.5 leading-none">
                ANTIGRAVITY SCREENER & BOT
                <span className="text-[9px] bg-sky-950/80 text-sky-400 border border-sky-900/60 px-1.5 py-0.5 rounded uppercase font-bold">V1.0</span>
              </h1>
              <p className="text-[10px] text-slate-500 mt-0.5">Automated screening & multi-chart analysis</p>
            </div>
          </div>

          {/* Theme Selector & Grid Layout Layout pickers */}
          <div className="flex items-center gap-4">
            {/* Theme Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Theme:</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="bg-[#0f1422] text-slate-200 text-[10px] font-medium rounded px-2 py-0.5 border border-slate-800 outline-none cursor-pointer hover:border-slate-700 focus:border-[#38bdf8]"
              >
                <option value="cyber-obsidian">🌌 Obsidian</option>
                <option value="warm-forest">🌲 Warm Forest</option>
                <option value="nordic-charcoal">🌋 Charcoal</option>
                <option value="classic-light">☀️ Classic Light</option>
              </select>
            </div>

            {/* Split layout count */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mr-1">
                <Grid size={12} className="text-[#38bdf8]" />
                <span>LAYOUT SPLIT:</span>
              </div>
              <div className="flex bg-[#0f1422] rounded-lg p-0.5 border border-slate-850">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                  <button
                    key={count}
                    onClick={() => setLayoutCount(count)}
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-all ${
                      layoutCount === count
                        ? 'bg-[#38bdf8] text-[#0f1422] font-extrabold shadow-sm scale-105'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={`${count} Screen Split`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fyers API Authentication Badges */}
          <div className="flex items-center gap-3">
            {fyersStatus.status === 'connected' ? (
              <div className="flex items-center gap-2 bg-[#26a69a]/10 border border-[#26a69a]/30 rounded-lg py-1 px-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-ping" />
                <span className="text-[10px] font-bold text-[#26a69a] uppercase tracking-wider">Fyers Active</span>
                <span className="text-[9px] text-slate-500 font-mono">({fyersStatus.clientID})</span>
                <button
                  onClick={handleDisconnect}
                  className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                  title="Disconnect Fyers"
                >
                  <Power size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg py-1 px-2.5">
                <Radio size={12} className="text-yellow-500 animate-pulse" />
                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Sandbox Mode</span>
                
                <a
                  href="/api/fyers/login"
                  onClick={handleLoginPopup}
                  className="bg-[#26a69a] hover:bg-[#208c81] text-[#07090e] text-[10px] font-extrabold px-2 py-0.5 rounded flex items-center gap-0.5 transition-all shadow-[0_0_8px_rgba(38,166,154,0.3)] hover:scale-105"
                  title="Login to active Fyers API"
                >
                  CONNECT
                  <ExternalLink size={8} />
                </a>
              </div>
            )}
          </div>

        </header>

        {/* CENTER MAIN GRID: Split Multi-Viewports */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[#07090e]">
          <ChartLayout
            viewports={viewports}
            activeViewportId={activeViewportId}
            onSelectViewport={handleSelectViewport}
            onUpdateViewport={handleUpdateViewport}
            layoutCount={layoutCount}
            brickSize={globalBrickSize}
            sizeType={globalSizeType}
            theme={theme}
          />
          
          {/* HUD Overlay Alert when selecting charts */}
          <div className="absolute bottom-4 right-4 z-20 pointer-events-none bg-[#090c15]/95 border border-slate-800 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
            <Info size={12} className="text-[#38bdf8]" />
            <span className="text-slate-400 font-semibold uppercase tracking-wide">
              Active Cell: <strong className="text-slate-100 font-bold">Viewport #{activeViewportId}</strong>
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
