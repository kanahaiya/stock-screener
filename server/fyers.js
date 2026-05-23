import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.join(__dirname, 'session.json');

// Helper to read active session token
export function getAccessToken() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      return data.access_token || '';
    }
  } catch (err) {
    console.error('Error reading session file:', err);
  }
  return process.env.FYERS_ACCESS_TOKEN || '';
}

export function hasLiveFyersToken() {
  const token = getAccessToken();
  return Boolean(token && token !== 'MOCK_TOKEN');
}

// Helper to save active session token
export function saveAccessToken(token) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ access_token: token, updatedAt: new Date().toISOString() }, null, 2));
    console.log('Successfully saved new access token to session.json');
  } catch (err) {
    console.error('Error writing session file:', err);
  }
}

// Generate the Fyers OAuth Login URL
export function getLoginUrl() {
  const clientID = process.env.FYERS_CLIENT_ID;
  const redirectURI = encodeURIComponent(process.env.FYERS_REDIRECT_URI);
  return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${clientID}&redirect_uri=${redirectURI}&response_type=code&state=dashboard`;
}

// Exchange Auth Code for Access Token
export async function validateAuthCode(authCode) {
  const clientID = process.env.FYERS_CLIENT_ID;
  const secretKey = process.env.FYERS_SECRET_KEY;
  
  // AppIdHash = SHA256 of (Client_ID + ":" + Secret_Key)
  const hash = crypto.createHash('sha256');
  hash.update(`${clientID}:${secretKey}`);
  const appIdHash = hash.digest('hex');
  
  try {
    const response = await axios.post('https://api-t1.fyers.in/api/v3/validate-authcode', {
      grant_type: 'authorization_code',
      appIdHash: appIdHash,
      code: authCode
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.s === 'ok') {
      const token = response.data.access_token;
      saveAccessToken(token);
      return { success: true, token };
    } else {
      return { success: false, error: response.data.message || 'Verification failed' };
    }
  } catch (error) {
    console.error('Error in validateAuthCode:', error.response?.data || error.message);
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

// Map standard timeframe names to Fyers resolution parameters
function mapTimeframeToResolution(tf) {
  const normalized = normalizeTimeframe(tf);
  const mapping = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '125m': '5',
    'H': '60',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '1D': 'D',
    'W': 'D',
    '1W': 'D',
    'M': 'D',
    '1M': 'D',
    'Y': 'D',
    '1Y': 'D'
  };
  return mapping[normalized] || 'D';
}

function normalizeTimeframe(tf = '') {
  const value = String(tf).trim();
  const upper = value.toUpperCase();

  if (upper === 'H' || upper === '1H') return 'H';
  if (upper === 'W' || upper === '1W') return 'W';
  if (upper === 'M' || upper === '1M') return 'M';
  if (upper === 'Y' || upper === '1Y') return 'Y';
  if (upper === 'D' || upper === '1D') return '1D';
  if (upper === '125M') return '125m';
  if (/^\d+M$/i.test(value)) return `${parseInt(value, 10)}m`;
  if (/^\d+H$/i.test(value)) return parseInt(value, 10) === 1 ? 'H' : `${parseInt(value, 10)}h`;

  return value;
}

function shouldAggregateTimeframe(tf) {
  return ['125m', 'W', 'M', 'Y'].includes(normalizeTimeframe(tf));
}

function getAggregationBucket(time, timeframe) {
  const normalized = normalizeTimeframe(timeframe);
  const date = new Date(time * 1000);

  if (normalized === '125m') {
    const interval = 125 * 60;
    return Math.floor(time / interval) * interval;
  }

  if (normalized === 'W') {
    const day = date.getUTCDay() || 7;
    const bucket = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    bucket.setUTCDate(bucket.getUTCDate() - day + 1);
    return Math.floor(bucket.getTime() / 1000);
  }

  if (normalized === 'M') {
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
  }

  if (normalized === 'Y') {
    return Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
  }

  return time;
}

function aggregateCandles(candles, timeframe) {
  if (!shouldAggregateTimeframe(timeframe)) return candles;

  const grouped = new Map();
  for (const candle of candles) {
    const bucket = getAggregationBucket(candle.time, timeframe);
    const current = grouped.get(bucket);

    if (!current) {
      grouped.set(bucket, { ...candle, time: bucket });
      continue;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume = (current.volume || 0) + (candle.volume || 0);
  }

  return Array.from(grouped.values()).sort((a, b) => a.time - b.time);
}

function applyQuoteToLatestCandle(candles, quote) {
  if (!quote || !Number.isFinite(quote.ltp) || candles.length === 0) return candles;

  const next = [...candles];
  const last = { ...next[next.length - 1] };
  last.close = quote.ltp;
  last.high = Math.max(last.high, quote.ltp);
  last.low = Math.min(last.low, quote.ltp);
  if (Number.isFinite(quote.volume)) last.volume = Math.max(last.volume || 0, quote.volume);
  next[next.length - 1] = last;
  return next;
}

// Format stock tickers to Fyers full symbols
export function formatSymbol(ticker) {
  let clean = ticker.trim().toUpperCase();
  // Strip common suffixes
  clean = clean.replace('.NS', '').replace('.BO', '');
  if (!clean.includes(':')) {
    // Default to NSE equities
    return `NSE:${clean}-EQ`;
  }
  return clean;
}

export async function fetchQuoteData(symbols) {
  const token = getAccessToken();
  const clientID = process.env.FYERS_CLIENT_ID;
  const symbolList = (Array.isArray(symbols) ? symbols : [symbols]).map(formatSymbol);

  if (!token || token === 'MOCK_TOKEN') {
    throw new Error('Fyers live token is not connected. Click CONNECT and complete Fyers login first.');
  }

  const response = await axios.get('https://api-t1.fyers.in/data/quotes', {
    headers: {
      Authorization: `${clientID}:${token}`
    },
    params: {
      symbols: symbolList.join(',')
    }
  });

  const rows = response.data?.d || response.data?.data || [];
  if (response.data?.s && response.data.s !== 'ok') {
    throw new Error(response.data.message || 'Fyers quotes request failed.');
  }

  return rows.map(row => {
    const v = row.v || row;
    return {
      symbol: row.n || row.symbol || v.symbol,
      ltp: Number(v.lp ?? v.ltp ?? v.last_price ?? v.lastPrice),
      open: Number(v.open_price ?? v.open ?? v.o),
      high: Number(v.high_price ?? v.high ?? v.h),
      low: Number(v.low_price ?? v.low ?? v.l),
      prevClose: Number(v.prev_close_price ?? v.prev_close ?? v.pc),
      change: Number(v.ch ?? v.change),
      changePercent: Number(v.chp ?? v.change_percent),
      volume: Number(v.volume ?? v.vol_traded_today ?? v.ttv),
      timestamp: Number(v.tt ?? v.timestamp ?? Math.floor(Date.now() / 1000))
    };
  });
}

// Fetch historical candles from Fyers (with realistic mock data generator fallback)
export async function fetchHistoricalData(symbol, timeframe) {
  const token = getAccessToken();
  const clientID = process.env.FYERS_CLIENT_ID;
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const resolution = mapTimeframeToResolution(normalizedTimeframe);
  const formattedSymbol = formatSymbol(symbol);
  
  // Define time range (e.g. last 1000 bars based on timeframe)
  const toDate = new Date();
  const fromDate = new Date();
  
  if (normalizedTimeframe === '125m') {
    // Pull enough 5-minute data to build useful 125-minute bars.
    fromDate.setDate(toDate.getDate() - 60);
  } else if (normalizedTimeframe.includes('m')) {
    fromDate.setDate(toDate.getDate() - 15);
  } else if (normalizedTimeframe.includes('h') || normalizedTimeframe === 'H') {
    // For hours, retrieve last 60 days
    fromDate.setDate(toDate.getDate() - 60);
  } else if (['W', 'M', 'Y'].includes(normalizedTimeframe)) {
    fromDate.setFullYear(toDate.getFullYear() - 5);
  } else {
    // For daily/weekly/monthly, retrieve last 365 days
    fromDate.setDate(toDate.getDate() - 365);
  }
  
  const formatDateStr = (date) => date.toISOString().split('T')[0];
  
  const rangeFrom = formatDateStr(fromDate);
  const rangeTo = formatDateStr(toDate);

  // If there's an active token, try fetching from real Fyers API
  if (token && token !== 'MOCK_TOKEN') {
    try {
      const response = await axios.get('https://api-t1.fyers.in/data/history', {
        headers: {
          'Authorization': `${clientID}:${token}`
        },
        params: {
          symbol: formattedSymbol,
          resolution: resolution,
          date_format: '1',
          range_from: rangeFrom,
          range_to: rangeTo,
          cont_flag: '0'
        }
      });

      if (response.data && response.data.s === 'ok' && Array.isArray(response.data.candles)) {
        const candles = response.data.candles.map(c => ({
          time: c[0], // Unix timestamp in seconds
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volume: Number(c[5])
        }));
        const aggregatedCandles = aggregateCandles(candles, normalizedTimeframe);
        if (!['W', 'M', 'Y'].includes(normalizedTimeframe)) {
          try {
            const [quote] = await fetchQuoteData([formattedSymbol]);
            return applyQuoteToLatestCandle(aggregatedCandles, quote);
          } catch (quoteError) {
            console.warn(`Fyers quote refresh failed for ${formattedSymbol}:`, quoteError.message);
          }
        }
        return aggregatedCandles;
      } else {
        console.warn(`Fyers API returned non-ok status for ${formattedSymbol}:`, response.data);
      }
    } catch (error) {
      console.error(`Fyers API history request failed for ${formattedSymbol}:`, error.response?.data || error.message);
    }
  }

  // Fallback to high-quality procedural mock data
  console.log(`Generating high-quality mock data for ${formattedSymbol} (${normalizedTimeframe})`);
  return generateMockCandles(formattedSymbol, normalizedTimeframe);
}

// Generate realistic mock stock data using a Geometric Brownian Motion random walk
function generateMockCandles(symbol, timeframe) {
  const candles = [];
  let count = 300; // Number of bars to return
  const now = Math.floor(Date.now() / 1000);
  
  let intervalSec = 86400; // default 1 day
  if (timeframe === '1m') intervalSec = 60;
  else if (timeframe === '3m') intervalSec = 180;
  else if (timeframe === '5m') intervalSec = 300;
  else if (timeframe === '15m') intervalSec = 900;
  else if (timeframe === '30m') intervalSec = 1800;
  else if (timeframe === '125m') intervalSec = 7500;
  else if (timeframe === 'H') intervalSec = 3600;
  else if (timeframe === '1h') intervalSec = 3600;
  else if (timeframe === '2h') intervalSec = 7200;
  else if (timeframe === '4h') intervalSec = 14400;
  else if (timeframe === 'W') intervalSec = 604800;
  else if (timeframe === 'M') intervalSec = 2592000;
  else if (timeframe === 'Y') intervalSec = 31536000;

  if (timeframe === 'W') count = 260;
  else if (timeframe === 'M') count = 120;
  else if (timeframe === 'Y') count = 20;

  // Derive a base price from the ticker letters to keep it consistent
  let basePrice = 500;
  const name = symbol.split(':')[1]?.split('-')[0] || 'STOCK';
  let charSum = 0;
  for (let i = 0; i < name.length; i++) charSum += name.charCodeAt(i);
  basePrice = 100 + (charSum % 10) * 150 + (charSum % 7) * 20;

  let currentPrice = basePrice;
  const volatility = 0.015; // 1.5% daily vol standard deviation

  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalSec;
    
    // Check if it's a weekend for daily bars to look realistic (skip weekends)
    if (intervalSec === 86400) {
      const date = new Date(time * 1000);
      const day = date.getDay();
      if (day === 0 || day === 6) continue; // Skip Saturday and Sunday
    }

    const changePercent = (Math.random() - 0.49) * volatility; // slight upward drift
    const open = currentPrice;
    const close = currentPrice * (1 + changePercent);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = Math.floor(50000 + Math.random() * 250000);

    candles.push({
      time: time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: volume
    });

    currentPrice = close;
  }
  
  return candles;
}
