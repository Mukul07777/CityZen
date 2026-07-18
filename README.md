<div align="center">

# 🏙️ CityZen

**Report civic issues. See them actually resolved.**

A civic issue-reporting platform connecting citizens directly with the municipal official (MCD) responsible for their district — no complaints lost in a void.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Groq](https://img.shields.io/badge/Groq-Vision%20AI-orange)](https://groq.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-OpenStreetMap-199900?logo=leaflet)](https://leafletjs.com)

</div>

---

## Table of Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [MCD accounts](#mcd-accounts)
  - [Running the test suite](#running-the-test-suite)
- [Security model](#security-model)
- [Deploy](#deploy)

---

## What it does

Citizens report neighborhood problems — garbage, broken roads, faulty electricity, downed wires — with a photo and GPS location. The report is auto-routed to the municipal official responsible for that district, who marks it **seen**, then later **resolved** with photo proof. Every step is visible: districts and citizens are both ranked on public leaderboards, and every issue has a live progress tracker.

## Features

| Area | What it does |
|---|---|
| 📸 **Report an issue** | Photo upload, GPS location, auto-detected district, optional AI auto-fill (title/description/category/severity) from the photo via Groq vision. |
| 🔁 **Duplicate handling** | Reports within ~150m/14 days of an existing pending issue merge automatically. A second pass by photo similarity (perceptual hash) catches duplicates that don't share a location. Borderline-similar photos surface in an MCD "possible duplicates" review queue instead of auto-merging blindly. |
| 📊 **Priority sorting** | Issues rank by a weighted community-signal score (report count + confirmations + photo-evidence confirmations), not just recency. |
| 🧭 **Progress tracking** | A three-stage **Reported → Seen by MCD → Resolved** tracker per issue, with a dedicated detail page at `/issues/[id]`. |
| 👍 **Crowd verification** | Citizens can confirm ("still an issue," optionally with a fresh photo as evidence) or flag a pending report. |
| 🏛️ **MCD dashboard** | District-scoped queue with mark-seen / mark-resolved (proof required) actions — enforced server-side via Postgres RPC functions, not just UI-level checks. |
| 🏆 **Leaderboards** | Districts ranked by resolution score + average resolution time; citizens ranked by a weighted engagement score. Ranking only — no point redemption or rewards system. |
| 🌐 **Public Browse view** | Read-only, no login required — anyone can see the system is real and active. |
| 🗺️ **Map view** | Leaflet + OpenStreetMap pins for filtered issues on both Issues and Browse pages. No API key, no billing. |
| 🔔 **Notifications** | In-app bell notifying a citizen when their report is seen or resolved. |
| 🚦 **Rate limiting** | Max 5 new reports per user per rolling hour (merges don't count against it). |
| 🩹 **Error logging** | Client-side errors are written to a Supabase table instead of vanishing into the console. Every list/detail page has an error boundary with a retry state instead of a blank screen on failure. |

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | [Next.js](https://nextjs.org) 15 (App Router, Turbopack) | Server + client components, Route Handlers for server-only logic |
| Database / Auth / Storage | [Supabase](https://supabase.com) (Postgres) | RLS-enforced security, `security definer` RPCs as the real permission boundary — not client-trusted writes |
| AI vision | [Groq](https://groq.com) | Fast, cheap vision inference for photo auto-fill (optional feature) |
| Maps | [Leaflet](https://leafletjs.com) + OpenStreetMap | Free, no API key, no billing — chosen over Google Maps for that reason |
| Testing | [Vitest](https://vitest.dev) | Integration tests against a local Supabase instance for the RPC security layer |
| Styling | Tailwind CSS | Custom navy/cream/gold design tokens |

## Getting Started

1. Create a Supabase project at [supabase.com](https://supabase.com).

2. In the Supabase SQL Editor, run the migration files in this repo's `supabase/` folder **in order**:

   ```
   schema.sql
   migration_2_mcd_roles.sql
   migration_3_scoring_grouping.sql
   migration_4_crowd_verification.sql
   migration_5_photo_dedup.sql
   migration_6_notifications_public_access.sql
   migration_7_seen_status_evidence.sql
   migration_8_citizen_leaderboard.sql
   migration_9_hardening.sql
   migration_10_error_logs_notifications.sql
   migration_11_duplicate_review.sql
   ```

   Each file has a comment at the top noting which migration it depends on. `migration_9_hardening.sql` adds a `schema_migrations` table — worth checking after a fresh setup that all 11 are recorded there.

3. Create a Storage bucket named `issue-photos` (public) if one doesn't already exist — used for report photos and MCD proof-of-completion uploads.

4. Create `.env.local` in the project root:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://yourprojectref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key

   # Optional — powers the "Analyze with AI" auto-fill button on the report
   # form. Server-only; never prefix with NEXT_PUBLIC_.
   GROQ_API_KEY=your-groq-key
   GROQ_VISION_MODEL=llama-3.2-11b-vision-preview
   ```

   > `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the "publishable" key) is safe to be public — it's meant to ship in the browser bundle. `GROQ_API_KEY` and the Supabase **secret** key (not used by this app, but visible in the same dashboard) are not — never commit or share those.

5. Install dependencies and run the dev server:

   ```bash
   npm install --legacy-peer-deps
   npm run dev
   ```

   > `--legacy-peer-deps` is required because a couple of dependencies (`@moxy/react-split-text`, `react-leaflet`) haven't caught up their peer-dependency ranges to React 19 yet, even though they work fine with it.

6. Open [http://localhost:3000](http://localhost:3000).

### MCD accounts

There's no self-service MCD signup — intentional, since MCD accounts can mark issues resolved. To promote an existing user to an MCD account for a specific district, run in the SQL Editor **as the project owner**, not from the app:

```sql
select assign_mcd_role('the-user-email@example.com', 'District Name');
```

### Running the test suite

Integration tests cover the RPC security layer (`complete_issue`, `mark_seen`, `submit_report`, `react_to_post`, `assign_mcd_role`) against a **local** Supabase instance — never your real project. Requires the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase start
# apply all migration files above to the local instance, then:
npm test
```

See `tests/rpc-security.test.js` for details.

## Security model

Every state-changing action — completing an issue, marking it seen, submitting a report, reacting to a post, assigning an MCD role — goes through a Postgres `security definer` RPC function, not a direct client-side table write. That means:

- An MCD account can only act on issues in their own assigned district (checked server-side, not just hidden in the UI).
- Completing an issue requires photo/video proof — enforced in the database.
- MCD role assignment has no client-callable path at all; it's only runnable from the SQL Editor as the project owner.
- Row Level Security is enabled on every table, including internal ones (`schema_migrations`, `error_logs`) that the client has no legitimate reason to touch.

## Deploy

The easiest way to deploy is [Vercel](https://vercel.com/new) — set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`, and `GROQ_VISION_MODEL` in your Vercel project's environment variables.

---

<div align="center">

Built with [Next.js](https://nextjs.org/docs) · [Supabase](https://supabase.com/docs) · [Groq](https://console.groq.com/docs)

</div>
