// Turns a saved record into spreadsheet rows, using only the record's own titles,
// plus "Date extracted" and "Notes" at the end. Same layout as Google Sheets export.

// Plain numbers become real numbers so Excel can add them up.
// Anything else (including phone numbers with a leading 0) stays exactly as written.
export function cell(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  const t = String(v ?? "").trim();
  if (/^-?(0|[1-9]\d{0,2}(,\d{3})+|[1-9]\d*)(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^-?0\.\d+$/.test(t)) return Number(t);
  return String(v ?? "");
}

export function recordTable(r) {
  const x = r.extracted ?? {};
  const fields = x.fields ?? [];
  const cols = x.columns ?? [];
  const rows = x.rows ?? [];
  const header = [...fields.map((f) => String(f.label ?? "")), ...cols, "Date extracted", "Notes"];
  const fieldVals = fields.map((f) => cell(f.value));
  const extractedOn = String(r.created_at ?? new Date().toISOString()).slice(0, 10);
  const notes = String(x.notes ?? "");
  const body = rows.length
    ? rows.map((row, i) => [...fieldVals, ...cols.map((_, ci) => cell(row[ci])), extractedOn, i === 0 ? notes : ""])
    : [[...fieldVals, extractedOn, notes]];
  const name = String(x.title || x.record_type || r.merchant || "Records");
  return { header, body, name };
}

function sheetName(raw, used) {
  let base = raw.replace(/[[\]*?/\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Records";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = base.slice(0, 25) + " (" + n++ + ")";
  used.add(name.toLowerCase());
  return name;
}

// Download one or more records as an Excel file. Records with the same columns share a sheet.
export async function downloadExcel(records, fileName) {
  const mod = await import("xlsx");
  const XLSX = mod.utils ? mod : mod.default;
  const groups = new Map();
  for (const r of records) {
    const t = recordTable(r);
    const key = JSON.stringify(t.header);
    const g = groups.get(key);
    if (g) g.body.push(...t.body); else groups.set(key, { ...t, body: [...t.body] });
  }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const g of groups.values()) {
    const ws = XLSX.utils.aoa_to_sheet([g.header, ...g.body]);
    ws["!cols"] = g.header.map((h, i) => {
      const longest = Math.max(String(h).length, ...g.body.map((row) => String(row[i] ?? "").length));
      return { wch: Math.min(Math.max(longest + 2, 10), 45) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheetName(g.name, used));
  }
  const safe = (fileName || "Ledgr records").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Ledgr records";
  XLSX.writeFile(wb, safe + ".xlsx");
}
