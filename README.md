# 🦋 Yutori — Espacio Creativo

Website and management panel for **Yutori**, a creative space in A Coruña that runs craft workshops and regular classes. Public site with workshop bookings and gift vouchers, plus a private admin panel with an AI assistant. Built with **Astro 7** on **Cloudflare Workers**, using **D1** (SQLite) and **R2** (photos).

## 📁 Project Structure

```
├── src/
│   ├── pages/
│   │   ├── index, espacio, clases, talleres/, bonos, privados, colabora → Public site
│   │   ├── reserva/[codigo], bono/[codigo], t/[codigo]                  → Booking, voucher and ticket pages by code
│   │   ├── clases/pedir-plaza                                           → Request a spot in a class
│   │   ├── api/stripe.ts                                                → Stripe webhook
│   │   ├── panel/                → Admin: agenda, bookings, classes, workshops, people, instructors, requests, assistant
│   │   ├── aviso-legal, privacidad, cookies, condiciones                → Legal pages
│   │   └── sitemap.xml.ts, robots.txt.ts, fotos/[...clave].ts           → SEO and photo serving from R2
│   ├── lib/                      → Business logic: reservas, clases, bonos, talleres, pagos, stripe, email,
│   │                               calendario, asistente, acceso, sesion, turnstile, csv, importar…
│   ├── components/               → Astro components (workshop card, reviews, Turnstile, legal text, panel forms…)
│   ├── layouts/                  → Base (public) and Panel layouts
│   ├── data/yutori.ts            → Business data: name, address, contact, Google reviews
│   ├── middleware.ts             → Security headers + panel protection
│   └── worker.ts                 → Worker entry: Astro handler + daily cron tasks
├── migrations/                   → 11 D1 migrations (tables, classes, bookings, calendar, vouchers, renewals…)
├── tests/                        → Vitest tests: assistant, vouchers, classes, payments, workshops, tasks
├── scripts/                      → Example data, text snapshot tool, kit-agents updater
├── docs/agentes/, diseno/        → Agent notes and design material
├── CLAUDE.md, AGENTS.md          → Project rules for AI coding agents
└── wrangler.jsonc                → Worker, D1 (DB), R2 (FOTOS) and cron config
```

## 🚀 How It Works

### Public site

Visitors browse workshops and classes, book a spot, request a place in a class, or buy a gift voucher. Each booking, voucher and ticket gets its own page by code. Payments go through **Stripe**, forms are protected with **Cloudflare Turnstile**, and confirmation emails are sent with **Resend** in the background (`waitUntil`) so a failed email never breaks a booking.

### Admin panel

`/panel` is protected by **Cloudflare Access** (one-time code by email). The middleware verifies the signed `Cf-Access-Jwt-Assertion` token with `jose`, so nobody can bypass the login by calling the Worker directly. From the panel the owner manages the agenda, bookings, classes and schedules, workshops, people, instructors and requests.

### AI assistant

The owner types or dictates what she wants ("move Ana to Thursday's class…"). **Groq** turns it into a list of typed actions (validated with **zod**) or asks one follow-up question; actions are shown for review before being applied. The conversation travels in a hidden form field — no extra database.

### Daily cron

`worker.ts` also exports `scheduled()`. Every morning it frees unpaid expired bookings, renews monthly classes from day 26 and charges renewals from day 1. All three tasks are idempotent.

## 🧠 Key Concepts

- **Astro on Cloudflare Workers** — static pages + server routes, middleware
- **Cloudflare D1 / R2** — SQL migrations, photo storage
- **Payments** — Stripe checkout and webhooks
- **Auth** — Cloudflare Access + JWT verification with JWKS
- **Bot protection** — Turnstile
- **LLM tool use** — natural language → validated actions with human review
- **Scheduled jobs** — idempotent cron tasks
- **Legal compliance (LSSI / GDPR)** — legal notice, privacy and cookies pages
- **Testing** — Vitest

## 🛠️ How To Run

```bash
npm install
npm run db:migrar:local
npm run db:ejemplo
npm run dev
```

Open `http://localhost:4321`. Run the tests with:

```bash
npm test
```

> Business data marked `TODO` in `src/data/yutori.ts` is placeholder and must be replaced before publishing. The site has `indexar: false` until launch.
