import React, { useEffect, useRef, useState } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import { Search, Info, Calendar, RefreshCw, Bell, BellRing, Plus, X, Volume2, Crosshair } from 'lucide-react';

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '125m', 'H', '4h', '1D', 'W', 'M', 'Y'];
const STOCK_SUGGESTIONS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL', 'ITC', 'LTIM', 'KOTAKBANK',
  'AXISBANK', 'BAJFINANCE', 'HINDUNILVR', 'MARUTI', 'SUNPHARMA', 'TITAN', 'WIPRO', 'ULTRACEMCO', 'ASIANPAINT',
  'NTPC', 'POWERGRID', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'ONGC', 'COALINDIA', 'ADANIENT', 'ADANIPORTS',
  'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'TATAMOTORS', 'NESTLEIND', 'BRITANNIA', 'GRASIM',
  'TECHM', 'HCLTECH', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BAJAJFINSV', 'SBILIFE', 'HDFCLIFE'
];

function normalizeChartSymbol(input) {
  const clean = input.trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  if (!clean) return '';
  if (clean.includes(':')) return clean.includes('-') ? clean : `${clean}-EQ`;
  return `NSE:${clean}-EQ`;
}

function getTickerName(symbol) {
  return symbol.replace('NSE:', '').replace('-EQ', '');
}

