import type { PrintJob } from './jobs'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char)
}

/** Render the thermal receipt line model as a standalone, escaped HTML document. */
export function renderReceiptHtml(job: PrintJob): string {
  const lines = job.lines.map((line) => {
    switch (line.kind) {
      case 'text': {
        const classes = [
          line.style?.bold && 'bold', line.style?.double && 'double',
          line.style?.align === 'center' && 'center', line.style?.align === 'right' && 'right',
        ].filter(Boolean).join(' ')
        return `<div class="${classes}">${escapeHtml(line.text)}</div>`
      }
      case 'columns':
        return `<div class="columns${line.bold ? ' bold' : ''}"><span>${escapeHtml(line.label)}</span><span class="value">${escapeHtml(line.value)}</span></div>`
      case 'divider':
        return '<hr class="divider">'
      case 'blank':
        return '<div class="blank" aria-hidden="true"></div>'
    }
  }).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Receipt</title><style>
    @page { margin: 5mm; }
    body { color: #000; background: #fff; font: 14px/1.4 monospace; margin: 0 auto; padding: 8px; max-width: 80mm; overflow-wrap: anywhere; white-space: pre-wrap; }
    .columns { display: flex; justify-content: space-between; gap: 1em; }
    .columns > span { min-width: 0; }
    .value { text-align: right; }
    .divider { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .blank { height: 1em; }
    .bold { font-weight: bold; }
    .center { text-align: center; }
    .right { text-align: right; }
    .double { font-size: 1.4em; }
    @media print { body { padding: 0; } }
  </style></head><body><main aria-label="Receipt">${lines}</main></body></html>`
}
