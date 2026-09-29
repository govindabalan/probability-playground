/**
 * Probability Playground — Chart Controller (uPlot wrapper)
 * Handles chart rendering, updates, tooltips
 */

// uPlot will be loaded via CDN in index.html
// This module assumes window.uPlot is available

let u = null;
let chartInstance = null;
let currentData = [];

/**
 * Initializes uPlot chart
 * @param {HTMLElement} container - Chart container element
 */
export function initChart(container) {
  if (typeof window.uPlot === 'undefined') {
    console.error('uPlot not loaded. Check CDN script in index.html');
    return;
  }

  u = window.uPlot;

  // Initial data: x (years), y (portfolio value), y (reference line 100), markers for Up/Down
  currentData = [
    [0],           // x: years
    [100],         // y: portfolio value
    [100],         // y: reference line at 100
    [100],         // y: Up markers (only show on Up steps)
    [100],         // y: Down markers (only show on Down steps)
    [''],         // choices: '' | 'U' | 'D' for tooltip
  ];

  const opts = {
    title: 'Portfolio Value Over Time',
    width: 600,
    height: 300,
    pixelRatio: window.devicePixelRatio || 1,
    scales: {
      x: { time: false },
      y: { log: false, min: 50 }, // Linear scale default, log optional
    },
    series: [
      {}, // x-axis (index 0)
      {
        label: 'Portfolio Value',
        stroke: '#2563eb',
        width: 2,
        fill: 'rgba(37, 99, 235, 0.1)',
        paths: (u) => {
          const path = new Path2D();
          const { left, top, width, height } = u.bbox;
          const { x, y } = u.scales;
          const data = u.data;
          const len = data[0].length;
          
          if (len === 0) return path;
          
          let x0 = left + x.val(data[0][0]) * width;
          let y0 = top + (1 - y.val(data[1][0])) * height;
          path.moveTo(x0, y0);
          
          for (let i = 1; i < len; i++) {
            const xi = left + x.val(data[0][i]) * width;
            const yi = top + (1 - y.val(data[1][i])) * height;
            path.lineTo(xi, yi);
          }
          return path;
        },
      }, // portfolio line (index 1)
      {
        label: 'Starting Value (100)',
        stroke: '#94a3b8',
        width: 1,
        dash: [4, 4],
        paths: (u) => {
          const path = new Path2D();
          const { left, top, width, height } = u.bbox;
          const { x, y } = u.scales;
          const data = u.data;
          const len = data[0].length;
          
          if (len === 0) return path;
          
          let x0 = left + x.val(data[0][0]) * width;
          let y0 = top + (1 - y.val(100)) * height;
          path.moveTo(x0, y0);
          
          const x1 = left + x.val(data[0][len - 1]) * width;
          const y1 = top + (1 - y.val(100)) * height;
          path.lineTo(x1, y1);
          return path;
        },
      }, // reference line (index 2)
      {
        label: 'Up',
        points: { show: true, size: 6, stroke: '#16a34a', fill: '#16a34a', width: 2 },
        spanGaps: true,
      }, // Up markers (index 3)
      {
        label: 'Down',
        points: { show: true, size: 6, stroke: '#dc2626', fill: '#dc2626', width: 2 },
        spanGaps: true,
      }, // Down markers (index 4)
      {
        label: 'Choice',
        show: false, // Hidden series for tooltip data
      }, // choices (index 5)
    ],
    axes: [
      { // x-axis
        grid: { stroke: '#e2e8f0' },
        ticks: { size: 5 },
        size: 30,
        font: '11px ui-monospace, monospace',
        stroke: '#6c757d',
      },
      { // y-axis
        grid: { stroke: '#e2e8f0' },
        ticks: { size: 5 },
        space: 30,
        size: 50,
        font: '11px ui-monospace, monospace',
        stroke: '#6c757d',
      },
    ],
    cursor: {
      show: true,
      x: true,
      y: true,
      drag: { x: true, y: false },
      focus: { prox: 10 },
      points: { show: true, size: 8 },
      left: -10,
      top: -10,
      width: 10,
      height: 10,
    },
    hooks: {
      draw: [
        (u) => {
          // Draw current value label
          const data = u.data;
          const len = data[0].length;
          if (len === 0) return;
          
          const lastIdx = len - 1;
          const lastVal = data[1][lastIdx];
          const { left, top, width, height } = u.bbox;
          const { x, y } = u.scales;
          
          const cx = left + x.val(data[0][lastIdx]) * width;
          const cy = top + (1 - y.val(lastVal)) * height;
          
          const ctx = u.ctx;
          ctx.font = 'bold 12px ui-monospace, monospace';
          ctx.fillStyle = '#2563eb';
          ctx.textAlign = cx > left + width / 2 ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(lastVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
            cx + (cx > left + width / 2 ? -10 : 10), cy);
        }
      ],
    },
  };

  chartInstance = new u(container, currentData, opts);

  // Add accessible table for screen readers
  addAccessibleTable(container);
}

