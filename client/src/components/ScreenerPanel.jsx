import React, { useEffect, useState } from 'react';
import { Play, Plus, X, Trash2, Layers, Sliders, ListFilter, HelpCircle, CheckCircle, RefreshCw, ClipboardList } from 'lucide-react';

const PRESETS = {
  'Nifty Heavyweights': ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'ITC', 'LTI', 'BHARTIARTL', 'SBIN', 'KOTAKBANK'],
  'Tech & IT': ['TCS', 'INFY', 'WIPRO', 'TECHM', 'COFORGE', 'LTIM', 'KPITTECH', 'PERSISTENT', 'MPHASIS', 'LTTS'],
  'Banking & Finance': ['SBIN', 'HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 'INDUSINDBK', 'PFC', 'RECLTD', 'SHRIRAMFIN', 'AUBANK'],
  'Auto & Energy': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'TVSMOTOR', 'HEROMOTOCO', 'BAJAJ-AUTO', 'MARUTI', 'M&M', 'NTPC', 'POWERGRID']
};

const MAX_WATCHLIST_SIZE = 500;
const STORAGE_KEY = 'screener-watchlists-v1';
const DEFAULT_WATCHLISTS = [
  { id: 1, name: 'List 1', symbols: PRESETS['Nifty Heavyweights'] },
  { id: 2, name: 'List 2', symbols: PRESETS['Tech & IT'] },
  { id: 3, name: 'List 3', symbols: PRESETS['Banking & Finance'] },
  { id: 4, name: 'List 4', symbols: PRESETS['Auto & Energy'] },
  { id: 5, name: 'List 5', symbols: [] }
];

function cleanTicker(raw) {
  const clean = raw.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  if (!clean) return '';
  return clean.replace(/[^A-Z0-9:&-]/g, '');
}

function parseTickerList(text) {
  return text
    .split(/[\s,;|]+/)
    .map(cleanTicker)
    .filter(Boolean);
}

