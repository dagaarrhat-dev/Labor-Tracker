# Labor Attendance Tracker

A real, deployable version of the labor attendance/payout tool — same
features as the prototype, backed by a real database (Supabase) instead of
the artifact sandbox, so multiple factories/sites can actually use it
independently from their own phones.

## What this is

- **Workers** — add each worker with a name and daily rate.
- **Today's Attendance** — mark Present / Half / Absent per worker per day, wage auto-calculated.
- **Payments** — log advances and settlements.
- **Ledger** — running balance owed per worker (earned minus paid).

Each factory/site gets its own **site code** — everyone who knows that code
sees the same shared data, similar to how a shared login code works. There
is no per-user password yet (see "Security note" below).

## One-time setup (about 15 minutes)

### 1. Create a Supabase project

1. Go to https://supabase.com and sign up (free tier is enough for this).
2. Create a new project. Pick any name and a strong database password
   (you won't need the password day-to-day — Supabase handles that).
3. Wait about a minute for the project to finish provisioning.

### 2. Create the database tables

1. In your Supabase project, open the **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/schema.sql` from this project, copy its entire contents,
   paste into the SQL Editor, and click **Run**.
4. You should see "Success. No rows returned." — that means the tables
   were created.

### 3. Get your project's API credentials

1. In Supabase, go to **Project Settings -> API**.
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **anon public** key (a long string starting with `eyJ...`).

### 4. Configure the app

1. In this project folder, copy `.env.example` to a new file named `.env.local`.
2. Paste your Project URL and anon key into it:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

### 5. Run it locally to test

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Try creating a
site code, adding a worker, and marking attendance — confirm it saves by
refreshing the page.

## Deploying so factories can actually use it

### Option A: Vercel (recommended, free)

1. Push this project to a GitHub repository (create one on github.com,
   then `git init`, `git add .`, `git commit -m "initial"`, `git remote add origin <your repo url>`, `git push -u origin main`).
2. Go to https://vercel.com, sign up, and click **Add New -> Project**.
3. Import your GitHub repo.
4. Before deploying, add the environment variables: in the project setup
   screen, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the
   same values from your `.env.local`.
5. Click **Deploy**. In about a minute you'll get a live URL like
   `https://labor-tracker-yourname.vercel.app`.
6. That URL is what you send to a factory/site — they open it, enter their
   own site code, and start using it independently.

### Option B: Netlify

Same idea as Vercel — connect the GitHub repo, set the same two
environment variables, deploy. Build command: `npm run build`. Output
directory: `dist`.

## Giving a new factory access

Nothing to configure — just give them the deployed URL and tell them to
make up a site code (e.g. `SHARMA-SITE-01`). The first time that code is
opened, the app creates it automatically. Every site's data is completely
separate from every other site's.

## Security note (important, read before real pilots)

Right now, "security" = knowing the site code. Anyone who has the code can
see and edit that site's data. This matches the original prototype's
security level and is fine for early pilots, but is **not** real
access control. Before this handles data multiple factories care about
being private from each other, consider adding:

- A PIN or password per site (a `pin` column on `labor_sites`, checked on
  open).
- Real user accounts via Supabase Auth, with row-level security policies
  scoped to a logged-in user's assigned sites instead of the current
  permissive "anyone can read/write" policies in `supabase/schema.sql`.

Both are natural next steps once you have real pilots asking for them —
not something to build speculatively before that.

## Project structure

```
labor-tracker-app/
  supabase/schema.sql   <- run this once in Supabase's SQL Editor
  src/
    supabaseClient.js   <- connects to your Supabase project
    data.js             <- all database read/write functions
    App.jsx             <- the actual app UI and logic
    main.jsx            <- React entry point
  .env.example          <- copy to .env.local and fill in your values
```
