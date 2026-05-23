import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { 
  getAccessToken, 
  hasLiveFyersToken,
  getLoginUrl, 
  validateAuthCode, 
  fetchHistoricalData, 
  fetchQuoteData,
  saveAccessToken 
} from './fyers.js';
import { calculateRenko } from './renko.js';
import { runScreener } from './screener.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.join(__dirname, 'session.json');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 1. Connection Status Endpoint
app.get('/api/fyers/status', (req, res) => {
  const clientID = process.env.FYERS_CLIENT_ID;
  
  if (hasLiveFyersToken()) {
    // Return connection status details
    res.json({
      status: 'connected',
      clientID: clientID,
      isMock: false,
      message: 'Fyers API is authorized and active.'
    });
  } else {
    res.json({
      status: 'disconnected',
      clientID: clientID,
      isMock: true,
      message: 'Running in sandbox mode (mock data enabled). Please log in to connect your live Fyers account.'
    });
  }
});

// 1b. Real-time quote endpoint
app.get('/api/fyers/quote', async (req, res) => {
  const { symbols } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'Parameter symbols is required.' });
  }

  try {
    const quotes = await fetchQuoteData(String(symbols).split(','));
    res.json({ status: 'ok', count: quotes.length, quotes });
  } catch (error) {
    console.error('Quote request error:', error.message);
    res.status(401).json({ error: error.message });
  }
});

// 2. Start OAuth Login Redirect
app.get('/api/fyers/login', (req, res) => {
  const url = getLoginUrl();
  console.log('Redirecting user to Fyers OAuth Login:', url);
  res.redirect(url);
});

// 3. OAuth Callback Handler
app.get('/api/fyers/callback', async (req, res) => {
  const authCode = req.query.auth_code;
  const state = req.query.state;

  if (!authCode) {
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; background: #0f172a; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="background: #1e293b; padding: 2.5rem; border-radius: 12px; border: 1px solid #ef5350; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h1 style="color: #ef5350; margin-bottom: 1rem;">Authentication Failed</h1>
            <p>Authorization code was not provided in the query string.</p>
            <p style="color: #94a3b8; font-size: 0.875rem;">Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }

  console.log(`Received Fyers authorization code, validating token...`);
  const result = await validateAuthCode(authCode);

  if (result.success) {
    res.send(`
      <html>
        <body style="font-family: sans-serif; background: #0f172a; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="background: #1e293b; padding: 2.5rem; border-radius: 12px; border: 1px solid #26a69a; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h1 style="color: #26a69a; margin-bottom: 0.5rem; font-size: 2rem;">🚀 Connected Successfully!</h1>
            <h2 style="color: #38bdf8; margin-top: 0; font-weight: normal; font-size: 1.2rem;">Fyers API is authorized</h2>
            <p style="margin: 1.5rem 0; color: #cbd5e1; line-height: 1.6;">Your dynamic access token is stored safely. You can now close this window and return to your stock market screener.</p>
            <div style="display: inline-block; background: #26a69a; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.875rem; font-weight: bold; margin-bottom: 1rem;">Connected</div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.close();
                } else {
                  window.location.href = 'http://127.0.0.1:3000/';
                }
              }, 1800);
            </script>
          </div>
        </body>
      </html>
    `);
  } else {
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; background: #0f172a; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="background: #1e293b; padding: 2.5rem; border-radius: 12px; border: 1px solid #ef5350; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <h1 style="color: #ef5350; margin-bottom: 1rem;">Verification Failed</h1>
            <p style="color: #cbd5e1;">Error: ${result.error}</p>
            <p style="color: #94a3b8; font-size: 0.875rem; margin-top: 1.5rem;">Please close this tab and try logging in again.</p>
          </div>
        </body>
      </html>
    `);
  }
});

// 4. Clean Token / Logout Endpoint
app.get('/api/fyers/disconnect', (req, res) => {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
    console.log('Fyers account disconnected (session file removed)');
    res.json({ status: 'disconnected', message: 'Fyers credentials removed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Raw Candlestick History API
app.get('/api/fyers/history', async (req, res) => {
  const { symbol, timeframe } = req.query;
  
  if (!symbol || !timeframe) {
    return res.status(400).json({ error: 'Parameters symbol and timeframe are required.' });
  }

  try {
    const candles = await fetchHistoricalData(symbol, timeframe);
    res.json({ symbol, timeframe, count: candles.length, candles });
  } catch (error) {
    console.error('History request error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 6. Calculated Renko Bricks Endpoint
app.get('/api/renko', async (req, res) => {
  const { symbol, timeframe, brickSize, sizeType } = req.query;
  
  if (!symbol || !timeframe) {
    return res.status(400).json({ error: 'Parameters symbol and timeframe are required.' });
  }

  const bSize = brickSize ? parseFloat(brickSize) : 1;
  const sType = sizeType || 'percent'; // percent, fixed, atr

  try {
    const candles = await fetchHistoricalData(symbol, timeframe);
    if (!candles || candles.length === 0) {
      return res.status(404).json({ error: `No historical data found for ${symbol}` });
    }

    const bricks = calculateRenko(candles, bSize, sType);
    res.json({
      symbol,
      timeframe,
      brickSize: bSize,
      sizeType: sType,
      brickCount: bricks.length,
      bricks
    });
  } catch (error) {
    console.error('Renko fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 7. Screener Scanner API (POST)
app.post('/api/screener/scan', async (req, res) => {
  const { tickers, timeframe, brickSize, sizeType, condition, params } = req.body;
  
  if (!Array.isArray(tickers) || !timeframe || !condition) {
    return res.status(400).json({ error: 'Parameters tickers (array), timeframe, and condition are required.' });
  }

  const bSize = brickSize ? parseFloat(brickSize) : 1;
  const sType = sizeType || 'percent';

  console.log(`Screener: Scanning ${tickers.length} tickers on ${timeframe} for '${condition}'...`);
  
  try {
    const matches = await runScreener(tickers, timeframe, bSize, sType, condition, params || {});
    res.json({
      timeframe,
      brickSize: bSize,
      sizeType: sType,
      condition,
      matchCount: matches.length,
      matches
    });
  } catch (error) {
    console.error('Screener run error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Handle server startup
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Fyers Screener Server running at: http://127.0.0.1:${PORT}`);
  console.log(`===============================================`);
});