/**
 * Updates chart with new data
 * @param {number[]} history - Portfolio value history
 * @param {string[]} choices - Array of 'U' or 'D' choices
 * @param {boolean} logScale - Whether to use log scale
 */
export function updateChart(history, choices, logScale) {
  if (!chartInstance || !u) return;

  const len = history.length;
  const xVals = Array.from({ length: len }, (_, i) => i);
  const yVals = history;
  
  // Reference line at 100
  const refVals = Array(len).fill(100);
  
  // Up/Down markers - only show value at that point, null elsewhere
  const upVals = [];
  const downVals = [];
  const choiceVals = [];
  
  for (let i = 0; i < len; i++) {
    if (choices[i] === 'U') {
      upVals.push(yVals[i]);
      downVals.push(null);
    } else if (choices[i] === 'D') {
      upVals.push(null);
      downVals.push(yVals[i]);
    } else {
      upVals.push(null);
      downVals.push(null);
    }
    choiceVals.push(choices[i] || '');
  }
  
  // First point has no choice
  if (len > 0) {
    upVals[0] = null;
    downVals[0] = null;
    choiceVals[0] = '';
  }

  currentData = [xVals, yVals, refVals, upVals, downVals, choiceVals];

  // Update uPlot data
  chartInstance.setData(currentData);
  
  // Update log scale
  chartInstance.setScale('y', { log: logScale });
}

/**
 * Sets log scale on y-axis
 * @param {boolean} enabled
 */
export function setLogScale(enabled) {
  if (chartInstance) {
    chartInstance.setScale('y', { log: enabled });
  }
}

/**
 * Resizes chart to container
 */
export function resizeChart() {
  if (chartInstance) {
    chartInstance.resize();
  }
}

/**
 * Destroys chart instance
 */
export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  // Remove accessible table
  const container = document.getElementById('chart');
  if (container) {
    const table = container.querySelector('.uplot-accessible-table');
    if (table) table.remove();
  }
}

/**
 * Adds accessible data table for screen readers
 */
function addAccessibleTable(container) {
  // Remove existing
  const existing = container.querySelector('.uplot-accessible-table');
  if (existing) existing.remove();

  const table = document.createElement('table');
  table.className = 'uplot-accessible-table';
  table.setAttribute('aria-hidden', 'true');
  table.style.cssText = 'position:absolute;left:-9999px;';
  
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Year</th><th>Value</th><th>Choice</th></tr>';
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  
  container.appendChild(table);
}

/**
 * Updates accessible table
 */
export function updateAccessibleTable(history, choices) {
  const container = document.getElementById('chart');
  if (!container) return;
  
  const table = container.querySelector('.uplot-accessible-table');
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  
  history.forEach((val, i) => {
    const tr = document.createElement('tr');
    const choice = choices[i] ? (choices[i] === 'U' ? 'Up' : 'Down') : 'Start';
    tr.innerHTML = `<td>${i}</td><td>${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${choice}</td>`;
    tbody.appendChild(tr);
  });
}