export default function ScreenerPanel({
  activeViewportId,
  onLoadStockToActiveViewport,
  globalBrickSize,
  globalSizeType,
  setGlobalBrickSize,
  setGlobalSizeType
}) {
  const [watchlists, setWatchlists] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved) && saved.length >= 5) return saved.slice(0, 5);
    } catch (err) {}
    return DEFAULT_WATCHLISTS;
  });
  const [activeWatchlistId, setActiveWatchlistId] = useState(1);
  const [newTicker, setNewTicker] = useState('');
  const [bulkTickers, setBulkTickers] = useState('');
  const [timeframe, setTimeframe] = useState('5m');
  const [condition, setCondition] = useState('reversal');
  
  // Custom condition parameters
  const [consecutiveCount, setConsecutiveCount] = useState(3);
  const [emaFast, setEmaFast] = useState(9);
  const [emaSlow, setEmaSlow] = useState(21);
  
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [notification, setNotification] = useState(null);

  const activeWatchlist = watchlists.find(list => list.id === activeWatchlistId) || watchlists[0];
  const watchlist = activeWatchlist?.symbols || [];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
  }, [watchlists]);

  const updateActiveWatchlist = (updater) => {
    setWatchlists(prev => prev.map(list => {
      if (list.id !== activeWatchlistId) return list;
      const nextSymbols = typeof updater === 'function' ? updater(list.symbols) : updater;
      return { ...list, symbols: nextSymbols.slice(0, MAX_WATCHLIST_SIZE) };
    }));
  };

  const addTickersToActiveWatchlist = (tickers) => {
    if (tickers.length === 0) return;

    let added = 0;
    let skipped = 0;
    const existing = new Set(watchlist);
    const next = [...watchlist];

    for (const ticker of tickers) {
      if (existing.has(ticker)) {
        skipped += 1;
        continue;
      }
      if (next.length >= MAX_WATCHLIST_SIZE) {
        skipped += 1;
        continue;
      }
      next.push(ticker);
      existing.add(ticker);
      added += 1;
    }

    updateActiveWatchlist(next);
    triggerNotification(`Added ${added} stocks${skipped ? `, skipped ${skipped}` : ''}`);
  };

  const handleAddTicker = (e) => {
    e.preventDefault();
    addTickersToActiveWatchlist(parseTickerList(newTicker));
    setNewTicker('');
  };

  const handleRemoveTicker = (ticker) => {
    updateActiveWatchlist(prev => prev.filter(t => t !== ticker));
  };

  const handleClearWatchlist = () => {
    updateActiveWatchlist([]);
  };

  const handleLoadPreset = (name) => {
    updateActiveWatchlist(PRESETS[name]);
    triggerNotification(`Loaded ${name}`);
  };

  const handleBulkImport = () => {
    const tickers = parseTickerList(bulkTickers);
    addTickersToActiveWatchlist(tickers);
    setBulkTickers('');
  };

  const triggerNotification = (text) => {
    setNotification(text);
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const handleRunScan = async () => {
    if (watchlist.length === 0) {
      setScanError('Watchlist is empty. Add stocks or load a preset first!');
      return;
    }

    setScanning(true);
    setScanError(null);
    setResults([]);
    setHasScanned(false);

    // Format tickers to standard Fyers NSE EQ
    const formattedTickers = watchlist.map(t => {
      if (!t.includes(':')) return `NSE:${t}-EQ`;
      return t;
    });

    const params = {};
    if (condition === 'consecutive') {
      params.count = consecutiveCount;
    } else if (condition === 'ema_crossover') {
      params.fastPeriod = emaFast;
      params.slowPeriod = emaSlow;
    }

    try {
      const response = await fetch('/api/screener/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tickers: formattedTickers,
          timeframe,
          brickSize: globalBrickSize,
          sizeType: globalSizeType,
          condition,
          params
        })
      });

      if (!response.ok) {
        throw new Error(`Screener failed with status ${response.status}`);
      }

      const data = await response.json();
      setResults(data.matches || []);
      setHasScanned(true);
    } catch (err) {
      console.error(err);
      setScanError(err.message || 'Scan failed. Ensure backend server is running.');
    } finally {
      setScanning(false);
    }
  };

  const handleSelectResult = (symbol) => {
    onLoadStockToActiveViewport(symbol);
    triggerNotification(`Loaded ${symbol.replace('NSE:', '').replace('-EQ', '')} to active viewport!`);
  };

  return (
    <div className="flex flex-col h-full bg-[#090c15] border-r border-slate-800 text-slate-200">
      
      {/* 1. Screener Sidebar Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListFilter className="text-[#38bdf8]" size={20} />
          <h2 className="font-outfit font-bold text-lg text-slate-100 uppercase tracking-wide">
            Quick Screener
          </h2>
        </div>
        {notification && (
          <div className="flex items-center gap-1 text-[10px] bg-[#26a69a]/20 border border-[#26a69a]/40 text-[#26a69a] px-2 py-0.5 rounded-full animate-bounce">
            <CheckCircle size={10} />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* 2. Scrollable Body containing configurations */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        
        {/* Dynamic Watchlist Manager */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <Layers size={14} /> WATCHLISTS ({watchlist.length}/{MAX_WATCHLIST_SIZE})
            </span>
            {watchlist.length > 0 && (
              <button
                onClick={handleClearWatchlist}
                className="text-red-400 hover:text-red-300 flex items-center gap-0.5 text-[10px] transition-colors"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-1">
            {watchlists.map(list => (
              <button
                key={list.id}
                onClick={() => setActiveWatchlistId(list.id)}
                className={`rounded border px-1 py-1 text-[9px] font-bold transition-all ${
                  activeWatchlistId === list.id
                    ? 'bg-[#38bdf8] border-[#38bdf8] text-[#0f1422]'
                    : 'bg-[#12192c] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={`${list.name}: ${list.symbols.length} stocks`}
              >
                {list.name}
                <span className="block font-mono text-[9px]">{list.symbols.length}</span>
              </button>
            ))}
          </div>

          {/* Quick presets buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {Object.keys(PRESETS).map(name => (
              <button
                key={name}
                onClick={() => handleLoadPreset(name)}
                className="text-[9px] bg-[#12192c] hover:bg-[#1a233d] border border-slate-800 text-slate-400 hover:text-slate-300 px-2 py-1 rounded transition-all"
              >
                {name}
              </button>
            ))}
          </div>

          {/* Add ticker form */}
          <form onSubmit={handleAddTicker} className="flex gap-1">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="Search/add ticker (e.g. INFY, NSE:TCS-EQ)"
              className="flex-1 bg-[#0f1422] border border-slate-800 focus:border-[#38bdf8] outline-none rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 transition-colors"
            />
            <button
              type="submit"
              className="bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 rounded flex items-center justify-center transition-all"
            >
              <Plus size={16} />
            </button>
          </form>

          <div className="flex flex-col gap-1">
            <textarea
              value={bulkTickers}
              onChange={(e) => setBulkTickers(e.target.value)}
              placeholder="Paste stock list here: RELIANCE, TCS, INFY or one symbol per line"
              className="bg-[#0f1422] border border-slate-800 focus:border-[#38bdf8] outline-none rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 transition-colors h-20 resize-none"
            />
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={!bulkTickers.trim() || watchlist.length >= MAX_WATCHLIST_SIZE}
              className="bg-[#12192c] hover:bg-[#182035] border border-slate-800 text-slate-300 px-3 py-1 rounded flex items-center justify-center gap-1.5 text-[10px] font-semibold transition-all disabled:opacity-50"
            >
              <ClipboardList size={12} />
              Add pasted list to {activeWatchlist.name}
            </button>
          </div>

          {/* Watchlist Tags Stream */}
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-[#080b12] rounded border border-slate-900">
            {watchlist.length === 0 ? (
              <span className="text-[10px] text-slate-600 italic">No tickers in {activeWatchlist.name}. Select a preset, search/add, or paste a stock list.</span>
            ) : (
              watchlist.map(ticker => (
                <div
                  key={ticker}
                  className="inline-flex items-center gap-1 bg-[#121829] hover:bg-[#182035] border border-slate-800/80 px-2 py-0.5 rounded-full text-[10px] text-slate-300 transition-all font-mono"
                >
                  <span>{ticker}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTicker(ticker)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Global Renko Settings */}
        <div className="glass-card flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Sliders size={14} className="text-[#38bdf8]" /> GLOBAL RENKO SETTINGS
          </span>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Sizing Model dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500">Sizing Model</label>
              <select
                value={globalSizeType}
                onChange={(e) => setGlobalSizeType(e.target.value)}
                className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none cursor-pointer hover:border-slate-700"
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Points</option>
                <option value="atr">ATR (Volatility)</option>
              </select>
            </div>

            {/* Sizing Value input */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500">
                {globalSizeType === 'percent' ? 'Percent value (%)' : globalSizeType === 'fixed' ? 'Point size' : 'ATR Period'}
              </label>
              <input
                type="number"
                step="0.05"
                value={globalBrickSize}
                onChange={(e) => setGlobalBrickSize(parseFloat(e.target.value) || 1)}
                className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none w-full"
              />
            </div>
          </div>
        </div>

        {/* Screener Filters */}
        <div className="glass-card flex flex-col gap-3">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <ListFilter size={14} className="text-[#38bdf8]" /> SCAN CONDITIONS
          </span>

          {/* Timeframe dropdown */}
          <div className="flex flex-col gap-1 text-xs">
            <label className="text-[10px] text-slate-500">Scan Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none cursor-pointer"
            >
              <option value="1m">1 minute (Scalping)</option>
              <option value="3m">3 minutes</option>
              <option value="5m">5 minutes (Day trading)</option>
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes</option>
              <option value="125m">125 minutes</option>
              <option value="H">Hourly (H)</option>
              <option value="4h">4 hours</option>
              <option value="1D">1 Day (Positional)</option>
              <option value="W">Weekly (W)</option>
              <option value="M">Monthly (M)</option>
              <option value="Y">Yearly (Y)</option>
            </select>
          </div>

          {/* Condition Select */}
          <div className="flex flex-col gap-1 text-xs">
            <label className="text-[10px] text-slate-500">Technical Pattern</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none cursor-pointer"
            >
              <option value="reversal">Trend Brick Reversal (Red ➔ Green)</option>
              <option value="consecutive">Consecutive Bricks Cues</option>
              <option value="ema_crossover">EMA Crossovers on Bricks</option>
              <option value="breakout">Resistance / Support Breakout</option>
            </select>
          </div>

          {/* Conditional Input Parameters */}
          {condition === 'consecutive' && (
            <div className="flex flex-col gap-1 text-xs">
              <label className="text-[10px] text-slate-500">Consecutive brick count</label>
              <input
                type="number"
                min="2"
                max="10"
                value={consecutiveCount}
                onChange={(e) => setConsecutiveCount(parseInt(e.target.value) || 3)}
                className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none"
              />
            </div>
          )}

          {condition === 'ema_crossover' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Fast EMA</label>
                <input
                  type="number"
                  min="2"
                  value={emaFast}
                  onChange={(e) => setEmaFast(parseInt(e.target.value) || 9)}
                  className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500">Slow EMA</label>
                <input
                  type="number"
                  min="5"
                  value={emaSlow}
                  onChange={(e) => setEmaSlow(parseInt(e.target.value) || 21)}
                  className="bg-[#12192c] text-slate-300 rounded p-1.5 border border-slate-800 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Scan Actions */}
        <button
          onClick={handleRunScan}
          disabled={scanning}
          className="btn-primary w-full justify-center py-2.5 text-xs font-semibold select-none"
        >
          {scanning ? (
            <>
              <RefreshCw className="animate-spin" size={16} /> Scanning Tickers...
            </>
          ) : (
            <>
              <Play fill="currentColor" size={12} /> RUN AUTOMATED SCAN
            </>
          )}
        </button>

        {/* Scan Error Message */}
        {scanError && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 text-red-400 rounded text-[11px] leading-relaxed">
            {scanError}
          </div>
        )}
      </div>

      {/* 3. Bottom Section: Results panel */}
      <div className="border-t border-slate-800 bg-[#07090e] p-4 flex flex-col h-[320px]">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
          <span>SCAN RESULTS</span>
          <span className="bg-[#1e293b] text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
            {results.length} Matches
          </span>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
          {!hasScanned && !scanning && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <HelpCircle className="text-slate-600 mb-1" size={24} />
              <span className="text-[10px] text-slate-500">No active scans. Setup watchlist and parameters, then click scan.</span>
            </div>
          )}

          {scanning && (
            <div className="h-full flex flex-col items-center justify-center p-4">
              <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden relative mb-2">
                <div className="absolute inset-0 bg-[#38bdf8] animate-[loading_1.5s_infinite_linear]" style={{ width: '40%' }} />
              </div>
              <span className="text-[10px] text-slate-500 italic">Processing brick math...</span>
            </div>
          )}

          {hasScanned && results.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <X className="text-slate-600 mb-1" size={24} />
              <span className="text-[10px] text-slate-500">No stocks matched the selected criteria in this timeframe. Try a different pattern or symbol list.</span>
            </div>
          )}

          {hasScanned && results.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSelectResult(item.symbol)}
              className={`p-2.5 rounded border border-slate-850 hover:border-slate-700 bg-[#0f1422]/60 hover:bg-[#12192c] cursor-pointer flex items-center justify-between transition-all group`}
            >
              <div className="flex flex-col gap-1 min-w-0">
                {/* Ticker Name */}
                <div className="flex items-center gap-1.5">
                  <span className="font-outfit font-bold text-slate-200 text-xs uppercase group-hover:text-[#38bdf8] transition-colors">
                    {item.symbol.replace('NSE:', '').replace('-EQ', '')}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    ₹{item.currentPrice.toFixed(2)}
                  </span>
                </div>
                {/* Technical detail */}
                <span className="text-[10px] text-slate-400 truncate leading-none">
                  {item.detail}
                </span>
              </div>

              {/* Right: Direction and mini bricks stream */}
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                  item.direction === 'bullish' 
                    ? 'bg-[#26a69a]/15 text-[#26a69a]' 
                    : 'bg-[#ef5350]/15 text-[#ef5350]'
                }`}>
                  {item.direction === 'bullish' ? '▲ BUY' : '▼ SELL'}
                </span>
                
                {/* Mini Bricks visualization */}
                <div className="flex gap-0.5">
                  {item.recentBricks.map((color, bIdx) => (
                    <div
                      key={bIdx}
                      className={`w-2.5 h-1.5 rounded-sm ${
                        color === 'green' ? 'bg-[#26a69a]' : 'bg-[#ef5350]'
                      }`}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
