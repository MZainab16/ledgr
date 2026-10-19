import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { callFn } from "./supabase.js";


const PENDING_KEY = "ledgr_pending_sheet_receipts";

export function rememberPending(ids) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(ids)); }
export function takePending() {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function SheetModal({ receiptIds, onClose, onDone }) {
  const [status, setStatus] = useState(null); // { connected, email, sheets }
  const [mode, setMode] = useState("new");
  const [title, setTitle] = useState(`Receipts ${new Date().toLocaleDateString("en-NG", { month: "long", year: "numeric" })}`);
  const [sheetId, setSheetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function load() {
    setError("");
    try {
      const s = await callFn("sheets", { action: "status" });
      setStatus(s);
      if (s.sheets.length) { setMode("existing"); setSheetId(s.sheets[0].id); }
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function connectGoogle() {
    setBusy(true); setError("");
    try {
      rememberPending(receiptIds);
      const { url } = await callFn("google-auth/start", { return_to: window.location.origin });
      window.location.href = url;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  async function send() {
    setBusy(true); setError("");
    try {
      const body = mode === "new"
        ? { action: "create", title, receipt_ids: receiptIds }
        : { action: "append", sheet_id: sheetId, receipt_ids: receiptIds };
      const r = await callFn("sheets", body);
      setResult(r);
      onDone?.(r.sheet);
    } catch (e) {
      if (e.payload?.needs_google) setStatus((s) => ({ ...s, connected: false }));
      setError(e.message);
    } finally { setBusy(false); }
  }

  const count = receiptIds.length;

  return (
    <Modal title="Send to Google Sheets" onClose={onClose}>
      {!status && !error && <p className="muted">Checking your Google connection…</p>}

      {result && (
        <>
          <p>{result.count > 1 ? `${result.count} receipts were` : "Your receipt was"} added to <strong>{result.sheet.title}</strong>.</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Done</button>
            <a className="btn btn-primary" href={result.sheet.url} target="_blank" rel="noreferrer">Open sheet</a>
          </div>
        </>
      )}

      {!result && status && !status.connected && (
        <>
          <p>Connect your Google account so Ledgr can create and fill sheets for you. Ledgr can only see sheets it creates, never the rest of your Google Drive.</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Not now</button>
            <button className="btn btn-primary" onClick={connectGoogle} disabled={busy}>
              {busy ? "Opening Google…" : "Connect Google"}
            </button>
          </div>
        </>
      )}

      {!result && status?.connected && (
        <>
          <p className="muted">Connected as {status.email || "your Google account"}. Sending {count} receipt{count > 1 ? "s" : ""}.</p>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={mode === "new"} className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>New sheet</button>
            <button role="tab" aria-selected={mode === "existing"} className={mode === "existing" ? "on" : ""}
              onClick={() => setMode("existing")} disabled={!status.sheets.length}>Existing sheet</button>
          </div>

          {mode === "new" && (
            <label className="field-label">Name your sheet
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
            </label>
          )}
          {mode === "existing" && (
            <div className="sheet-list">
              {status.sheets.map((s) => (
                <label key={s.id} className={`sheet-option ${sheetId === s.id ? "on" : ""}`}>
                  <input type="radio" name="sheet" value={s.id} checked={sheetId === s.id} onChange={() => setSheetId(s.id)} />
                  <span>{s.title}</span>
                </label>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={send}
              disabled={busy || (mode === "new" ? !title.trim() : !sheetId)}>
              {busy ? "Sending…" : mode === "new" ? "Create and send" : "Add to sheet"}
            </button>
          </div>
        </>
      )}

      {error && <p className="msg-error" role="alert">{error}</p>}
      {error && !status && <div className="modal-actions"><button className="btn" onClick={load}>Try again</button></div>}
    </Modal>
  );
}
