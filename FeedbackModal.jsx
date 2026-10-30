import { useState } from "react";
import Modal from "./Modal.jsx";
import { supabase } from "./supabase.js";

const FACES = [
  { v: 1, e: "😞", l: "Very poor" },
  { v: 2, e: "🙁", l: "Poor" },
  { v: 3, e: "😐", l: "Okay" },
  { v: 4, e: "🙂", l: "Good" },
  { v: 5, e: "😍", l: "Love it" },
];
const TYPES = [
  { v: "idea", l: "Idea" },
  { v: "problem", l: "Problem" },
  { v: "praise", l: "Praise" },
  { v: "other", l: "Other" },
];

// Short feedback form for signed-in users. Saved to the feedback table in Supabase.
export default function FeedbackModal({ email, onClose, onSent }) {
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setError("Pick a face to rate Ledgr."); return; }
    setBusy(true); setError("");
    const { error } = await supabase.from("feedback").insert({
      rating, category, message: message.trim().slice(0, 2000) || null, email, source: "dashboard",
    });
    setBusy(false);
    if (error) { setError("Couldn't send that. Please try again."); return; }
    setSent(true);
    onSent?.();
  }

  return (
    <Modal title={sent ? "Thank you!" : "Send feedback"} onClose={onClose}>
      {sent ? (
        <>
          <p>Your feedback goes straight to the Ledgr team and helps us make it better for you.</p>
          <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <form className="feedback-form" onSubmit={submit}>
          <fieldset>
            <legend>How is Ledgr working for you?</legend>
            <div className="faces">
              {FACES.map((f) => (
                <button type="button" key={f.v} className={"face" + (rating === f.v ? " on" : "")}
                  aria-pressed={rating === f.v} aria-label={f.l} title={f.l} onClick={() => setRating(f.v)}>
                  <span aria-hidden="true">{f.e}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>What's it about?</legend>
            <div className="type-chips">
              {TYPES.map((t) => (
                <button type="button" key={t.v} className={"type-chip" + (category === t.v ? " on" : "")}
                  aria-pressed={category === t.v} onClick={() => setCategory(t.v)}>{t.l}</button>
              ))}
            </div>
          </fieldset>
          <label className="field-label">Tell us more (optional)
            <textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you like, what's confusing, what should we add?" />
          </label>
          {error && <p className="msg-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send feedback"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
