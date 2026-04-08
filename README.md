# Budget Governance Web Application

AI-powered budget governance with project budgets, invoice parsing (Gemini), payments, and approval workflows.

## Tech Stack

- **Frontend:** React, Material UI, Vite
- **Backend:** Node.js, Express
- **Database:** Firebase Firestore
- **AI:** Google Gemini API (invoice parsing, executive summary)
- **Deploy:** Docker, Google Cloud Run

## Project Structure

```
budget-governance-app/
├── frontend/          # React + MUI
├── backend/           # Express API
├── Dockerfile         # Single image: backend + static frontend
└── README.md
```

## Prerequisites

- Node.js 18+
- Firebase project with Firestore
- Google AI Studio API key (Gemini)
- (Optional) Docker for deployment

## Setup

### 1. Firebase

1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. Enable **Firestore**.
3. Go to Project Settings → Service accounts → Generate new private key. Save the JSON.
4. In Firestore, create a **users** collection (optional: add a first user document with `email`, `password`, `name`, `role` for testing).

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

- `PORT` – e.g. 4000
- `JWT_SECRET` – strong random string
- `FIREBASE_PROJECT_ID` – from Firebase project settings
- `FIREBASE_CLIENT_EMAIL` – from service account JSON
- `FIREBASE_PRIVATE_KEY` – full private key from JSON (keep quotes, use `\n` for newlines)
- `GEMINI_API_KEY` – from [Google AI Studio](https://aistudio.google.com/apikey)

```bash
npm install
npm run dev
```

API: `http://localhost:4000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000` (proxies `/api` to backend).

### 4. First user

Open the app → **Register** → create a user with role **Admin**. Then use Login.

## Roles

- **Admin** – Full access (budgets, invoices, payments, approvals).
- **Requestor** – Create invoices, NFA.
- **Approver** – Approve/reject NFA.
- **Finance** – Budgets, invoices, payments.

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| GET | /api/auth/me | Current user (auth) |
| GET/POST | /api/budgets | List, create projects |
| GET/PATCH | /api/budgets/:id | Get, update budget |
| GET/POST | /api/invoices | List, create invoice |
| POST | /api/invoices/upload | Upload PDF, parse with Gemini |
| GET/POST | /api/payments | List, record payment |
| GET/POST | /api/approvals | NFA list, create |
| POST | /api/approvals/:id/submit | Submit NFA |
| POST | /api/approvals/:id/approve | Approve/reject |
| GET | /api/dashboard | Dashboard stats |
| GET | /api/dashboard/summary | AI executive summary |

## Docker & Cloud Run

Build:

```bash
docker build -t budget-governance .
```

Run locally (set env vars or use `.env`):

```bash
docker run -p 8080:8080 --env-file backend/.env budget-governance
```

Deploy to Google Cloud Run:

1. Push image to Artifact Registry (or use Cloud Build).
2. Create a Cloud Run service from the image.
3. Set environment variables (same as backend `.env`) in the Cloud Run service.
4. Use a strong `JWT_SECRET` and keep Firebase and Gemini keys secret.

## Firebase configuration (frontend)

For local development the frontend talks to the backend only (proxy). If you later add Firebase Auth or client SDK, use `frontend/.env` and the placeholders in `frontend/src/firebase.js` (see `frontend/.env.example`).

## License

MIT
