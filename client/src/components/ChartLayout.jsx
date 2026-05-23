import React from 'react';
import TradingViewChart from './TradingViewChart';

export default function ChartLayout({
  viewports,
  activeViewportId,
  onSelectViewport,
  onUpdateViewport,
  layoutCount,
  brickSize,
  sizeType,
  theme
}) {
  // Slice the viewports array based on the selected layout count (1 to 8)
  const visibleViewports = viewports.slice(0, layoutCount);

  // Return appropriate layout grid class name from index.css
  const getGridClass = () => {
    switch (layoutCount) {
      case 1: return 'layout-grid-1';
      case 2: return 'layout-grid-2';
      case 3: return 'layout-grid-3';
      case 4: return 'layout-grid-4';
      case 5: return 'layout-grid-5';
      case 6: return 'layout-grid-6';
      case 7: return 'layout-grid-7';
      case 8: return 'layout-grid-8';
      default: return 'layout-grid-1';
    }
  };

  return (
    <div className={`grid-container ${getGridClass()}`} style={{ height: 'calc(100vh - 56px)' }}>
      {visibleViewports.map((vp) => (
        <TradingViewChart
          key={vp.id}
          chartId={vp.id}
          symbol={vp.symbol}
          timeframe={vp.timeframe}
          chartType={vp.chartType}
          brickSize={brickSize}
          sizeType={sizeType}
          active={vp.id === activeViewportId}
          onSelect={onSelectViewport}
          onUpdateViewport={onUpdateViewport}
          theme={theme}
        />
      ))}
    </div>
  );
}
