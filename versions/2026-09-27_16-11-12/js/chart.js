/**
 * Probability Playground — Simple Canvas Chart
 * Lightweight, dependency-free, realtime chart
 * Shows rolling 20-year window with crisp rendering
 */

let chartCanvas = null;
let chartCtx = null;
let chartContainer = null;
let isZoomedOut = false;
let cssPixelWidth = 0;
let cssPixelHeight = 0;

// Cached CSS variable values (resolved from computed styles)
let cssVars = {};

// Configuration
const INITIAL_WINDOW = 20; // Show last 20 years
const PADDING = { top: 30, right: 80, bottom: 60, left: 70 };
const LABEL_PADDING = 15;
const MARKER_RADIUS = 6;
const MAX_Y_TICS = 6; // Maximum number of y-axis tics
const X_AXIS_PADDING = 0.08; // 8% padding on x-axis beyond data range

/**
 * Resolves CSS custom properties to actual color values
 */
function resolveCSSVariables() {
  if (!chartCanvas) return;
  const style = getComputedStyle(chartCanvas);
  cssVars = {
    bg: style.getPropertyValue('--bg').trim() || '#ffffff',
    fgMuted: style.getPropertyValue('--fg-muted').trim() || '#6c757d',
    chartGrid: style.getPropertyValue('--chart-grid').trim() || '#e2e8f0',
    chartRef: style.getPropertyValue('--chart-ref').trim() || '#94a3b8',
    chartLine: style.getPropertyValue('--chart-line').trim() || '#2563eb',
  };
}

/**
 * Initializes the chart
 * @param {HTMLElement} container - Chart container element
 */
export function initChart(container) {
  chartContainer = container;
  
  // Create canvas
  chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'chart-canvas';
  container.appendChild(chartCanvas);
  
  chartCtx = chartCanvas.getContext('2d');
  chartCtx.imageSmoothingEnabled = true;
  chartCtx.imageSmoothingQuality = 'high';
  
  // Resolve CSS variables after canvas is in DOM
  resolveCSSVariables();
  
  // Create zoom button
  createZoomButton();
  
  // Initial resize
  resizeChart();
  
  // Handle container resize
  const resizeObserver = new ResizeObserver(debounce(resizeChart, 100));
  resizeObserver.observe(chartContainer);
}

/**
 * Creates zoom in/out button
 */
function createZoomButton() {
  const btn = document.createElement('button');
  btn.id = 'chartZoomBtn';
  btn.className = 'chart-zoom-btn btn ghost btn-sm';
  btn.setAttribute('aria-label', 'Zoom out to see full history');
  btn.innerHTML = '<span class="zoom-icon">🔍</span> Zoom Out';
  btn.addEventListener('click', toggleZoom);
  chartContainer.appendChild(btn);
}

/**
 * Toggles zoom state
 */
function toggleZoom() {
  isZoomedOut = !isZoomedOut;
  const btn = document.getElementById('chartZoomBtn');
  if (btn) {
    btn.innerHTML = isZoomedOut 
      ? '<span class="zoom-icon">🔍</span> Zoom In (20 years)'
      : '<span class="zoom-icon">🔍</span> Zoom Out';
    btn.setAttribute('aria-label', isZoomedOut ? 'Zoom in to rolling 20-year window' : 'Zoom out to see full history');
  }
  drawChart();
}

/**
 * Updates chart with new data
 * @param {number[]} history - Portfolio value history
 * @param {boolean} logScale - Whether to use log scale
 */
export function updateChart(history, logScale) {
  chartCanvas.dataset.logScale = logScale;
  chartCanvas.dataset.history = JSON.stringify(history);
  drawChart(history);
}

/**
 * Draws the chart
 * @param {number[]} history - Portfolio value history
 */
