import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, callFn } from "./supabase.js";
import { prepareFile } from "./image.js";
import { renderMarkdown, money, niceDate } from "./format.js";
import { Wordmark } from "./App.jsx";
import ReceiptCard from "./ReceiptCard.jsx";
import ExtractModal from "./ExtractModal.jsx";
import SheetModal, { takePending } from "./SheetModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;
const SUGGESTIONS = [
  "How much did I spend this month?",
  "List the items on my latest receipt",
  "Which supplier do I spend the most with?",
];

function Sparkle({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor" />
      <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" fill="currentColor" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M16.5 6.5 8.4 14.6a2 2 0 0 0 2.8 2.8l8.1-8.1a4 4 0 0 0-5.6-5.6l-8.2 8.2a6 6 0 0 0 8.5 8.5l6.4-6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  );
}

export default function Chat({ session }) {
  const user = session.user;
  const [messages, setMessages] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const [extractFor, setExtractFor] = useState(null); // receipt ids waiting for the pop-up
  const [sheetFor, setSheetFor] = useState(null);     // receipt ids to send to Sheets
  const [menuOpen, setMenuOpen] = useState(false);
  const [billing, setBilling] = useState(null);       // { pro, free_left, ... }
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const askRef = useRef(null);

  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 4000); };

  const load = useCallback(async () => {
    const [m, r, s] = await Promise.all([
      supabase.from("messages").select("*").order("created_at").limit(200),
      supabase.from("receipts").select("*").order("created_at").limit(200),
      supabase.from("sheets").select("*"),
    ]);
    if (m.error || r.error) flash("Couldn't load your history. Check your connection.");
    setMessages(m.data ?? []);
    setReceipts(r.data ?? []);
    setSheets(s.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadBilling = useCallback(async () => {
    try { setBilling(await callFn("billing", { action: "status" })); } catch { /* shown later if needed */ }
  }, []);
  useEffect(() => { loadBilling(); }, [loadBilling]);

  // Coming back from Paystack checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "done") return;
    const reference = params.get("reference") || params.get("trxref");
    window.history.replaceState({}, "", window.location.pathname);
    if (!reference) return;
    callFn("billing", { action: "verify", reference })
      .then((b) => {
        setBilling(b);
        flash(b.verified ? "Welcome to Ledgr Pro! Unlimited receipts unlocked." : "Payment not completed.");
      })
      .catch((e) => flash(e.message));
  }, []);

  const noteUse = (freeLeft) => {
    if (freeLeft == null) return;
    setBilling((b) => (b ? { ...b, free_left: freeLeft } : b));
  };

  // Coming back from Google sign-in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (!g) return;
    window.history.replaceState({}, "", window.location.pathname);
    const pending = takePending();
    if (g === "connected") {
      flash("Google connected.");
      if (pending?.length) setSheetFor(pending);
    } else if (g === "cancelled") flash("Google connection was cancelled.");
    else flash("Google connection didn't finish. Please try again.");
  }, []);

  // Messages and receipts share one timeline, oldest first
  const timeline = useMemo(() => {
    const items = [
      ...messages.map((m) => ({ kind: "msg", at: m.created_at, data: m })),
      ...receipts.map((r) => ({ kind: "receipt", at: r.created_at, data: r })),
    ];
    return items.sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [messages, receipts]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [timeline.length, thinking]);

  const sheetTitle = (id) => sheets.find((s) => s.id === id)?.title;

  // Numbers for the overview cards
  const extracted = receipts.filter((r) => r.status === "extracted");
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthSpend = extracted
    .filter((r) => (!r.currency || r.currency === "NGN") && (r.receipt_date || r.created_at || "").slice(0, 7) === monthKey)
    .reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const recent = [...extracted].reverse().slice(0, 6);

  function focusAsk() {
    askRef.current?.focus();
    askRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }
  function jumpTo(id) {
    document.getElementById("r-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const patchReceipt = (r) => setReceipts((list) => list.map((x) => (x.id === r.id ? { ...x, ...r } : x)));

  async function handleFiles(fileList) {
    const files = [...fileList].filter(Boolean);
    if (!files.length) return;
    setUploading(true);
    const newIds = [];
    for (const original of files) {
      try {
        if (!ACCEPT.split(",").includes(original.type)) throw new Error(`${original.name}: use a photo (JPG, PNG, WEBP) or PDF.`);
        const file = await prepareFile(original);
        if (file.size > MAX_BYTES) throw new Error(`${original.name} is larger than 10 MB.`);
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
        const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const { data, error } = await supabase.from("receipts")
          .insert({ file_path: path, file_name: original.name, mime_type: file.type }).select().single();
        if (error) throw error;
        setReceipts((list) => [...list, data]);
        newIds.push(data.id);
      } catch (e) {
        flash(e.message || "Upload failed.");
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (newIds.length) setExtractFor(newIds);
  }

  async function extract(ids, instructions = "") {
    setExtractFor(null);
    const done = [];
    for (const id of ids) {
      patchReceipt({ id, status: "extracting", error: null });
      try {
        const { receipt, free_left } = await callFn("extract-receipt", { receipt_id: id, instructions });
        patchReceipt(receipt);
        noteUse(free_left);
        done.push(id);
      } catch (e) {
        if (e.payload?.limit) {
          ids.slice(ids.indexOf(id)).forEach((rid) => patchReceipt({ id: rid, status: "uploaded", error: null }));
          flash(e.message);
          break;
        }
        if (e.payload?.paywall) {
          // Out of free tries: put the rest back as "not read yet" and show the upgrade screen
          ids.slice(ids.indexOf(id)).forEach((rid) => patchReceipt({ id: rid, status: "uploaded", error: null }));
          setBilling((b) => (b ? { ...b, free_left: 0 } : b));
          setUpgradeOpen(true);
          break;
        }
        patchReceipt({ id, status: "failed", error: e.message });
      }
    }
    loadBilling(); // refresh the counters in the header
    // After results show, prompt to save them to Google Sheets
    if (done.length) setTimeout(() => setSheetFor(done), 600);
  }

  async function send(e, preset) {
    e?.preventDefault();
    const text = (preset ?? draft).trim();
    if (!text || thinking) return;
    setDraft("");
    const temp = { id: `temp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    setThinking(true);
    try {
      const { message, free_left } = await callFn("chat", { message: text });
      setMessages((m) => [...m, message]);
      noteUse(free_left);
    } catch (err) {
      if (err.payload?.paywall) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setDraft(text);
        setBilling((b) => (b ? { ...b, free_left: 0 } : b));
        setUpgradeOpen(true);
        return;
      }
      setMessages((m) => [...m, {
        id: `err-${Date.now()}`, role: "assistant", error: true,
        content: err.message || "Something went wrong.", created_at: new Date().toISOString(),
      }]);
    } finally { setThinking(false); }
  }

  async function manageSubscription() {
    setMenuOpen(false);
    try { const { url } = await callFn("billing", { action: "manage" }); window.location.href = url; }
    catch (e) { flash(e.message); }
  }

  async function disconnectGoogle() {
    setMenuOpen(false);
    try { await callFn("sheets", { action: "disconnect" }); flash("Google disconnected."); }
    catch (e) { flash(e.message); }
  }

  const firstName = user.user_metadata?.full_name?.split(" ")[0];

  function Overview() {
    return (
      <div className="overview">
        <div className="stat-cards">
          <div className="stat-card"><span>Receipts</span><b>{extracted.length}</b></div>
          <div className="stat-card"><span>Spent this month</span><b>{money(monthSpend, "NGN")}</b></div>
          <div className="stat-card"><span>Sheets</span><b>{sheets.length}</b></div>
        </div>
        <div className="quick">
          <button className="quick-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ClipIcon /> Upload receipt
          </button>
          <button className="quick-btn quick-ask" onClick={focusAsk}>
            <Sparkle /> Ask AI about receipts
          </button>
        </div>
      </div>
    );
  }
  const empty = !loading && timeline.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark small />
        {billing?.pro && (
          <span className="plan-chip plan-pro">
            {billing.owner ? "Owner" : "Pro: " + Math.max(billing.pro_limit - billing.pro_used, 0) + " left"}
          </span>
        )}
        <div className="menu-wrap">
          <button className="icon-btn" aria-label="Account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span className="avatar">{(firstName || user.email)[0].toUpperCase()}</span>
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <p className="menu-email">{user.email}</p>
              {billing?.pro
                ? <button role="menuitem" onClick={manageSubscription}>Manage subscription</button>
                : <button role="menuitem" onClick={() => { setMenuOpen(false); setUpgradeOpen(true); }}>Upgrade to Pro</button>}
              <button role="menuitem" onClick={disconnectGoogle}>Disconnect Google</button>
              <button role="menuitem" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {billing && !billing.pro && (
        <div className="pro-banner">
          <span>
            <strong>{billing.free_left > 0 ? billing.free_left + " of " + billing.free_limit + " free tries left." : "Free tries used up."}</strong>{" "}
            Go Pro: 100 receipts a month for ₦5,000.
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setUpgradeOpen(true)}>Go Pro</button>
        </div>
      )}

      <div className="workspace">
        <aside className="side side-desktop" aria-label="Overview">
          <Overview />
          {recent.length > 0 && (
            <div className="recent">
              <h2>Recent receipts</h2>
              <ul>
                {recent.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => jumpTo(r.id)}>
                      <span className="recent-name">{r.merchant || r.file_name || "Receipt"}</span>
                      <span className="recent-meta">{niceDate(r.receipt_date)}{r.total != null ? " · " + money(r.total, r.currency) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="main-col">
          <main className="feed" aria-live="polite">
            <div className="side-mobile"><Overview /></div>

            {loading && <p className="muted center">Loading your receipts…</p>}

            {empty && (
              <section className="empty">
                <h1>{firstName ? "Hi " + firstName + "." : "Hi there."} Let's tidy up some receipts.</h1>
                <ol className="empty-steps">
                  <li><b>Upload</b> a photo or PDF of a receipt</li>
                  <li><b>Extract</b> and check the clean table</li>
                  <li><b>Save</b> it to Google Sheets, then <b>ask AI</b> anything about it</li>
                </ol>
                <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()}>Upload a receipt</button>
              </section>
            )}

            {timeline.map((item) =>
              item.kind === "receipt" ? (
                <div className="row row-receipt" key={"r-" + item.data.id} id={"r-" + item.data.id}>
                  <ReceiptCard
                    receipt={item.data}
                    sheetTitle={sheetTitle(item.data.sheet_id)}
                    onExtract={(ids) => extract(ids)}
                    onSendToSheets={(ids) => setSheetFor(ids)}
                  />
                </div>
              ) : (
                <div className={"row row-" + item.data.role} key={"m-" + item.data.id}>
                  {item.data.role === "assistant"
                    ? <div className={"bubble bubble-ai " + (item.data.error ? "bubble-error" : "")}>
                        <span className="ai-label"><Sparkle size={14} /> Ledgr AI</span>
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(item.data.content) }} />
                      </div>
                    : <div className="bubble bubble-user">{item.data.content}</div>}
                </div>
              )
            )}

            {thinking && <div className="row row-assistant"><div className="bubble bubble-ai typing"><span /><span /><span /></div></div>}
            <div ref={endRef} />
          </main>

          <div className="ask-bar">
            {!draft && !thinking && extracted.length > 0 && (
              <div className="suggestions" aria-label="Suggested questions">
                {SUGGESTIONS.map((q) => (
                  <button key={q} className="chip" onClick={() => send(null, q)}><Sparkle size={13} /> {q}</button>
                ))}
              </div>
            )}
            <form className="composer" onSubmit={send}>
              <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
              <button type="button" className="icon-btn attach" aria-label="Upload receipt" title="Upload receipt" disabled={uploading}
                onClick={() => fileRef.current?.click()}>
                {uploading ? <span className="spinner" /> : <ClipIcon />}
              </button>
              <label className="ask-field">
                <span className="ask-icon"><Sparkle /></span>
                <textarea
                  ref={askRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); send(); } }}
                  placeholder="Ask AI about your receipts…"
                  aria-label="Ask AI about your receipts"
                />
              </label>
              <button className="icon-btn send" aria-label="Send" disabled={!draft.trim() || thinking}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}

      {extractFor && (
        <ExtractModal count={extractFor.length} onLater={() => setExtractFor(null)}
          onExtract={(instructions) => extract(extractFor, instructions)} />
      )}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} reason={billing?.free_left === 0 ? "You've used your 3 free tries." : ""} />}
      {sheetFor && (
        <SheetModal receiptIds={sheetFor} onClose={() => setSheetFor(null)}
          onDone={(sheet) => {
            setSheets((s) => (s.some((x) => x.id === sheet.id) ? s : [...s, sheet]));
            setReceipts((list) => list.map((r) => sheetFor.includes(r.id)
              ? { ...r, sheet_id: sheet.id, exported_at: new Date().toISOString() } : r));
          }} />
      )}
    </div>
  );
}
