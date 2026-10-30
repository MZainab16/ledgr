import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import Auth from "./Auth.jsx";
import Chat from "./Chat.jsx";
import PasswordInput from "./PasswordInput.jsx";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="splash"><Wordmark /></div>;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  return session ? <Chat session={session} /> : <Auth />;
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className="logo-mark">
      <rect width="512" height="512" rx="112" fill="#163A2C" />
      <rect x="160" y="104" width="70" height="230" rx="10" fill="#FFFFFF" />
      <rect x="160" y="268" width="192" height="66" rx="10" fill="#FFFFFF" />
      <rect x="160" y="362" width="192" height="16" rx="8" fill="#C6F33D" />
      <rect x="160" y="394" width="192" height="16" rx="8" fill="#C6F33D" />
    </svg>
  );
}

export function Wordmark({ small }) {
  return (
    <a href="/" className={small ? "wordmark wordmark-sm" : "wordmark"} aria-label="Ledgr home">
      <LogoMark /><span>Ledgr</span>
    </a>
  );
}

function NewPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message); else onDone();
  }
  return (
    <main className="auth">
      <div className="auth-head"><Wordmark /></div>
      <form className="auth-form" onSubmit={save}>
        <h1>Choose a new password</h1>
        <label>New password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className="msg-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </main>
  );
}
