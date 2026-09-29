/**
 * Probability Playground — Simple Canvas Chart
 * Lightweight, dependency-free, realtime chart
 * Shows rolling 20-year window with data labels
 */

let chartCanvas = null;
let chartCtx = null;
let chartContainer = null;
let isZoomedOut = false;

// Cached CSS variable values (resolved from computed styles)
let cssVars = {};

// Configuration
const INITIAL_WINDOW = 20; // Show last 20 years
const PADDING = { top: 30, right: 80, bottom: 70, left: 70 };
const GRID_LINES = 5;
const LABEL_PADDING = 10; // Space for labels on right side

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
    chartLineLight: style.getPropertyValue('--chart-line').trim() || '#2563eb',
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
  // Store scale preference and history for redraw on resize
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
  
  // Clear canvas
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  chartCtx.clearRect(0, 0, width, height);
  
  if (data.length < 2) {
    drawEmptyState(width, height);
    return;
  }
  
  // Determine visible data range
  const visibleData = getVisibleData(data);
  const { startIdx, endIdx } = visibleData;
  const visibleValues = data.slice(startIdx, endIdx + 1);
  
  // Calculate scales with ±5% padding based on the 20 values in window
  const scales = calculateScales(visibleValues, width, height, logScale);
  
  // Draw background
  drawBackground(width, height);
  
  // Draw grid
  drawGrid(scales, width, height, logScale);
  
  // Draw reference line at 100
  drawReferenceLine(scales, width, height);
  
  // Draw line
  drawLine(visibleValues, startIdx, scales, width, height);
  
  // Draw data labels (last and 20th from last) - value labels near points
  drawDataLabels(visibleValues, startIdx, scales, width, height);
  
  // Draw current value marker (prominent dot at last point)
  drawCurrentMarker(visibleValues, startIdx, scales, width, height);
  
  // Draw axes labels - X-axis years at bottom
  drawAxesLabels(scales, width, height, startIdx, endIdx);
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
 * Calculates coordinate scales with ±5% padding based on the 20 values in window
 * Y-axis min = min - 5% of range, max = max + 5% of range
 */
function calculateScales(values, width, height, logScale) {
  const plotWidth = width - PADDING.left - PADDING.right - LABEL_PADDING;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  // ±5% padding of the range
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
 * Draws background
 */
function drawBackground(width, height) {
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.fillRect(0, 0, width, height);
}

/**
 * Draws grid lines
 */
function drawGrid(scales, width, height, logScale) {
  const { dataMin, dataMax, plotWidth, plotHeight, yScale } = scales;
  
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
    
    // Grid line
    chartCtx.beginPath();
    chartCtx.moveTo(PADDING.left, y);
    chartCtx.lineTo(width - PADDING.right - LABEL_PADDING, y);
    chartCtx.stroke();
    
    // Y-axis label
    chartCtx.fillText(formatAxisValue(val), PADDING.left - 8, y);
  }
  
  // X-axis grid lines (years)
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'top';
}

/**
 * Draws reference line at 100
 */
function drawReferenceLine(scales, width, height) {
  const { yScale } = scales;
  const y = yScale(100);
  
  if (y >= PADDING.top && y <= height - PADDING.bottom) {
    chartCtx.strokeStyle = cssVars.chartRef;
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    chartCtx.beginPath();
    chartCtx.moveTo(PADDING.left, y);
    chartCtx.lineTo(width - PADDING.right - LABEL_PADDING, y);
    chartCtx.stroke();
    chartCtx.setLineDash([]);
  }
}

/**
 * Draws the portfolio line
 * For first 20 years: only draw up to current point, future is transparent
 */
function drawLine(values, startIdx, scales, width, height) {
  const { yScale } = scales;
  const plotWidth = scales.plotWidth;
  
  chartCtx.strokeStyle = cssVars.chartLine;
  chartCtx.lineWidth = 2;
  chartCtx.lineCap = 'round';
  chartCtx.lineJoin = 'round';
  
  chartCtx.beginPath();
  
  // If we have 20 or fewer total data points and not zoomed out, 
  // only draw up to the actual data we have
  const isEarlyGame = values.length <= INITIAL_WINDOW && !isZoomedOut;
  
  values.forEach((val, i) => {
    const x = PADDING.left + (i / Math.max(1, values.length - 1)) * plotWidth;
    const y = yScale(val);
    
    if (i === 0) {
      chartCtx.moveTo(x, y);
    } else {
      chartCtx.lineTo(x, y);
    }
  });
  
  chartCtx.stroke();
  
  // If early game and not zoomed, draw a faint extension to show the 20-year window
  if (isEarlyGame && values.length > 1) {
    const lastVal = values[values.length - 1];
    const lastX = PADDING.left + ((values.length - 1) / Math.max(1, INITIAL_WINDOW - 1)) * plotWidth;
    const targetX = PADDING.left + plotWidth; // Full 20-year width
    const lastY = yScale(lastVal);
    
    chartCtx.strokeStyle = cssVars.chartLine;
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    chartCtx.globalAlpha = 0.3;
    chartCtx.beginPath();
    chartCtx.moveTo(lastX, lastY);
    chartCtx.lineTo(targetX, lastY);
    chartCtx.stroke();
    chartCtx.setLineDash([]);
    chartCtx.globalAlpha = 1;
  }
}