function drawChart(history) {
  if (!chartCtx || !chartCanvas) return;
  
  const data = history || [];
  const logScale = chartCanvas.dataset.logScale === 'true';
  
  // Use CSS pixel dimensions for all drawing calculations
  const width = cssPixelWidth;
  const height = cssPixelHeight;
  
  // Clear canvas with background
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.fillRect(0, 0, width, height);
  
  if (data.length < 2) {
    drawEmptyState(width, height);
    return;
  }
  
  // Determine visible data range
  const visibleData = getVisibleData(data);
  const { startIdx, endIdx } = visibleData;
  const visibleValues = data.slice(startIdx, endIdx + 1);
  
  // Calculate scales - Y-axis fits ALL visible data with ±5% padding
  const scales = calculateScales(visibleValues, width, height, logScale);
  
  // Plot area bounds (for clipping)
  const plotLeft = PADDING.left;
  const plotTop = PADDING.top;
  const plotRight = width - PADDING.right - LABEL_PADDING;
  const plotBottom = height - PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  
  // Draw grid and reference line (unclipped - they define the frame)
  drawGrid(scales, width, height, logScale, plotLeft, plotRight, plotTop, plotBottom, plotHeight);
  drawReferenceLine(scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  
  // Clip to plot area for data elements
  chartCtx.save();
  chartCtx.beginPath();
  chartCtx.rect(plotLeft, plotTop, plotWidth, plotHeight);
  chartCtx.clip();
  
  // Draw line (clipped to plot area)
  drawLine(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth);
  
  // Draw data point circles (clipped)
  drawDataPointCircles(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth);
  
  // Draw current value marker (clipped)
  drawCurrentMarker(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  
  chartCtx.restore();
  
  // Draw labels in padding areas (unclipped but positioned carefully)
  drawDataLabels(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight);
  drawAxesLabels(scales, width, height, startIdx, endIdx, plotLeft, plotRight, plotBottom, plotWidth, plotHeight);
  
  // Draw chart border last (on top)
  drawChartBorder(width, height, plotLeft, plotTop, plotWidth, plotHeight);
}

/**
 * Gets visible data range based on zoom state
 * Rolling window: always show last INITIAL_WINDOW years
 */
function getVisibleData(data) {
  if (isZoomedOut || data.length <= INITIAL_WINDOW) {
    return { startIdx: 0, endIdx: data.length - 1 };
  }
  
  // Rolling window: show last INITIAL_WINDOW years
  const endIdx = data.length - 1;
  const startIdx = Math.max(0, endIdx - INITIAL_WINDOW + 1);
  return { startIdx, endIdx };
}

/**
 * Calculates coordinate scales with ±5% padding based on ALL visible values
 * Y-axis min = min - 5% of range, max = max + 5% of range
 * Y-tics snapped to multiples of 5 with max 6 tics
 * X-axis includes padding beyond data range for label visibility
 */
function calculateScales(values, width, height, logScale) {
  const plotWidth = width - PADDING.left - PADDING.right - LABEL_PADDING;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  // ±5% padding of the range - ensures full movement visible
  const padding = Math.max(range * 0.05, maxVal * 0.02);
  
  let dataMin = minVal - padding;
  let dataMax = maxVal + padding;
  
  // Snap y-axis bounds to multiples of 5 for clean tics
  if (!logScale) {
    dataMin = Math.floor(dataMin / 5) * 5;
    dataMax = Math.ceil(dataMax / 5) * 5;
  }
  
  // X-axis with padding beyond first/last data point
  const xScale = (x) => PADDING.left + (x / Math.max(1, values.length - 1)) * plotWidth * (1 - 2 * X_AXIS_PADDING) + plotWidth * X_AXIS_PADDING;
  const yScale = (val) => {
    if (logScale) {
      const logMin = Math.log(dataMin > 0 ? dataMin : 0.01);
      const logMax = Math.log(dataMax);
      const logVal = Math.log(val > 0 ? val : 0.01);
      return PADDING.top + plotHeight * (1 - (logVal - logMin) / (logMax - logMin));
    }
    return PADDING.top + plotHeight * (1 - (val - dataMin) / (dataMax - dataMin));
  };
  
  return { xScale, yScale, dataMin, dataMax, plotWidth, plotHeight };
}

/**
 * Draws empty state
 */
function drawEmptyState(width, height) {
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '14px system-ui';
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'middle';
  chartCtx.fillText('Start playing to see chart', width / 2, height / 2);
}

/**
 * Draws grid lines with proper y-tics at multiples of 5 (max 6 tics)
 */
function drawGrid(scales, width, height, logScale, plotLeft, plotRight, plotTop, plotBottom, plotHeight) {
  const { dataMin, dataMax, yScale } = scales;
  
  chartCtx.strokeStyle = cssVars.chartGrid;
  chartCtx.lineWidth = 1;
  chartCtx.font = '11px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.textAlign = 'right';
  chartCtx.textBaseline = 'middle';
  
  if (logScale) {
    // Log scale - use 5 tics
    for (let i = 0; i <= 5; i++) {
      const logMin = Math.log(dataMin > 0 ? dataMin : 0.01);
      const logMax = Math.log(dataMax);
      const logVal = logMin + (logMax - logMin) * (i / 5);
      const val = Math.exp(logVal);
      const y = yScale(val);
      
      chartCtx.beginPath();
      chartCtx.moveTo(plotLeft, y);
      chartCtx.lineTo(plotRight, y);
      chartCtx.stroke();
      
      chartCtx.fillText(formatAxisValue(val), plotLeft - 10, y);
    }
  } else {
    // Linear scale - calculate step to have max MAX_Y_TICS tics
    const startTic = Math.ceil(dataMin / 5) * 5;
    const endTic = Math.floor(dataMax / 5) * 5;
    const rawTicCount = (endTic - startTic) / 5 + 1;
    
    // Calculate step to limit to MAX_Y_TICS
    const step = Math.max(1, Math.ceil(rawTicCount / MAX_Y_TICS)) * 5;
    const adjustedStartTic = Math.ceil(startTic / step) * step;
    const adjustedEndTic = Math.floor(endTic / step) * step;
    
    for (let val = adjustedStartTic; val <= adjustedEndTic; val += step) {
      const y = yScale(val);
      
      if (y >= plotTop && y <= plotBottom) {
        // Grid line
        chartCtx.beginPath();
        chartCtx.moveTo(plotLeft, y);
        chartCtx.lineTo(plotRight, y);
        chartCtx.stroke();
        
        // Y-axis label
        chartCtx.fillText(formatAxisValue(val), plotLeft - 10, y);
      }
    }
  }
}

/**
 * Draws reference line at 100
 */
function drawReferenceLine(scales, width, height, plotLeft, plotRight, plotTop, plotBottom) {
  const { yScale } = scales;
  const y = yScale(100);
  
  if (y >= plotTop && y <= plotBottom) {
    chartCtx.strokeStyle = cssVars.chartRef;
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    chartCtx.beginPath();
    chartCtx.moveTo(plotLeft, y);
    chartCtx.lineTo(plotRight, y);
    chartCtx.stroke();
    chartCtx.setLineDash([]);
  }
}

/**
 * Draws the portfolio line - crisp, bounded to plot area
 */
function drawLine(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth) {
  const { yScale } = scales;
  
  chartCtx.strokeStyle = cssVars.chartLine;
  chartCtx.lineWidth = 2.5;
  chartCtx.lineCap = 'round';
  chartCtx.lineJoin = 'round';
  
  chartCtx.beginPath();
  
  const isEarlyGame = values.length <= INITIAL_WINDOW && !isZoomedOut;
  
  values.forEach((val, i) => {
    const x = scales.xScale(i);
    const y = yScale(val);
    
    // Clamp to plot area
    const clampedY = Math.max(plotTop, Math.min(plotBottom, y));
    
    if (i === 0) {
      chartCtx.moveTo(x, clampedY);
    } else {
      chartCtx.lineTo(x, clampedY);
    }
  });
  
  chartCtx.stroke();
  
  // Early game: faint extension to show 20-year window
  if (isEarlyGame && values.length > 1) {
    const lastVal = values[values.length - 1];
    const lastX = scales.xScale(values.length - 1);
    const targetX = plotLeft + plotWidth;
    const lastY = yScale(lastVal);
    const clampedLastY = Math.max(plotTop, Math.min(plotBottom, lastY));
    
    chartCtx.strokeStyle = cssVars.chartLine;
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    chartCtx.globalAlpha = 0.25;
    chartCtx.beginPath();
    chartCtx.moveTo(lastX, clampedLastY);
    chartCtx.lineTo(targetX, clampedLastY);
    chartCtx.stroke();
    chartCtx.setLineDash([]);
    chartCtx.globalAlpha = 1;
  }
}

/**
 * Draws circles at each data point
 */
function drawDataPointCircles(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth) {
  const { xScale, yScale } = scales;
  
  chartCtx.fillStyle = cssVars.chartLine;
  
  values.forEach((val, i) => {
    const x = xScale(i);
    const y = yScale(val);
    
    // Only draw if within plot area (with small buffer)
    if (x >= plotLeft - 5 && x <= plotRight + 5 && y >= plotTop - 5 && y <= plotBottom + 5) {
      chartCtx.beginPath();
      chartCtx.arc(x, y, 4, 0, Math.PI * 2);
      chartCtx.fill();
      
      // White inner dot for visibility
      chartCtx.fillStyle = cssVars.bg;
      chartCtx.beginPath();
      chartCtx.arc(x, y, 2, 0, Math.PI * 2);
      chartCtx.fill();
      chartCtx.fillStyle = cssVars.chartLine;
    }
  });
}

/**
 * Draws data labels for first and last visible points
 * Value labels positioned clearly without duplication
 */
function drawDataLabels(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight) {
  const { xScale, yScale } = scales;
  const endIdx = values.length - 1;
  
  // First visible point (leftmost)
  const firstIdx = 0;
  const firstVal = values[firstIdx];
  const firstX = xScale(firstIdx);
  const firstY = yScale(firstVal);
  
  // Last visible point (rightmost)
  const lastIdx = endIdx;
  const lastVal = values[lastIdx];
  const lastX = xScale(lastIdx);
  const lastY = yScale(lastVal);
  
  chartCtx.font = 'bold 11px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.chartLine;
  
  // First point value label - positioned ABOVE and to the right of data point
  const firstLabelText = formatValue(firstVal);
  const firstLabelWidth = chartCtx.measureText(firstLabelText).width;
  
  chartCtx.textAlign = 'left';
  chartCtx.textBaseline = 'bottom';
  
  // Position above and to the right, with bounds checking
  let firstLabelX = Math.min(firstX + 8, plotRight - firstLabelWidth - 4);
  let firstLabelY = Math.max(plotTop + 16, firstY - 16);
  
  // If label would go off left edge, move right
  if (firstLabelX < plotLeft + 4) firstLabelX = plotLeft + 4;
  
  chartCtx.fillText(firstLabelText, firstLabelX, firstLabelY);
  
  // Last point value label - positioned ABOVE and to the left of data point
  const lastLabelText = formatValue(lastVal);
  const lastLabelWidth = chartCtx.measureText(lastLabelText).width;
  
  chartCtx.textAlign = 'right';
  chartCtx.textBaseline = 'bottom';
  
  let lastLabelX = Math.max(lastX - 8, plotLeft + lastLabelWidth + 4);
  let lastLabelY = Math.max(plotTop + 16, lastY - 16);
  
  // If label would go off right edge, move left
  if (lastLabelX > plotRight - 4) lastLabelX = plotRight - 4;
  
  chartCtx.fillText(lastLabelText, lastLabelX, lastLabelY);
  
  // NO year labels here - they are only in drawAxesLabels to avoid duplication
}

/**
 * Draws current value marker - prominent at last point (NO label - handled by drawDataLabels)
 */
function drawCurrentMarker(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom) {
  const { xScale, yScale } = scales;
  const lastIdx = values.length - 1;
  const lastVal = values[lastIdx];
  
  const x = xScale(lastIdx);
  let y = yScale(lastVal);
  
  // Clamp marker to plot area with radius buffer
  const markerBuffer = MARKER_RADIUS + 4;
  y = Math.max(plotTop + markerBuffer, Math.min(plotBottom - markerBuffer, y));
  
  // Outer white ring (background)
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.beginPath();
  chartCtx.arc(x, y, MARKER_RADIUS + 2, 0, Math.PI * 2);
  chartCtx.fill();
  
  // Middle colored ring
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.beginPath();
  chartCtx.arc(x, y, MARKER_RADIUS, 0, Math.PI * 2);
  chartCtx.fill();
  
  // Inner white dot
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.beginPath();
  chartCtx.arc(x, y, MARKER_RADIUS / 2, 0, Math.PI * 2);
  chartCtx.fill();
  
  // NO label here - drawDataLabels handles the last point label
}

/**
 * Draws X-axis with year labels and x-tics, Y-axis with "Value" title
 */
function drawAxesLabels(scales, width, height, startIdx, endIdx, plotLeft, plotRight, plotBottom, plotWidth, plotHeight) {
  // X-axis labels (year numbers) with x-tics
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '11px ui-monospace, monospace';
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'top';
  
  const numTicks = Math.min(10, endIdx - startIdx + 1);
  const labelY = plotBottom + 12; // In bottom padding
  const ticHeight = 5; // x-tic height
  
  chartCtx.strokeStyle = cssVars.chartGrid;
  chartCtx.lineWidth = 1;
  
  for (let i = 0; i < numTicks; i++) {
    const idx = startIdx + Math.round(i * (endIdx - startIdx) / Math.max(1, numTicks - 1));
    const x = scales.xScale(i * (endIdx - startIdx) / Math.max(1, numTicks - 1));
    
    // X-tic mark (small vertical line at bottom of plot area)
    chartCtx.beginPath();
    chartCtx.moveTo(x, plotBottom);
    chartCtx.lineTo(x, plotBottom + ticHeight);
    chartCtx.stroke();
    
    // Year label
    chartCtx.fillText(idx.toString(), x, labelY);
  }
  
  // X-axis label - just "Year" (not duplicated)
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '12px system-ui';
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Year', width / 2, height - 10);
  
  // Y-axis title "Value"
  chartCtx.save();
  chartCtx.translate(18, height / 2);
  chartCtx.rotate(-Math.PI / 2);
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '12px system-ui';
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Value', 0, 0);
  chartCtx.restore();
}

/**
 * Draws chart border for crisp bounded appearance
 */
function drawChartBorder(width, height, plotLeft, plotTop, plotWidth, plotHeight) {
  chartCtx.strokeStyle = cssVars.chartGrid;
  chartCtx.lineWidth = 1;
  chartCtx.strokeRect(
    plotLeft - 0.5,
    plotTop - 0.5,
    plotWidth + 1,
    plotHeight + 1
  );
}

/**
 * Formats axis values - integers only for readability
 */
function formatAxisValue(val) {
  // Round to nearest integer for clean Y-axis labels
  const rounded = Math.round(val);
  if (rounded >= 1000) return (rounded / 1000).toFixed(0) + 'k';
  return rounded.toString();
}

/**
 * Formats portfolio value
 */
function formatValue(v) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Resizes chart to container
 */
export function resizeChart() {
  if (!chartCanvas || !chartContainer) return;
  
  const rect = chartContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  // Store CSS pixel dimensions for drawing calculations
  cssPixelWidth = rect.width;
  cssPixelHeight = rect.height;
  
  // Set canvas internal resolution (device pixels)
  chartCanvas.width = Math.round(rect.width * dpr);
  chartCanvas.height = Math.round(rect.height * dpr);
  chartCanvas.style.width = rect.width + 'px';
  chartCanvas.style.height = rect.height + 'px';
  
  // Scale context so 1 CSS pixel = 1 unit in drawing
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  const logScale = chartCanvas.dataset.logScale === 'true';
  drawChart(chartCanvas.dataset.history ? JSON.parse(chartCanvas.dataset.history) : null);
}

/**
 * Sets log scale
 * @param {boolean} enabled
 */
export function setLogScale(enabled) {
  if (chartCanvas) {
    chartCanvas.dataset.logScale = enabled;
    drawChart();
  }
}

/**
 * Destroys chart instance
 */
export function destroyChart() {
  if (chartCanvas) {
    chartCanvas.remove();
    chartCanvas = null;
    chartCtx = null;
  }
  const btn = document.getElementById('chartZoomBtn');
  if (btn) btn.remove();
}

/**
 * Simple debounce
 */
function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}