function cell(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  const t = String(v ?? "").trim();
  if (/^-?(0|[1-9]\d{0,2}(,\d{3})+|[1-9]\d*)(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  if (/^-?0\.\d+$/.test(t)) return Number(t);
  return String(v ?? "");
}
const text = (v) => String(v ?? "").trim();
const norm = (v) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
const lineKey = (f) => norm(f.label) + "|" + text(f.value).toLowerCase();
const fieldRow = (f) => text(f.label) ? [text(f.label), cell(f.value)] : [cell(f.value)];
function sectionsOf(r) {
  const x = r.extracted ?? {};
  if (Array.isArray(x.sections) && x.sections.length) return x.sections;
  const fields = x.fields ?? [];
  const out = [{
    heading: "",
        fields: fields.filter((f) => !f.after_table),
    columns: x.columns ?? [],
    rows: x.rows ?? []
  }];
  const after = fields.filter((f) => f.after_table);
  if (after.length) out.push({ heading: "", fields: after, columns: [], rows: [] });
  return out;
}
const allFields = (r) => sectionsOf(r).flatMap((s) => s.fields ?? []);
function groupName(r) {
  const x = r.extracted ?? {};
  const src = text(x.source_name) || text((allFields(r).find((f) => f.kind === "source") ?? {}).value);
  if (src) return src;
  const type = text(x.record_type);
  if (type) return type.charAt(0).toUpperCase() + type.slice(1);
  return text(x.title || r.merchant) || "Records";
}
function groupKey(r) {
  return norm(groupName(r)) || "records";
}
function recordLabel(r) {
  const ids = allFields(r).filter((f) => f.kind === "id");
  if (ids.length) {
    return ids.map((f) => text(f.label) ? text(f.label) + " " + text(f.value) : text(f.value)).join("  \xB7  ");
  }
  return text(r.receipt_date) || text(r.extracted?.title) || text(r.created_at).slice(0, 10) || "Record";
}
function keyed(names) {
  const seen = {};
  return names.map((n) => {
    const k = norm(n);
    seen[k] = (seen[k] ?? 0) + 1;
    return { key: k + "#" + seen[k], title: text(n) };
  });
}
function buildTab(records) {
  const seen = /* @__PURE__ */ new Set();
  const recs = records.filter((r) => {
    const sig = JSON.stringify(sectionsOf(r));
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  }).sort((a, b) => text(a.receipt_date).localeCompare(text(b.receipt_date)) || text(a.created_at).localeCompare(text(b.created_at)));
  const multi = recs.length > 1;
  const title = groupName(recs[0] ?? {});
  const sharedKeys = /* @__PURE__ */ new Set();
  const sharedLines = [];
  for (const r of recs) {
    for (const f of allFields(r)) {
      const k = lineKey(f);
      if (sharedKeys.has(k)) continue;
      const onEvery = multi && f.kind !== "id" && !text(f.label) &&       recs.every((o) => allFields(o).some((g) => lineKey(g) === k));
      if (f.kind === "source" || onEvery) {
        sharedKeys.add(k);
        sharedLines.push(f);
      }
    }
  }
  const rows = [];
  const styles = [];
  const add = (row, kind) => {
    if (kind) styles.push({ row: rows.length, kind });
    rows.push(row);
  };
  const hasSource = !!text(recs[0]?.extracted?.source_name) || sharedLines.some((f) => f.kind === "source");
  const firstName = sharedLines.find((f) => f.kind === "source" && !text(f.label));
  if (hasSource) add([firstName ? cell(firstName.value) : title], "title");
  for (const f of sharedLines) {
    if (f === firstName) continue;
    if (!text(f.label) && norm(f.value) === norm(title)) continue;
    add(fieldRow(f));
  }
  if (rows.length) add([]);
  if (!multi && recs[0]) {
    add([recordLabel(recs[0])], "record");
    add([]);
  }
  const order = [];
  const secs = /* @__PURE__ */ new Map();
  for (const r of recs) {
    let blank = 0;
    for (const s of sectionsOf(r)) {
      const key = text(s.heading) ? "h:" + norm(s.heading) : "b:" + blank++;
      if (!secs.has(key)) {
        secs.set(key, { heading: text(s.heading), items: [] });
        order.push(key);
      }
      secs.get(key).items.push({
        r,
                fields: (s.fields ?? []).filter((f) => f.kind !== "source" && f.kind !== "id" && !sharedKeys.has(lineKey(f))),
        columns: (s.columns ?? []).map(String),
        rows: s.rows ?? []
      });
    }
  }
  for (const key of order) {
    const sec = secs.get(key);
    const hasFields = sec.items.some((i) => i.fields.length);
    const hasTable = sec.items.some((i) => i.columns.length && i.rows.length);
    if (!hasFields && !hasTable) continue;
    if (sec.heading) add([sec.heading], "section");
    if (hasFields) {
      if (!multi) {
        for (const f of sec.items[0].fields) add(fieldRow(f));
      } else {
        const cols = [];
        for (const i of sec.items) {
          for (const c of keyed(i.fields.map((f) => text(f.label)))) {
            if (!cols.some((x) => x.key === c.key)) cols.push(c);
          }
        }
        add(["Record", ...cols.map((c) => c.title)], "head");
        for (const i of sec.items) {
          if (!i.fields.length) continue;
          const ks = keyed(i.fields.map((f) => text(f.label)));
          add([recordLabel(i.r), ...cols.map((c) => {
            const at = ks.findIndex((k) => k.key === c.key);
            return at >= 0 ? cell(i.fields[at].value) : "";
          })]);
        }
      }
    }
    if (hasTable) {
      const cols = [];
      for (const i of sec.items) for (const c of keyed(i.columns)) if (!cols.some((x) => x.key === c.key)) cols.push(c);
      const madeUp = cols.every((c) => /^Column \d+$/.test(c.title));
      if (multi || !madeUp) add([...multi ? ["Record"] : [], ...cols.map((c) => c.title)], "head");
      for (const i of sec.items) {
        const ks = keyed(i.columns);
        for (const row of i.rows) {
          const values = cols.map((c) => {
            const at = ks.findIndex((k) => k.key === c.key);
            return at >= 0 ? cell(row[at]) : "";
          });
          add(multi ? [recordLabel(i.r), ...values] : values);
        }
      }
    }
    add([]);
  }
  if (multi) {
    add(["Extraction details"], "section");
    add(["Record", "Date extracted", "Notes"], "head");
    for (const r of recs) add([recordLabel(r), text(r.created_at).slice(0, 10), text(r.extracted?.notes)]);
  } else if (recs[0]) {
    add(["Date extracted", text(recs[0].created_at).slice(0, 10)]);
    if (text(recs[0].extracted?.notes)) add(["Notes", text(recs[0].extracted?.notes)]);
  }
  const width = Math.max(2, ...rows.map((r) => r.length));
  return { title, rows, styles, width };
}
export {
  buildTab,
  cell,
  groupKey,
  groupName,
  sectionsOf
};

function sheetName(raw, used) {
  const base = raw.replace(/[[\]*?/\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Records";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) name = base.slice(0, 25) + " (" + n++ + ")";
  used.add(name.toLowerCase());
  return name;
}

// Download one or more records as an Excel file, organised the same way as Google Sheets.
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
    // Headings span the full width, like in Google Sheets
    ws["!merges"] = built.styles
      .filter((s) => s.kind !== "head")
      .map((s) => ({ s: { r: s.row, c: 0 }, e: { r: s.row, c: built.width - 1 } }));
    ws["!cols"] = Array.from({ length: built.width }, (_, i) => {
      const longest = Math.max(8, ...built.rows.map((r, ri) =>
        built.styles.some((s) => s.row === ri && s.kind !== "head") ? 0 : String(r[i] ?? "").length));
      return { wch: Math.min(longest + 2, 45) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheetName(built.title, used));
  }
  const safe = (fileName || "Ledgr records").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "Ledgr records";
  XLSX.writeFile(wb, safe + ".xlsx");
}
