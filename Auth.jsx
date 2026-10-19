import { useState } from "react";
import { supabase } from "./supabase.js";
import { Wordmark } from "./App.jsx";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email and tap the link to confirm your account.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-head">
        <Wordmark />
        <p className="auth-tag">Snap a receipt. Get a clean spreadsheet.</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <h1>{mode === "signup" ? "Create your account" : mode === "signin" ? "Sign in" : "Reset password"}</h1>

        {mode === "signup" && (
          <label>Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== "reset" && (
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required />
          </label>
        )}

        {error && <p className="msg-error" role="alert">{error}</p>}
        {notice && <p className="msg-notice">{notice}</p>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link"}
        </button>

        <div className="auth-switch">
          {mode === "signin" && <>
            <button type="button" className="link" onClick={() => setMode("signup")}>New here? Create an account</button>
            <button type="button" className="link" onClick={() => setMode("reset")}>Forgot password?</button>
          </>}
          {mode !== "signin" && (
            <button type="button" className="link" onClick={() => setMode("signin")}>Back to sign in</button>
          )}
        </div>
      </form>
      <p className="auth-foot">Your receipts are private to your account.</p>
    </main>
  );
}
