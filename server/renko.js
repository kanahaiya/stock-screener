// Renko calculation module

// Helper to calculate ATR (Average True Range)
export function calculateATR(candles, period = 14) {
  if (!candles || candles.length === 0) return 1.0;
  if (candles.length < period) period = candles.length;

  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const h_l = candles[i].high - candles[i].low;
      const h_pc = Math.abs(candles[i].high - candles[i - 1].close);
      const l_pc = Math.abs(candles[i].low - candles[i - 1].close);
      trs.push(Math.max(h_l, h_pc, l_pc));
    }
  }

  // Calculate Simple Moving Average of True Range
  const sum = trs.slice(-period).reduce((a, b) => a + b, 0);
  const atr = sum / period;
  return atr > 0 ? parseFloat(atr.toFixed(4)) : 1.0;
}

// Renko Brick Calculator
export function calculateRenko(candles, brickSizeInput = 1, sizeType = 'percent') {
  if (!candles || candles.length === 0) return [];

  // Determine brick size value
  let brickSize = 1;
  const initialPrice = candles[0].close;

  if (sizeType === 'percent') {
    brickSize = initialPrice * (Number(brickSizeInput) / 100);
  } else if (sizeType === 'atr') {
    brickSize = calculateATR(candles, Number(brickSizeInput) || 14);
  } else {
    // 'fixed'
    brickSize = Number(brickSizeInput);
  }

  // Safeguard against extreme/zero brick sizes
  if (isNaN(brickSize) || brickSize <= 0) {
    brickSize = initialPrice * 0.01; // default to 1%
  }

  const bricks = [];
  let prevClose = candles[0].close;
  let prevOpen = candles[0].close; // Neutral start anchor

  let isFirst = true;

  // Process candles to build bricks
  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].close;
    const priceDiff = price - prevClose;

    if (isFirst) {
      // Establish initial brick direction and anchor
      if (Math.abs(priceDiff) >= brickSize) {
        const numBricks = Math.floor(Math.abs(priceDiff) / brickSize);
        const direction = priceDiff > 0 ? 1 : -1;

        for (let j = 0; j < numBricks; j++) {
          const open = prevClose + (j * brickSize * direction);
          const close = open + (brickSize * direction);
          bricks.push({
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(Math.max(open, close).toFixed(2)),
            low: parseFloat(Math.min(open, close).toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            color: direction > 0 ? 'green' : 'red',
            originalTime: candles[i].time
          });
        }
        
        prevOpen = bricks[bricks.length - 1].open;
        prevClose = bricks[bricks.length - 1].close;
        isFirst = false;
      }
    } else {
      const currentTrend = prevClose > prevOpen ? 1 : -1;

      if (currentTrend === 1) {
        // Current trend: UP (Green)
        if (price >= prevClose + brickSize) {
          // Trend continuation
          const numBricks = Math.floor((price - prevClose) / brickSize);
          for (let j = 0; j < numBricks; j++) {
            const open = prevClose;
            const close = open + brickSize;
            bricks.push({
              open: parseFloat(open.toFixed(2)),
              high: parseFloat(close.toFixed(2)),
              low: parseFloat(open.toFixed(2)),
              close: parseFloat(close.toFixed(2)),
              color: 'green',
              originalTime: candles[i].time
            });
            prevOpen = open;
            prevClose = close;
          }
        } else if (price <= prevOpen - brickSize) {
          // Trend reversal (needs to exceed last green brick open by at least 1 brick size)
          const numBricks = Math.floor((prevOpen - price) / brickSize);
          for (let j = 0; j < numBricks; j++) {
            const open = prevOpen;
            const close = open - brickSize;
            bricks.push({
              open: parseFloat(open.toFixed(2)),
              high: parseFloat(open.toFixed(2)),
              low: parseFloat(close.toFixed(2)),
              close: parseFloat(close.toFixed(2)),
              color: 'red',
              originalTime: candles[i].time
            });
            prevOpen = open;
            prevClose = close;
          }
        }
      } else {
        // Current trend: DOWN (Red)
        if (price <= prevClose - brickSize) {
          // Trend continuation
          const numBricks = Math.floor((prevClose - price) / brickSize);
          for (let j = 0; j < numBricks; j++) {
            const open = prevClose;
            const close = open - brickSize;
            bricks.push({
              open: parseFloat(open.toFixed(2)),
              high: parseFloat(open.toFixed(2)),
              low: parseFloat(close.toFixed(2)),
              close: parseFloat(close.toFixed(2)),
              color: 'red',
              originalTime: candles[i].time
            });
            prevOpen = open;
            prevClose = close;
          }
        } else if (price >= prevOpen + brickSize) {
          // Trend reversal (needs to exceed last red brick open by at least 1 brick size)
          const numBricks = Math.floor((price - prevOpen) / brickSize);
          for (let j = 0; j < numBricks; j++) {
            const open = prevOpen;
            const close = open + brickSize;
            bricks.push({
              open: parseFloat(open.toFixed(2)),
              high: parseFloat(close.toFixed(2)),
              low: parseFloat(open.toFixed(2)),
              close: parseFloat(close.toFixed(2)),
              color: 'green',
              originalTime: candles[i].time
            });
            prevOpen = open;
            prevClose = close;
          }
        }
      }
    }
  }

  // Map brick indices to artificial daily timestamps to ensure beautiful uniform chart widths
  // We'll use sequential days starting from a base epoch.
  const baseTime = candles[0]?.time || 1704067200; // Jan 1 2024 default
  const oneDayInSec = 86400;

  return bricks.map((brick, index) => ({
    ...brick,
    time: baseTime + (index * oneDayInSec) // strictly increasing uniform time series
  }));
}
