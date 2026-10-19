// Sends extracted receipts to Google Sheets.
// Actions (POST body { action, ... }):
//   status                           -> is Google connected? which sheets were made through Ledgr?
//   create  { title, receipt_ids }   -> make a new sheet, then add the receipts
//   append  { sheet_id, receipt_ids }-> add receipts to a sheet the user connected before
//   disconnect                       -> remove Google access
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

class NeedsGoogle extends Error {}

async function getAccessToken(userId: string): Promise<string> {
  const { data: conn } = await admin.from("google_connections")
    .select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!conn) throw new NeedsGoogle("Connect your Google account first.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.json();
  if (!res.ok) {
    if (t.error === "invalid_grant") {
      // User removed Ledgr's access in their Google account.
      await admin.from("google_connections").delete().eq("user_id", userId);
      throw new NeedsGoogle("Google access expired. Please connect again.");
    }
    throw new Error("Could not reach Google. Try again.");
  }
  return t.access_token;
}

// Turn each receipt into a tidy block of rows. The layout follows whatever columns the AI chose.
// deno-lint-ignore no-explicit-any
function receiptToRows(r: any): (string | number)[][] {
  const x = r.extracted ?? {};
  const rows: (string | number)[][] = [];
  rows.push([
    `Receipt: ${r.merchant ?? "Unknown"}`,
    r.receipt_date ?? "",
    r.total != null ? `${r.currency ?? ""} ${r.total}`.trim() : "",
    `Added by Ledgr ${new Date().toISOString().slice(0, 10)}`,
  ]);
  for (const f of x.fields ?? []) rows.push([f.label, f.value]);
  if ((x.columns ?? []).length) {
    rows.push([]);
    rows.push(x.columns);
    for (const row of x.rows ?? []) rows.push(row);
  }
  if (x.notes) rows.push(["Notes", x.notes]);
  rows.push([]);
  rows.push([]);
  return rows;
}

async function appendReceipts(token: string, spreadsheetId: string, receipts: unknown[]) {
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (meta.status === 404) throw new Error("That sheet no longer exists in Google Drive.");
  if (!meta.ok) throw new Error("Could not open the sheet in Google.");
  const tab = (await meta.json()).sheets?.[0]?.properties?.title ?? "Sheet1";

  const values = receipts.flatMap(receiptToRows);
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1`);
  // RAW = values are stored as plain text/numbers, so nothing on a receipt can run as a formula.
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) {
    console.error("Sheets append error", await res.text());
    throw new Error("Google Sheets refused the update. Try again.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Please sign in again." }, 401);
    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const body = await req.json();
    const action = body.action;

    if (action === "status") {
      const [{ data: conn }, { data: sheets }] = await Promise.all([
        admin.from("google_connections").select("google_email").eq("user_id", user.id).maybeSingle(),
        supabase.from("sheets").select("*").order("created_at", { ascending: false }),
      ]);
      return json({ connected: !!conn, email: conn?.google_email ?? null, sheets: sheets ?? [] });
    }

    if (action === "disconnect") {
      const { data: conn } = await admin.from("google_connections")
        .select("refresh_token").eq("user_id", user.id).maybeSingle();
      if (conn) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, {
          method: "POST",
        }).catch(() => {});
        await admin.from("google_connections").delete().eq("user_id", user.id);
      }
      return json({ connected: false });
    }

    const ids: string[] = Array.isArray(body.receipt_ids) ? body.receipt_ids.slice(0, 50) : [];
    if (!ids.length) return json({ error: "Pick at least one receipt." }, 400);
    const { data: receipts } = await supabase.from("receipts")
      .select("*").in("id", ids).eq("status", "extracted").order("created_at");
    if (!receipts?.length) return json({ error: "No extracted receipts found." }, 400);

    const token = await getAccessToken(user.id);
    let sheet;

    if (action === "create") {
      const title = (body.title ?? "").toString().trim().slice(0, 100) || "Ledgr receipts";
      const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { title } }),
      });
      if (!res.ok) {
        console.error("Sheets create error", await res.text());
        throw new Error("Could not create the Google Sheet.");
      }
      const created = await res.json();
      const { data, error } = await admin.from("sheets").insert({
        user_id: user.id, spreadsheet_id: created.spreadsheetId, title, url: created.spreadsheetUrl,
      }).select().single();
      if (error) throw error;
      sheet = data;
    } else if (action === "append") {
      const { data } = await supabase.from("sheets").select("*").eq("id", body.sheet_id).maybeSingle();
      if (!data) return json({ error: "Sheet not found." }, 404);
      sheet = data;
    } else {
      return json({ error: "Unknown action." }, 400);
    }

    await appendReceipts(token, sheet.spreadsheet_id, receipts);
    await supabase.from("receipts")
      .update({ sheet_id: sheet.id, exported_at: new Date().toISOString() }).in("id", ids);

    return json({ sheet, count: receipts.length });
  } catch (e) {
    if (e instanceof NeedsGoogle) return json({ error: e.message, needs_google: true }, 409);
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