/**
 * Draws data labels for last iteration and 20th from last
 * Value labels near the data points
 */
function drawDataLabels(values, startIdx, scales, width, height) {
  const { xScale, yScale } = scales;
  const plotWidth = scales.plotWidth;
  const endIdx = values.length - 1;
  
  // Label for last iteration
  const lastIdx = endIdx;
  const lastVal = values[lastIdx];
  const lastX = PADDING.left + (lastIdx / Math.max(1, values.length - 1)) * plotWidth;
  const lastY = yScale(lastVal);
  
  // Label for 20th from last (or first if less than 20)
  const firstIdx = Math.max(0, endIdx - INITIAL_WINDOW + 1);
  const firstVal = values[firstIdx];
  const firstX = PADDING.left + (firstIdx / Math.max(1, values.length - 1)) * plotWidth;
  const firstY = yScale(firstVal);
  
  chartCtx.font = 'bold 11px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.textBaseline = 'middle';
  
  // Last iteration value label (right side) - ensure it's visible
  const labelText = formatValue(lastVal);
  const labelWidth = chartCtx.measureText(labelText).width;
  const isNearRightEdge = lastX + labelWidth + 15 > width - PADDING.right;
  
  if (isNearRightEdge) {
    chartCtx.textAlign = 'left';
    chartCtx.fillText(labelText, lastX + 8, lastY);
  } else {
    chartCtx.textAlign = 'right';
    chartCtx.fillText(labelText, lastX - 8, lastY);
  }
  
  // 20th from last value label (left side)
  if (firstIdx !== lastIdx) {
    const firstLabelText = formatValue(firstVal);
    const firstLabelWidth = chartCtx.measureText(firstLabelText).width;
    const isNearLeftEdge = firstX - firstLabelWidth - 15 < PADDING.left;
    
    if (isNearLeftEdge) {
      chartCtx.textAlign = 'right';
      chartCtx.fillText(firstLabelText, firstX - 8, firstY);
    } else {
      chartCtx.textAlign = 'left';
      chartCtx.fillText(firstLabelText, firstX + 8, firstY);
    }
  }
}

/**
 * Draws current value marker (prominent dot on the last point with value label)
 */
function drawCurrentMarker(values, startIdx, scales, width, height) {
  const { yScale } = scales;
  const plotWidth = scales.plotWidth;
  const lastIdx = values.length - 1;
  const lastVal = values[lastIdx];
  
  const x = PADDING.left + (lastIdx / Math.max(1, values.length - 1)) * plotWidth;
  const y = yScale(lastVal);
  
  // Outer ring (white/background)
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.beginPath();
  chartCtx.arc(x, y, 10, 0, Math.PI * 2);
  chartCtx.fill();
  
  // Middle ring (line color)
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.beginPath();
  chartCtx.arc(x, y, 8, 0, Math.PI * 2);
  chartCtx.fill();
  
  // Inner dot (white)
  chartCtx.fillStyle = cssVars.bg;
  chartCtx.beginPath();
  chartCtx.arc(x, y, 4, 0, Math.PI * 2);
  chartCtx.fill();
  
  // Current value label above the marker
  chartCtx.font = 'bold 12px ui-monospace, monospace';
  chartCtx.fillStyle = cssVars.chartLine;
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'bottom';
  chartCtx.fillText(formatValue(lastVal), x, y - 14);
}

/**
 * Draws axis labels - X-axis with years at bottom
 */
function drawAxesLabels(scales, width, height, startIdx, endIdx) {
  const plotWidth = scales.plotWidth;
  
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '12px ui-monospace, monospace';
  chartCtx.textAlign = 'center';
  chartCtx.textBaseline = 'top';
  
  const numTicks = Math.min(8, endIdx - startIdx + 1);
  const labelY = height - PADDING.bottom + 12; // Well within bottom padding
  
  for (let i = 0; i < numTicks; i++) {
    const idx = startIdx + Math.round(i * (endIdx - startIdx) / Math.max(1, numTicks - 1));
    const x = PADDING.left + (i / Math.max(1, numTicks - 1)) * plotWidth;
    chartCtx.fillText(idx.toString(), x, labelY);
  }
  
  // X-axis label
  chartCtx.fillStyle = cssVars.fgMuted;
  chartCtx.font = '13px system-ui';
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Year', width / 2, height - 10);
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
  
  chartCanvas.width = rect.width * dpr;
  chartCanvas.height = rect.height * dpr;
  chartCanvas.style.width = rect.width + 'px';
  chartCanvas.style.height = rect.height + 'px';
  
  chartCtx.scale(dpr, dpr);
  
  // Redraw with current data from dataset
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
    drawChart(); // Redraw with new scale
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