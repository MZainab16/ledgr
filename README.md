# Ledgr

Snap a receipt, get a clean spreadsheet. Users sign in, upload receipt photos or PDFs in a chat,
Claude reads them, the results show as a tidy table, and they're saved to Google Sheets.
Users can also ask questions about any receipt they've uploaded before.

## How it's built

| Part | Tool | What it does |
|---|---|---|
| App screens | React + Vite, hosted on Netlify | Sign in, chat, upload, tables, pop-ups |
| Accounts | Supabase Auth | Sign up, sign in, password reset |
| Database | Supabase Postgres with Row Level Security | Each user can only ever see their own data |
| File storage | Private Supabase bucket `receipts` | Receipt images, one folder per user |
| Server code | Supabase Edge Functions (replaces n8n) | `extract-receipt`, `chat`, `google-auth`, `sheets` |
| AI | Claude API | Reads receipts and answers questions |
| Export | Google Sheets API (`drive.file` scope) | Ledgr only sees sheets it created |

Supabase project: `ledgr` (id `vbqzuetpdsudcbisvcqu`, London region).

## Folder map

```
src/
  App.jsx                 sign-in check and password reset screen
  components/Auth.jsx     sign in / sign up
  components/Chat.jsx     main screen: timeline, upload, chat box
  components/ReceiptCard.jsx   one receipt with its extracted table
  components/ExtractModal.jsx  "Extract information?" pop-up
  components/SheetModal.jsx    connect Google, new or existing sheet
  lib/supabase.js         connection to Supabase + callFn helper
  lib/image.js            shrinks big photos before upload
  styles.css              all styling, light and dark mode
supabase/functions/       the 4 server functions
```

## Setup checklist

### 1. Claude API key
1. Go to https://console.anthropic.com and sign in.
2. Add billing credit (a few dollars is plenty for testing).
3. API Keys, then Create Key. Copy it (starts with `sk-ant-`).

### 2. Google Cloud (about 15 minutes)
1. Open https://console.cloud.google.com and create a new project called **Ledgr**.
2. Go to **APIs & Services, Library**. Search and **Enable** both: **Google Sheets API** and **Google Drive API**.
3. Go to **Google Auth Platform** (or **OAuth consent screen**). Choose **External**.
   App name: Ledgr. Add your email as support and developer contact.
4. Under **Data access / Scopes**, add: `openid`, `.../auth/userinfo.email`, `.../auth/drive.file`.
5. Under **Audience / Test users**, add your own Gmail (and anyone testing with you, up to 100).
6. Go to **Clients / Credentials, Create OAuth client ID**. Type: **Web application**.
   Under **Authorized redirect URIs** add exactly:
   `https://vbqzuetpdsudcbisvcqu.supabase.co/functions/v1/google-auth/callback`
7. Copy the **Client ID** and **Client Secret**.

### 3. Supabase secrets
Supabase dashboard, project `ledgr`, **Edge Functions, Secrets**. Add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude key |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `GOOGLE_CLIENT_SECRET` | from step 2 |
| `APP_URL` | your Netlify address, e.g. `https://ledgr-app.netlify.app` |

Never put these in the React code or in GitHub.

### 4. Supabase sign-in links
**Authentication, URL Configuration**: set **Site URL** to your Netlify address and add
`http://localhost:5173` under Redirect URLs, so email confirmation links come back to the app.

### 5. Run it on your computer
```
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173

### 6. Deploy
Push this folder to GitHub, then in Netlify: Add new site, Import from GitHub.
`netlify.toml` already holds the build settings.

## Troubleshooting

| You see | Likely cause | Fix |
|---|---|---|
| "Server is missing the ANTHROPIC_API_KEY secret" | Secret not added | Step 3 |
| "Google is not set up on the server yet" | Google secrets missing | Step 3 |
| Google shows "redirect_uri_mismatch" | Redirect URI typo | Copy it exactly from step 2.6 |
| Google shows "access blocked" | Your Gmail isn't a test user | Step 2.5 |
| Confirmation email link opens localhost | Site URL not set | Step 4 |
| "AI could not read this file (error 401)" | Wrong or expired Claude key | Make a new key |

Function logs: Supabase dashboard, Edge Functions, pick a function, **Logs**.

## Known limits of this MVP
- The assistant looks at your 150 most recent receipts when answering. Fine for now; later we can add search.
- Before public launch, Google must verify the app (privacy policy page and a short review).