export default function TradingViewChart({
  chartId,
  symbol,
  timeframe,
  chartType,
  brickSize,
  sizeType,
  active,
  onSelect,
  onUpdateViewport,
  theme
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const previousPriceRef = useRef(null);
  const audioContextRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [metaInfo, setMetaInfo] = useState({ brickVal: 0, lastPrice: 0 });
  const [chartData, setChartData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [alertPriceInput, setAlertPriceInput] = useState('');
  const [alertDirection, setAlertDirection] = useState('above');
  const [lastTriggeredAlert, setLastTriggeredAlert] = useState(null);
  const [isPlacingAlert, setIsPlacingAlert] = useState(false);
  const [alertPreview, setAlertPreview] = useState(null);
  const [chartAlertMenu, setChartAlertMenu] = useState(null);

  const latestPrice = chartData.length ? Number(chartData[chartData.length - 1].close) : 0;
  const searchMatches = searchInput.trim()
    ? STOCK_SUGGESTIONS
        .filter(item => item.includes(searchInput.trim().toUpperCase()))
        .slice(0, 8)
    : STOCK_SUGGESTIONS.slice(0, 6);

  // Fetch chart data (candles or renko bricks)
  useEffect(() => {
    let activeRequest = true;
    let refreshTimer = null;
    
    async function loadData({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      
      try {
        const url = chartType === 'renko'
          ? `/api/renko?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&brickSize=${brickSize}&sizeType=${sizeType}`
          : `/api/fyers/history?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`;
          
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        
        if (!activeRequest) return;
        
        let fetchedData = [];
        if (chartType === 'renko') {
          fetchedData = data.bricks || [];
          
          // Calculate the actual brick size value in price points
          if (fetchedData.length > 0) {
            const firstBrick = fetchedData[0];
            const sizeVal = Math.abs(firstBrick.close - firstBrick.open);
            setMetaInfo({
              brickVal: sizeVal,
              lastPrice: fetchedData[fetchedData.length - 1].close
            });
          }
        } else {
          fetchedData = data.candles || [];
          if (fetchedData.length > 0) {
            setMetaInfo({
              brickVal: 0,
              lastPrice: fetchedData[fetchedData.length - 1].close
            });
          }
        }
        
        if (fetchedData.length === 0) {
          throw new Error('No data available for this selection');
        }
        
        setChartData(fetchedData);
      } catch (err) {
        if (activeRequest) {
          console.error(`Chart load error for ${symbol}:`, err);
          setError(err.message || 'Failed to fetch data');
          setChartData([]);
        }
      } finally {
        if (activeRequest && !silent) setLoading(false);
      }
    }

    loadData();
    if (!['W', 'M', 'Y'].includes(timeframe)) {
      refreshTimer = setInterval(() => loadData({ silent: true }), 15000);
    }

    return () => {
      activeRequest = false;
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [symbol, timeframe, chartType, brickSize, sizeType]);

  // Handle rendering when data or theme changes
  useEffect(() => {
    if (chartData && chartData.length > 0) {
      renderChart(chartData);
    }
    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {}
        chartRef.current = null;
      }
    };
  }, [chartData, chartType, theme, alerts, isPlacingAlert, alertDirection]);

  useEffect(() => {
    if (!isPlacingAlert) {
      setAlertPreview(null);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsPlacingAlert(false);
        setAlertPreview(null);
        setChartAlertMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlacingAlert]);

  useEffect(() => {
    previousPriceRef.current = latestPrice || null;
  }, [symbol, timeframe, chartType, brickSize, sizeType]);

  useEffect(() => {
    if (!latestPrice || alerts.length === 0) return;

    const previousPrice = previousPriceRef.current;
    if (!previousPrice) {
      previousPriceRef.current = latestPrice;
      return;
    }

    const triggered = alerts.find(alert => {
      if (!alert.active || alert.triggered) return false;
      return alert.direction === 'above'
        ? previousPrice < alert.price && latestPrice >= alert.price
        : previousPrice > alert.price && latestPrice <= alert.price;
    });

    if (triggered) {
      playAlertSound();
      setLastTriggeredAlert(triggered);
      setAlerts(prev => prev.map(alert => (
        alert.id === triggered.id ? { ...alert, triggered: true, active: false } : alert
      )));
    }

    previousPriceRef.current = latestPrice;
  }, [latestPrice, alerts]);

  // Handle Lightweight Chart construction and updates
  const getThemeChartColors = (themeName) => {
    switch (themeName) {
      case 'warm-forest':
        return {
          bg: '#151c18',
          text: '#a3b899',
          grid: 'rgba(163, 184, 153, 0.04)',
          border: 'rgba(163, 184, 153, 0.08)',
          upColor: '#34d399',      // bright emerald
          downColor: '#f87171',    // soft coral/rose red
          wickUpColor: '#34d399',
          wickDownColor: '#f87171'
        };
      case 'nordic-charcoal':
        return {
          bg: '#1a1b22',
          text: '#a9b1d6',
          grid: 'rgba(169, 177, 214, 0.04)',
          border: 'rgba(169, 177, 214, 0.08)',
          upColor: '#2ec4b6',      // clean modern teal
          downColor: '#ff5a5f',    // soft crimson
          wickUpColor: '#2ec4b6',
          wickDownColor: '#ff5a5f'
        };
      case 'classic-light':
        return {
          bg: '#ffffff',
          text: '#475569',
          grid: 'rgba(15, 23, 42, 0.04)',
          border: 'rgba(15, 23, 42, 0.08)',
          upColor: '#0f766e',      // dark teal for light mode (easy on eyes)
          downColor: '#be123c',    // rose red for light mode (easy on eyes)
          wickUpColor: '#0f766e',
          wickDownColor: '#be123c'
        };
      case 'cyber-obsidian':
      default:
        return {
          bg: '#0f1422',
          text: '#94a3b8',
          grid: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.07)',
          upColor: '#26a69a',      // cyber teal
          downColor: '#ef5350',    // cyber rose red
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350'
        };
    }
  };

  const renderChart = (data) => {
    if (!chartContainerRef.current) return;

    // 1. Clean container and destroy old chart to prevent memory leaks
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        console.error("Error removing old chart:", e);
      }
      chartRef.current = null;
    }
    chartContainerRef.current.innerHTML = '';
    
    const themeColors = getThemeChartColors(theme);

    // 2. Setup Chart Options
    const chartOptions = {
      layout: {
        background: { type: 'solid', color: themeColors.bg },
        textColor: themeColors.text,
        fontSize: 11,
        fontFamily: 'Inter, sans-serif'
      },
      grid: {
        vertLines: { color: themeColors.grid },
        horzLines: { color: themeColors.grid }
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: theme === 'classic-light' ? '#0284c7' : '#38bdf8',
          width: 1,
          style: 3, // dashed
          labelBackgroundColor: theme === 'classic-light' ? '#334155' : '#1e293b'
        },
        horzLine: {
          color: theme === 'classic-light' ? '#0284c7' : '#38bdf8',
          width: 1,
          style: 3, // dashed
          labelBackgroundColor: theme === 'classic-light' ? '#334155' : '#1e293b'
        }
      },
      priceScale: {
        borderColor: themeColors.border
      },
      timeScale: {
        borderColor: themeColors.border,
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: true,
      handleScale: true
    };

    // For Renko charts, we map timestamps to sequential daily increments, so tick labels look cleaner as simple indices
    // or let it auto format standard dates
    if (chartType === 'renko') {
      chartOptions.timeScale.tickMarkFormatter = () => ''; // Hide X axis dates since Renko is not time based
    }

    const chart = createChart(chartContainerRef.current, chartOptions);
    chartRef.current = chart;

    // 3. Add Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: themeColors.upColor,
      downColor: themeColors.downColor,
      borderVisible: false,
      wickVisible: chartType === 'candle', // wicks invisible for Renko bricks
      wickUpColor: themeColors.wickUpColor,
      wickDownColor: themeColors.wickDownColor
    });
    
    // Map data fields to lightweight charts structure
    const formattedData = data.map(item => ({
      time: item.time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      // custom fields stored for tooltip
      originalTime: item.originalTime,
      color: item.color
    }));

    candleSeries.setData(formattedData);
    seriesRef.current = candleSeries;

    alerts.forEach(alert => {
      candleSeries.createPriceLine({
        price: alert.price,
        color: alert.triggered ? '#fbbf24' : alert.direction === 'above' ? '#38bdf8' : '#f472b6',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${alert.direction === 'above' ? 'Alert >=' : 'Alert <='} ${alert.price.toFixed(2)}`
      });
    });

    chart.subscribeClick((param) => {
      if (!param.point) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (!Number.isFinite(price) || price <= 0) return;

      if (param.sourceEvent?.shiftKey) {
        const direction = price >= latestPrice ? 'above' : 'below';
        createAlert(price, direction);
        setChartAlertMenu(null);
        return;
      }

      if (!isPlacingAlert) return;

      createAlert(price, alertDirection);
      setIsPlacingAlert(false);
      setAlertPreview(null);
      setChartAlertMenu(null);
      setShowAlertPanel(true);
    });

    // Fit content
    chart.timeScale().fitContent();

    // 4. Hook Crosshair Hover logic to update custom overlay legend
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        if (isPlacingAlert) setAlertPreview(null);
        // Set fallback to last bar
        const lastBar = formattedData[formattedData.length - 1];
        setHoverData({
          open: lastBar.open,
          high: lastBar.high,
          low: lastBar.low,
          close: lastBar.close,
          color: lastBar.color,
          time: lastBar.originalTime || lastBar.time
        });
      } else {
        if (isPlacingAlert) {
          const previewPrice = candleSeries.coordinateToPrice(param.point.y);
          const containerTop = chartContainerRef.current?.offsetTop || 0;
          if (Number.isFinite(previewPrice) && previewPrice > 0) {
            setAlertPreview({
              y: containerTop + param.point.y,
              price: previewPrice
            });
          }
        }

        const dataPoint = param.seriesData.get(candleSeries);
        if (dataPoint) {
          const matchedItem = formattedData.find(d => d.time === param.time);
          setHoverData({
            open: dataPoint.open,
            high: dataPoint.high,
            low: dataPoint.low,
            close: dataPoint.close,
            color: matchedItem?.color || (dataPoint.close >= dataPoint.open ? 'green' : 'red'),
            time: matchedItem?.originalTime || dataPoint.time
          });
        }
      }
    });

    // Set initial legend value to last bar
    const lastBar = formattedData[formattedData.length - 1];
    setHoverData({
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
      color: lastBar.color,
      time: lastBar.originalTime || lastBar.time
    });

    // 5. Setup ResizeObserver to support dynamic splitting grid reflows
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    
    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      chartRef.current.applyOptions({ width, height });
    });
    
    resizeObserverRef.current.observe(chartContainerRef.current);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadSearchSymbol(searchInput);
  };

  const loadSearchSymbol = (value) => {
    const normalizedSymbol = normalizeChartSymbol(value);
    if (!normalizedSymbol) return;
    onUpdateViewport(chartId, { symbol: normalizedSymbol });
    setIsSearching(false);
    setSearchInput('');
  };

  const ensureAudioContext = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const playAlertSound = () => {
    const context = ensureAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
  };

  const createAlert = (price, direction) => {
    ensureAudioContext();
    setAlerts(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        price,
        direction,
        active: true,
        triggered: false,
        createdAt: Date.now()
      }
    ]);
  };

  const handleAddAlert = (e) => {
    e.preventDefault();
    const price = Number(alertPriceInput || latestPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    createAlert(price, alertDirection);
    setAlertPriceInput('');
    setShowAlertPanel(true);
  };

  const handleRemoveAlert = (id) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const handleToggleAlert = (id) => {
    setAlerts(prev => prev.map(alert => (
      alert.id === id ? { ...alert, active: !alert.active, triggered: false } : alert
    )));
  };

  const handleUseLastPrice = () => {
    if (latestPrice) setAlertPriceInput(latestPrice.toFixed(2));
  };

  const handleChartContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!chartContainerRef.current || !seriesRef.current) return;

    const bounds = chartContainerRef.current.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    const x = event.clientX - bounds.left;
    const price = seriesRef.current.coordinateToPrice(y);
    if (!Number.isFinite(price) || price <= 0) return;

    setIsPlacingAlert(false);
    setAlertPreview(null);
    setShowAlertPanel(false);
    setChartAlertMenu({
      x: chartContainerRef.current.offsetLeft + x,
      y: chartContainerRef.current.offsetTop + y,
      price
    });
  };

  const addChartMenuAlert = (direction) => {
    if (!chartAlertMenu) return;
    createAlert(chartAlertMenu.price, direction);
    setChartAlertMenu(null);
  };

  const startAlertPlacement = () => {
    ensureAudioContext();
    setShowAlertPanel(false);
    setIsPlacingAlert(true);
    setAlertPreview(null);
  };

  const getFormattedDate = (epochSec) => {
    if (!epochSec) return '-';
    // If epoch looks like standard daily time index, render simple index
    if (chartType === 'renko' && String(epochSec).length < 7) {
      return `Brick #${epochSec}`;
    }
    const d = new Date(epochSec * 1000);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <div
      onClick={() => {
        onSelect(chartId);
        setChartAlertMenu(null);
      }}
      className={`glass-panel flex flex-col h-full relative border rounded-xl overflow-hidden transition-all duration-200 bg-[#0f1422] ${
        active 
          ? 'border-[#38bdf8] shadow-[0_0_15px_rgba(56,189,248,0.15)] z-10' 
          : 'border-slate-800'
      }`}
      style={{ minHeight: '220px', cursor: isPlacingAlert ? 'crosshair' : 'default' }}
    >
      {/* Top Controller Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12192c]/80 border-b border-slate-800/80 z-20 flex-wrap gap-2 text-xs">
        {/* Left: Ticker display and Search Input */}
        <div className="flex items-center gap-2">
          {isSearching ? (
            <form onSubmit={handleSearchSubmit} className="flex items-center relative">
              <input
                autoFocus
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsSearching(false);
                    setSearchInput('');
                  }
                }}
                placeholder="Search symbol"
                className="bg-[#1e293b] text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 outline-none w-36 focus:border-[#38bdf8]"
              />
              <button type="submit" className="absolute right-1 text-[#38bdf8] hover:text-white">
                <Search size={12} />
              </button>
              <div className="absolute top-8 left-0 z-40 w-[520px] max-w-[calc(100vw-360px)] bg-[#0b1020]/95 border border-slate-800 rounded-lg shadow-2xl backdrop-blur-md p-1 flex gap-1 overflow-x-auto">
                {searchMatches.map(item => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      loadSearchSymbol(item);
                    }}
                    className="flex-shrink-0 px-2 py-1 rounded text-[10px] text-slate-200 hover:bg-[#182035] flex items-center gap-1 border border-slate-800/60"
                  >
                    <span className="font-bold">{item}</span>
                    <span className="text-[9px] text-slate-500 font-mono">NSE</span>
                  </button>
                ))}
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-bold text-slate-200 font-outfit uppercase tracking-wide">
                {getTickerName(symbol)}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({symbol})
              </span>
              <button
                onClick={() => setIsSearching(true)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="Search Ticker"
              >
                <Search size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Center/Right: Layout Controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
          {/* Alert Builder */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPlacingAlert) {
                setIsPlacingAlert(false);
                setAlertPreview(null);
                return;
              }
              setShowAlertPanel(prev => !prev);
              handleUseLastPrice();
            }}
            className={`relative p-1 rounded border transition-colors ${
              showAlertPanel || isPlacingAlert
                ? 'bg-[#38bdf8] text-[#0f1422] border-[#38bdf8]'
                : 'bg-[#1e293b] text-slate-300 border-slate-800 hover:border-[#38bdf8] hover:text-white'
            }`}
            title={isPlacingAlert ? 'Cancel alert placement' : 'Price alerts'}
          >
            {isPlacingAlert ? <Crosshair size={12} /> : <Bell size={12} />}
            {alerts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 rounded-full bg-[#fbbf24] text-[#0f1422] text-[8px] font-black flex items-center justify-center px-0.5">
                {alerts.length}
              </span>
            )}
          </button>

          {/* Candle/Renko Toggle */}
          <div className="flex bg-[#1e293b] rounded p-0.5 border border-slate-800">
            <button
              onClick={() => onUpdateViewport(chartId, { chartType: 'candle' })}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                chartType === 'candle'
                  ? 'bg-[#38bdf8] text-[#0f1422] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Candle
            </button>
            <button
              onClick={() => onUpdateViewport(chartId, { chartType: 'renko' })}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                chartType === 'renko'
                  ? 'bg-[#38bdf8] text-[#0f1422] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Renko
            </button>
          </div>

          {/* Timeframe Select */}
          <select
            value={timeframe}
            onChange={(e) => onUpdateViewport(chartId, { timeframe: e.target.value })}
            className="bg-[#1e293b] text-slate-300 text-[10px] rounded px-1 py-0.5 border border-slate-800 outline-none cursor-pointer hover:border-slate-700 focus:border-[#38bdf8]"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Dynamic Overlay HUD Legend */}
      <div className="absolute top-16 left-3 z-20 pointer-events-none font-mono text-[10px] flex flex-col gap-0.5 bg-[#0f1422]/90 p-2 rounded-lg border border-slate-800/60 backdrop-blur-sm shadow-md">
        {hoverData && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-slate-400 font-sans font-semibold mb-1">
              <span>{chartType === 'renko' ? 'RENKO BRICK' : 'CANDLE'}</span>
              <span className={`text-[9px] px-1 rounded uppercase font-bold ${
                hoverData.color === 'green' ? 'bg-[#26a69a]/20 text-[#26a69a]' : 'bg-[#ef5350]/20 text-[#ef5350]'
              }`}>
                {hoverData.color}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300">
              <div>O: <span className="text-slate-100 font-bold">{hoverData.open?.toFixed(2)}</span></div>
              <div>H: <span className="text-slate-100 font-bold">{hoverData.high?.toFixed(2)}</span></div>
              <div>L: <span className="text-slate-100 font-bold">{hoverData.low?.toFixed(2)}</span></div>
              <div>C: <span className={`font-bold ${hoverData.color === 'green' ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>{hoverData.close?.toFixed(2)}</span></div>
            </div>
            <div className="text-slate-500 font-sans text-[9px] mt-1 flex items-center gap-1 border-t border-slate-800/80 pt-1">
              <Calendar size={10} />
              <span>{getFormattedDate(hoverData.time)}</span>
            </div>
          </div>
        )}

        {chartType === 'renko' && metaInfo.brickVal > 0 && (
          <div className="text-[9px] text-slate-500 mt-1.5 flex items-center gap-1 font-sans border-t border-slate-800/40 pt-1">
            <Info size={10} className="text-[#38bdf8]" />
            <span>Brick: <strong className="text-slate-300">{metaInfo.brickVal.toFixed(2)}</strong> ({sizeType === 'percent' ? `${brickSize}%` : sizeType})</span>
          </div>
        )}
      </div>

      {/* Alert Manager */}
      {showAlertPanel && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-11 right-3 z-30 w-72 bg-[#0b1020]/95 border border-slate-800 rounded-lg shadow-2xl backdrop-blur-md p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-slate-100 text-xs font-bold uppercase tracking-wide">
              <BellRing size={13} className="text-[#38bdf8]" />
              Price Alerts
            </div>
            <button
              onClick={() => setShowAlertPanel(false)}
              className="text-slate-500 hover:text-white p-0.5"
              title="Close alerts"
            >
              <X size={13} />
            </button>
          </div>

          <form onSubmit={handleAddAlert} className="grid grid-cols-[1fr_auto_auto] gap-1.5 mb-2">
            <input
              type="number"
              step="0.05"
              min="0"
              value={alertPriceInput}
              onChange={(e) => setAlertPriceInput(e.target.value)}
              placeholder={latestPrice ? latestPrice.toFixed(2) : 'Price'}
              className="bg-[#12192c] border border-slate-800 focus:border-[#38bdf8] outline-none rounded px-2 py-1 text-xs text-slate-100"
            />
            <select
              value={alertDirection}
              onChange={(e) => setAlertDirection(e.target.value)}
              className="bg-[#12192c] border border-slate-800 focus:border-[#38bdf8] outline-none rounded px-1 py-1 text-[10px] text-slate-300"
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <button
              type="submit"
              className="bg-[#38bdf8] hover:bg-sky-300 text-[#0f1422] rounded px-2 flex items-center justify-center"
              title="Add alert"
            >
              <Plus size={13} />
            </button>
          </form>

          <button
            type="button"
            onClick={playAlertSound}
            className="mb-2 w-full bg-[#12192c] hover:bg-[#182035] border border-slate-800 text-slate-300 rounded px-2 py-1 text-[10px] font-semibold flex items-center justify-center gap-1.5"
            title="Test alert sound"
          >
            <Volume2 size={11} />
            Test sound
          </button>

          <button
            type="button"
            onClick={startAlertPlacement}
            className={`mb-2 w-full border rounded px-2 py-1 text-[10px] font-semibold flex items-center justify-center gap-1.5 ${
              isPlacingAlert
                ? 'bg-[#38bdf8] border-[#38bdf8] text-[#0f1422]'
                : 'bg-[#12192c] hover:bg-[#182035] border-slate-800 text-slate-300'
            }`}
            title="Click the chart to place an alert"
          >
            <Crosshair size={11} />
            {isPlacingAlert ? 'Click chart level' : 'Place by click'}
          </button>

          <div className="max-h-36 overflow-y-auto flex flex-col gap-1">
            {alerts.length === 0 ? (
              <div className="text-[10px] text-slate-500 text-center border border-dashed border-slate-800 rounded py-3">
                No alerts on this chart
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 ${
                    alert.triggered
                      ? 'bg-amber-400/10 border-amber-400/30'
                      : alert.active
                        ? 'bg-[#12192c] border-slate-800'
                        : 'bg-slate-950/50 border-slate-900 opacity-70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleAlert(alert.id)}
                    className="flex-1 text-left"
                    title={alert.active ? 'Pause alert' : 'Enable alert'}
                  >
                    <div className="text-[10px] text-slate-400 uppercase font-bold">
                      {alert.direction === 'above' ? 'Above' : 'Below'} {alert.triggered ? 'Triggered' : alert.active ? 'Active' : 'Paused'}
                    </div>
                    <div className="text-xs text-slate-100 font-mono font-bold">{alert.price.toFixed(2)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveAlert(alert.id)}
                    className="text-slate-500 hover:text-[#ef5350] p-0.5"
                    title="Remove alert"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {isPlacingAlert && (
        <div className="absolute top-11 right-3 z-30 pointer-events-none bg-[#38bdf8] text-[#0f1422] rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide">
          <Crosshair size={12} />
          <span>{alertDirection === 'above' ? 'Above' : 'Below'} alert: click chart</span>
        </div>
      )}

      {isPlacingAlert && alertPreview && (
        <div
          className="absolute left-0 right-0 z-30 pointer-events-none"
          style={{ top: `${alertPreview.y}px` }}
        >
          <div className="border-t border-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.1)]" />
          <div className="absolute right-2 -top-3 bg-[#38bdf8] text-[#0f1422] rounded px-2 py-0.5 text-[10px] font-mono font-extrabold shadow-md">
            {alertPreview.price.toFixed(2)}
          </div>
        </div>
      )}

      {chartAlertMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 bg-[#0b1020]/95 border border-slate-800 rounded-lg shadow-2xl backdrop-blur-md p-2 w-44"
          style={{
            left: `${Math.min(chartAlertMenu.x, Math.max(8, (chartContainerRef.current?.clientWidth || 240) - 184))}px`,
            top: `${Math.max(48, chartAlertMenu.y - 8)}px`
          }}
        >
          <div className="px-2 pb-1.5 mb-1 border-b border-slate-800 text-[10px] text-slate-500 font-mono">
            {chartAlertMenu.price.toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => addChartMenuAlert('above')}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-[#182035] flex items-center gap-1.5"
            title="Add alert above this price"
          >
            <BellRing size={12} className="text-[#38bdf8]" />
            Alert above
          </button>
          <button
            type="button"
            onClick={() => addChartMenuAlert('below')}
            className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-[#182035] flex items-center gap-1.5"
            title="Add alert below this price"
          >
            <Bell size={12} className="text-[#38bdf8]" />
            Alert below
          </button>
        </div>
      )}

      {lastTriggeredAlert && (
        <div className="absolute bottom-3 left-3 z-30 bg-amber-400 text-[#0f1422] rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 text-xs font-bold">
          <BellRing size={14} />
          <span>{symbol.replace('NSE:', '').replace('-EQ', '')} {lastTriggeredAlert.direction === 'above' ? 'above' : 'below'} {lastTriggeredAlert.price.toFixed(2)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLastTriggeredAlert(null);
            }}
            className="p-0.5 hover:bg-[#0f1422]/10 rounded"
            title="Dismiss alert"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Main Canvas Node */}
      <div 
        ref={chartContainerRef} 
        onContextMenu={handleChartContextMenu}
        className="flex-1 w-full h-full relative" 
        style={{ minHeight: '160px' }}
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#0f1422]/75 backdrop-blur-sm flex flex-col items-center justify-center z-30 transition-all">
          <RefreshCw className="animate-spin text-[#38bdf8] mb-2" size={24} />
          <span className="text-xs text-slate-400 font-medium">Retrieving chart data...</span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-[#0f1422]/90 flex flex-col items-center justify-center p-4 text-center z-30">
          <Info className="text-[#ef5350] mb-2" size={32} />
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Loading Failed</span>
          <span className="text-[11px] text-slate-400 max-w-xs mt-1 leading-relaxed">{error}</span>
          <button
            onClick={() => onUpdateViewport(chartId, { symbol })}
            className="mt-3 bg-[#1e293b] hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] px-3 py-1 rounded transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
}
