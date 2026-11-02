// Lays out records for spreadsheets: one tab per source (for example one business),
// shared details shown once at the top, then each record top to bottom.
// The same layout is used for Google Sheets on the server.

// Plain numbers become real numbers so Sheets can add them up.
// Anything else (including phone numbers with a leading 0) stays exactly as written.
function cell(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  const t = String(v ?? "").trim();
  if (/^-?(0|[1-9]\d{0,2}(,\d{3})+|[1-9]\d*)(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^-?0\.\d+$/.test(t)) return Number(t);
  return String(v ?? "");
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const lineKey = (f) => norm(f.label) + "|" + String(f.value ?? "").trim().toLowerCase();
const fieldRow = (f) => (String(f.label ?? "").trim() ? [String(f.label), cell(f.value)] : [cell(f.value)]);

export function groupName(r) {
  const x = r.extracted ?? {};
  // Records from a business or person are grouped by that source.
  // Records without one (like daily sales pages) are grouped by their type.
  const src = String(x.source_name ?? "").trim() ||
    String(((x.fields ?? []).find((f) => f.kind === "source") ?? {}).value ?? "").trim();
  if (src) return src;
  const type = String(x.record_type ?? "").trim();
  if (type) return type.charAt(0).toUpperCase() + type.slice(1);
  return String(x.title || r.merchant || "Records").trim() || "Records";
}
export function groupKey(r) {
  return norm(groupName(r)) || "records";
}

// Builds the rows for one tab. styles marks which rows are titles, record headings and column headings.
export function buildTab(records) {
  // Drop exact duplicates (the same record uploaded twice)
  const seen = new Set();
  const recs = records.filter((r) => {
    const x = r.extracted ?? {};
    const sig = JSON.stringify([(x.fields ?? []).map(lineKey), x.columns ?? [], x.rows ?? []]);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  }).sort((a, b) =>
    String(a.receipt_date ?? "").localeCompare(String(b.receipt_date ?? "")) ||
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));

  const title = groupName(recs[0] ?? {});
  // Shared lines: business details, plus any line that is identical on every record in the tab
    const fieldsOf = (r) => (r.extracted?.fields ?? []);
  const sharedKeys = new Set();
    const sharedLines = [];
  for (const r of recs) {
    for (const f of fieldsOf(r)) {
      const k = lineKey(f);
      if (sharedKeys.has(k)) continue;
      // Unlabelled lines found on every record (like "Thank you!") are shown once too.
      // Identifiers and labelled details (like Total) always stay with their own record.
      const onEvery = recs.length > 1 && f.kind !== "id" && !String(f.label ?? "").trim() &&
        recs.every((o) => fieldsOf(o).some((g) => lineKey(g) === k));
      if (f.kind === "source" || onEvery) { sharedKeys.add(k); sharedLines.push(f); }
    }
  }

  const rows = [];
  const styles = [];
  const add = (row, kind) => {
    if (kind) styles.push({ row: rows.length, kind });
    rows.push(row);
  };

  const hasSource = recs.some((r) => String(r.extracted?.source_name ?? "").trim() ||
    (r.extracted?.fields ?? []).some((f) => f.kind === "source"));
  if (hasSource) add([title], "title");
  for (const f of sharedLines) {
    if (!String(f.label ?? "").trim() && norm(f.value) === norm(title)) continue;
    add(fieldRow(f));
  }
  if (hasSource || sharedLines.length) add([]);

  let lastCols = "";
  for (const r of recs) {
    const x = r.extracted ?? {};
    const own = fieldsOf(r).filter((f) => !sharedKeys.has(lineKey(f)));
    const ids = own.filter((f) => f.kind === "id");
    const heading = ids.length
      ? ids.map((f) => (String(f.label ?? "").trim() ? String(f.label).trim() + " " + String(f.value ?? "").trim() : String(f.value ?? "").trim())).join("  ·  ")
      : String(r.receipt_date || x.title || String(r.created_at ?? "").slice(0, 10) || "Record");
    add([heading], "record");

    const rest = own.filter((f) => f.kind !== "id");
    for (const f of rest.filter((f) => !f.after_table)) add(fieldRow(f));

    const cols = x.columns ?? [];
    if (cols.length) {
      const key = JSON.stringify(cols);
      const madeUp = cols.every((c) => /^Column \d+$/.test(String(c).trim()));
      if (key !== lastCols && !madeUp) add(cols.map(String), "head");
      lastCols = key;
      for (const row of (x.rows ?? [])) add(cols.map((_, i) => cell(row[i])));
    }

    for (const f of rest.filter((f) => f.after_table)) add(fieldRow(f));
    if (x.notes) add(["Notes", String(x.notes)]);
    add(["Date extracted", String(r.created_at ?? new Date().toISOString()).slice(0, 10)]);
    add([]);
  }
  return { title, rows, styles };
}


function sheetName(raw, used) {
  const base = raw.replace(/[[\]*?/\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Records";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = base.slice(0, 25) + " (" + n++ + ")";
  used.add(name.toLowerCase());
  return name;
}

// Download one or more records as an Excel file, grouped into tabs the same way as Google Sheets.
export async function downloadExcel(records, fileName) {
  const mod = await import("xlsx");
  const XLSX = mod.utils ? mod : mod.default;
  const groups = new Map();
  for (const r of records) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const recs of groups.values()) {
    const built = buildTab(recs);
    const ws = XLSX.utils.aoa_to_sheet(built.rows);
    const width = Math.max(2, ...built.rows.map((r) => r.length));
    ws["!cols"] = Array.from({ length: width }, (_, i) => ({ wch: i === 0 ? 32 : 18 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(built.title, used));
  }
  const safe = (fileName || "Ledgr records").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Ledgr records";
  XLSX.writeFile(wb, safe + ".xlsx");
}
