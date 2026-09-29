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
const PADDING = { top: 40, right: 100, bottom: 70, left: 70 };
const GRID_LINES = 5;
const LABEL_PADDING = 15;
const MARKER_RADIUS = 8;

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
  drawGrid(scales, width, height, logScale, plotLeft, plotRight, plotTop, plotBottom);
  drawReferenceLine(scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  
  // Clip to plot area for data elements
  chartCtx.save();
  chartCtx.beginPath();
  chartCtx.rect(plotLeft, plotTop, plotWidth, plotHeight);
  chartCtx.clip();
  
  // Draw line (clipped to plot area)
  drawLine(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  
  // Draw markers (clipped)
  drawCurrentMarker(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  
  chartCtx.restore();
  
  // Draw labels in padding areas (unclipped but positioned carefully)
  drawDataLabels(visibleValues, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom);
  drawAxesLabels(scales, width, height, startIdx, endIdx, plotLeft, plotRight, plotBottom);
  
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
 * This ensures entire line movement is visible
 */
function calculateScales(values, width, height, logScale) {
  const plotWidth = width - PADDING.left - PADDING.right - LABEL_PADDING;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  // ±5% padding of the range - ensures full movement visible
  const padding = Math.max(range * 0.05, maxVal * 0.02);
  
  const dataMin = minVal - padding;
  const dataMax = maxVal + padding;
  
  const xScale = (x) => PADDING.left + (x / Math.max(1, values.length - 1)) * plotWidth;
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
 * Draws grid lines
 */
function drawGrid(scales, width, height, logScale, plotLeft, plotRight, plotTop, plotBottom) {
  const { dataMin, dataMax, yScale } = scales;
  
  chartCtx.strokeStyle = cssVars.chartGrid;
  chartCtx.lineWidth = 1;
  chartCtx.font = '11px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.textAlign = 'right';
  chartCtx.textBaseline = 'middle';
  
  for (let i = 0; i <= GRID_LINES; i++) {
    let val;
    if (logScale) {
      const logMin = Math.log(dataMin > 0 ? dataMin : 0.01);
      const logMax = Math.log(dataMax);
      const logVal = logMin + (logMax - logMin) * (i / GRID_LINES);
      val = Math.exp(logVal);
    } else {
      val = dataMin + (dataMax - dataMin) * (i / GRID_LINES);
    }
    
    const y = yScale(val);
    
    // Grid line - bounded to plot area
    chartCtx.beginPath();
    chartCtx.moveTo(plotLeft, y);
    chartCtx.lineTo(plotRight, y);
    chartCtx.stroke();
    
    // Y-axis label (in left padding)
    chartCtx.fillText(formatAxisValue(val), plotLeft - 10, y);
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
function drawLine(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom) {
  const { yScale } = scales;
  const plotWidth = scales.plotWidth;
  
  chartCtx.strokeStyle = cssVars.chartLine;
  chartCtx.lineWidth = 2.5;
  chartCtx.lineCap = 'round';
  chartCtx.lineJoin = 'round';
  
  chartCtx.beginPath();
  
  const isEarlyGame = values.length <= INITIAL_WINDOW && !isZoomedOut;
  
  values.forEach((val, i) => {
    const x = PADDING.left + (i / Math.max(1, values.length - 1)) * plotWidth;
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
    const lastX = PADDING.left + ((values.length - 1) / Math.max(1, INITIAL_WINDOW - 1)) * plotWidth;
    const targetX = PADDING.left + plotWidth;
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
 * Draws data labels for first and last visible points
 * Ensures labels are always visible within their designated areas
 */
function drawDataLabels(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom) {
  const { yScale } = scales;
  const plotWidth = scales.plotWidth;
  const endIdx = values.length - 1;
  
  // First visible point (leftmost)
  const firstIdx = 0;
  const firstVal = values[firstIdx];
  const firstX = PADDING.left + (firstIdx / Math.max(1, values.length - 1)) * plotWidth;
  const firstY = yScale(firstVal);
  
  // Last visible point (rightmost)
  const lastIdx = endIdx;
  const lastVal = values[lastIdx];
  const lastX = PADDING.left + (lastIdx / Math.max(1, values.length - 1)) * plotWidth;
  const lastY = yScale(lastVal);
  
  chartCtx.font = 'bold 12px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.textBaseline = 'middle';
  
  // First point label (left side) - in left padding area
  const firstLabelText = formatValue(firstVal);
  const firstLabelWidth = chartCtx.measureText(firstLabelText).width;
  
  chartCtx.textAlign = 'left';
  // Place in left padding, vertically aligned with point
  const firstLabelX = Math.max(4, Math.min(plotLeft - firstLabelWidth - 4, firstX - firstLabelWidth - 8));
  chartCtx.fillText(firstLabelText, firstLabelX, firstY);
  
  // Last point label (right side) - in right padding/label area
  const lastLabelText = formatValue(lastVal);
  const lastLabelWidth = chartCtx.measureText(lastLabelText).width;
  
  chartCtx.textAlign = 'right';
  // Place in right label area
  const lastLabelX = Math.min(width - PADDING.right - 4, Math.max(plotRight + lastLabelWidth + 4, lastX + lastLabelWidth + 8));
  chartCtx.fillText(lastLabelText, lastLabelX, lastY);
  
  // Year labels below points on X-axis (in bottom padding)
  chartCtx.font = '10px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'top';
  
  const actualFirstYear = startIdx + firstIdx;
  const actualLastYear = startIdx + lastIdx;
  const yearY = plotBottom + 8; // Just below plot area, in bottom padding
  
  chartCtx.fillText(`Year ${actualFirstYear}`, firstX, yearY);
  if (firstIdx !== lastIdx) {
    chartCtx.fillText(`Year ${actualLastYear}`, lastX, yearY);
  }
}

/**
 * Draws current value marker - prominent at last point
 */
function drawCurrentMarker(values, startIdx, scales, width, height, plotLeft, plotRight, plotTop, plotBottom) {
  const { yScale } = scales;
  const plotWidth = scales.plotWidth;
  const lastIdx = values.length - 1;
  const lastVal = values[lastIdx];
  
  const x = PADDING.left + (lastIdx / Math.max(1, values.length - 1)) * plotWidth;
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
  
  // Value label above marker (clamped to top padding)
  chartCtx.font = 'bold 12px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'bottom';
  const labelY = Math.max(plotTop + 4, y - MARKER_RADIUS - 8);
  chartCtx.fillText(formatValue(lastVal), x, labelY);
}

/**
 * Draws X-axis with year labels - clearly visible in bottom padding
 */
function drawAxesLabels(scales, width, height, startIdx, endIdx, plotLeft, plotRight, plotBottom) {
  const plotWidth = scales.plotWidth;
  
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '12px ui-monospace, monospace';
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'top';
  
  const numTicks = Math.min(10, endIdx - startIdx + 1);
  const labelY = plotBottom + 14; // In bottom padding
  
  for (let i = 0; i < numTicks; i++) {
    const idx = startIdx + Math.round(i * (endIdx - startIdx) / Math.max(1, numTicks - 1));
    const x = PADDING.left + (i / Math.max(1, numTicks - 1)) * plotWidth;
    chartCtx.fillText(idx.toString(), x, labelY);
  }
  
  // X-axis label
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '13px system-ui';
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Year', width / 2, height - 12);
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
 * Formats axis values
 */
function formatAxisValue(val) {
  if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
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