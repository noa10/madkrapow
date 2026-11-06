// Minimal RFC 4180 CSV reader (no dependency).
//
// The HubboPOS "Order with Items" export quotes any item string containing a
// comma and escapes embedded quotes by doubling them, so a correct reader is
// required — splitting on commas silently corrupts ~1.5k item lines.

/**
 * @param {string} text
 * @returns {string[][]} rows of cells
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Strip BOM.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // swallow CRLF
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV text into objects keyed by the header row.
 * Trailing duplicate/empty headers (the export appends two SQL variables,
 * `@row_number := 0`, `@current_order_id := 0`) are kept verbatim — build.mjs
 * ignores them.
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
export function parseCsvRecords(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body
    .filter((cells) => cells.length > 1 || (cells[0] ?? '').trim() !== '')
    .map((cells) => {
      const rec = {};
      header.forEach((key, idx) => {
        rec[key] = cells[idx] ?? '';
      });
      return rec;
    });
}
