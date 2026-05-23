import { fetchHistoricalData } from './fyers.js';
import { calculateRenko } from './renko.js';

// Helper to calculate EMA on values
function calculateEMA(values, period) {
  if (values.length < period) return Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const ema = [];
  
  // Initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      ema.push(null);
    } else if (i === period - 1) {
      ema.push(prevEma);
    } else {
      const currentEma = (values[i] - prevEma) * k + prevEma;
      ema.push(currentEma);
      prevEma = currentEma;
    }
  }
  return ema;
}

// Evaluate a stock against a specific Renko scanning condition
async function scanStock(symbol, timeframe, brickSize, sizeType, condition, params = {}) {
  try {
    const candles = await fetchHistoricalData(symbol, timeframe);
    if (!candles || candles.length === 0) return null;

    const bricks = calculateRenko(candles, brickSize, sizeType);
    if (bricks.length < 5) return null;

    const lastBrick = bricks[bricks.length - 1];
    const prevBrick = bricks[bricks.length - 2];
    const currentPrice = candles[candles.length - 1].close;

    // Capture last 5 brick colors to display in a mini stream in the UI
    const recentBricks = bricks.slice(-6).map(b => b.color);

    let match = false;
    let direction = null; // 'bullish' or 'bearish'
    let detail = '';

    switch (condition) {
      case 'reversal': {
        // Bullish Reversal: Green brick follows Red brick
        if (lastBrick.color === 'green' && prevBrick.color === 'red') {
          match = true;
          direction = 'bullish';
          detail = 'Bullish Reversal (Red ➔ Green)';
        }
        // Bearish Reversal: Red brick follows Green brick
        else if (lastBrick.color === 'red' && prevBrick.color === 'green') {
          match = true;
          direction = 'bearish';
          detail = 'Bearish Reversal (Green ➔ Red)';
        }
        break;
      }

      case 'consecutive': {
        const count = Number(params.count) || 3;
        if (bricks.length >= count) {
          const slice = bricks.slice(-count);
          const allGreen = slice.every(b => b.color === 'green');
          const allRed = slice.every(b => b.color === 'red');

          if (allGreen) {
            match = true;
            direction = 'bullish';
            detail = `${count} Consecutive Green Bricks`;
          } else if (allRed) {
            match = true;
            direction = 'bearish';
            detail = `${count} Consecutive Red Bricks`;
          }
        }
        break;
      }

      case 'ema_crossover': {
        const fastPeriod = Number(params.fastPeriod) || 9;
        const slowPeriod = Number(params.slowPeriod) || 21;
        
        const closes = bricks.map(b => b.close);
        if (closes.length >= slowPeriod) {
          const fastEma = calculateEMA(closes, fastPeriod);
          const slowEma = calculateEMA(closes, slowPeriod);

          const idx = closes.length - 1;
          const currentFast = fastEma[idx];
          const currentSlow = slowEma[idx];
          const prevFast = fastEma[idx - 1];
          const prevSlow = slowEma[idx - 1];

          if (currentFast !== null && currentSlow !== null && prevFast !== null && prevSlow !== null) {
            // Golden Cross: Fast EMA crosses above Slow EMA
            if (prevFast <= prevSlow && currentFast > currentSlow) {
              match = true;
              direction = 'bullish';
              detail = `EMA Golden Cross (${fastPeriod}/${slowPeriod})`;
            }
            // Death Cross: Fast EMA crosses below Slow EMA
            else if (prevFast >= prevSlow && currentFast < currentSlow) {
              match = true;
              direction = 'bearish';
              detail = `EMA Death Cross (${fastPeriod}/${slowPeriod})`;
            }
          }
        }
        break;
      }

      case 'breakout': {
        // Look at previous local highs and lows of Renko closes
        // Find highest/lowest close of previous 15 bricks (excluding last brick)
        const historyBricks = bricks.slice(-16, -1);
        if (historyBricks.length >= 10) {
          const highs = historyBricks.map(b => Math.max(b.open, b.close));
          const lows = historyBricks.map(b => Math.min(b.open, b.close));

          const resistance = Math.max(...highs);
          const support = Math.min(...lows);

          // Bullish Breakout: Last brick close breaks above resistance
          if (lastBrick.close > resistance && prevBrick.close <= resistance) {
            match = true;
            direction = 'bullish';
            detail = `Bullish Resistance Breakout (Above ${resistance})`;
          }
          // Bearish Breakout: Last brick close breaks below support
          else if (lastBrick.close < support && prevBrick.close >= support) {
            match = true;
            direction = 'bearish';
            detail = `Bearish Support Breakdown (Below ${support})`;
          }
        }
        break;
      }

      default:
        break;
    }

    if (match) {
      return {
        symbol,
        currentPrice,
        direction,
        detail,
        recentBricks,
        timestamp: lastBrick.originalTime || Math.floor(Date.now() / 1000)
      };
    }
  } catch (error) {
    console.error(`Screener failed to scan ${symbol}:`, error.message);
  }
  return null;
}

// Scan a list of tickers in parallel
export async function runScreener(tickers, timeframe, brickSize, sizeType, condition, params = {}) {
  if (!Array.isArray(tickers) || tickers.length === 0) return [];
  
  const scanPromises = tickers.map(ticker => 
    scanStock(ticker, timeframe, brickSize, sizeType, condition, params)
  );

  const results = await Promise.all(scanPromises);
  // Filter out non-matches
  return results.filter(res => res !== null);
}
