export function parseCsv(text: string): Array<Record<string, string>> {
  const rows = tokenizeRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const records: Array<Record<string, string>> = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const record: Record<string, string> = {};
    headers.forEach((header, col) => {
      if (header) record[header] = cells[col] ?? '';
    });
    records.push(record);
  }

  return records;
}

function tokenizeRows(text: string): string[][] {
  const result: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
      result.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ignore \r (CRLF)
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    result.push(row);
  }

  const filtered = result.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  return filtered;
}
