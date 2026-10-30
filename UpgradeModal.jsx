import { useState } from "react";
import Modal from "./Modal.jsx";
import { callFn } from "./supabase.js";

export default function UpgradeModal({ onClose, reason }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upgrade() {
    setBusy(true); setError("");
    try {
      const { url } = await callFn("billing", { action: "subscribe", return_to: window.location.origin });
      window.location.href = url; // Paystack's secure checkout page
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Modal title="Upgrade to Ledgr Pro" onClose={onClose}>
      <p>{reason ? reason + " " : ""}Pro gives you 100 receipts and 50 AI questions every month for ₦5,000.</p>
      <div className="price-card">
        <div className="price-line"><span className="price-amount">₦5,000</span><span className="muted">/month</span></div>
        <ul className="perks">
          <li>100 receipts read every month</li>
          <li>50 AI questions about your receipts every month</li>
          <li>Send to Google Sheets anytime</li>
          <li>Cancel anytime</li>
        </ul>
      </div>
      <p className="muted small">Payments are processed securely by Paystack for FocusOnU Growth Consulting, the company behind Ledgr. Pay by card, bank transfer or USSD. Renews monthly. See our <a href="/terms" target="_blank" rel="noopener">Terms</a>.</p>
      {error && <p className="msg-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Not now</button>
        <button className="btn btn-primary" onClick={upgrade} disabled={busy}>
          {busy ? "Opening Paystack…" : "Upgrade for ₦5,000/month"}
        </button>
      </div>
    </Modal>
  );
}
