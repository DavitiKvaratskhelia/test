/** CSV cell: quote everything and neutralise spreadsheet formulas (=,+,-,@) that could be injected via customer-controlled text. */
export const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** Download rows (first row = header) as a UTF-8 CSV with BOM so Excel shows Georgian text correctly. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
