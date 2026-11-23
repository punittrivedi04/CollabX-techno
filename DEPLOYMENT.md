# CollabX Production Deployment Guide

This guide walks you through deploying **CollabX** to cloud platforms (**Render** for the Backend and **Vercel** for the Frontend).

---

## Architecture Overview
- **Frontend:** React 19 + Vite + Tailwind CSS (Hosted on **Vercel** / **Netlify**)
- **Backend:** Node.js + Express + Socket.IO (Hosted on **Render** / **Railway** / **VPS**)
- **Database:** PostgreSQL (Hosted on **Supabase** / **Neon**)
- **Email:** SMTP (Google Workspace / Gmail App Password) or Resend API

---

## 1. Database Setup (Supabase)
If you already have your PostgreSQL connection string, keep it ready:
```text
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
```
To initialize tables and performance indexes on an empty database:
```bash
cd server
npm run db:init
```

---

## 2. Deploying Backend to Render (Free / Paid)

1. Push your repository to **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
3. Select your repository.
4. Configure the Web Service:
   - **Name:** `collabx-backend`
   - **Region:** Singapore / Frankfurt / Oregon (choose closest to your users)
   - **Root Directory:** `server` (or `CollabX-techno-main/server` if repository is nested)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Advanced** -> **Add Environment Variable**:
   | Variable | Example Value | Description |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production optimizations & security |
   | `PORT` | `5000` | Application port (Render auto-manages) |
   | `DATABASE_URL` | `postgresql://...` | Your PostgreSQL connection string |
   | `JWT_SECRET` | `your_at_least_32_characters_secret_key` | Secret key for JWT signing |
   | `CLIENT_URL` | `https://collabx.vercel.app` | URL of your deployed frontend |
   | `SMTP_HOST` | `smtp.gmail.com` | SMTP host for emails |
   | `SMTP_PORT` | `587` | SMTP port |
   | `SMTP_USER` | `your_email@gmail.com` | Email address sending notifications/OTPs |
   | `SMTP_PASS` | `xxxx xxxx xxxx xxxx` | 16-character Google App Password |
   | `SMTP_SECURE` | `false` | Set `false` for port 587, `true` for port 465 |
   | `EMAIL_FROM` | `CollabX <your_email@gmail.com>` | Display sender in outgoing emails |
6. Click **Deploy Web Service**.
7. Once deployed, note down your backend URL: e.g., `https://collabx-backend.onrender.com`.

---

## 3. Deploying Frontend to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. Configure Project Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click Edit and select `client` (or `CollabX-techno-main/client` if nested).
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Expand **Environment Variables** and add:
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://collabx-backend.onrender.com/api` |
   | `VITE_SOCKET_URL` | `https://collabx-backend.onrender.com` |
5. Click **Deploy**.
6. Once deployed, Vercel gives you a URL like: `https://collabx.vercel.app`.

---

## 4. Connecting Frontend & Backend (CORS)

Now that both are deployed, update the `CLIENT_URL` on Render:
1. Go to your Render Web Service -> **Environment**.
2. Set `CLIENT_URL` to your Vercel URL:
   ```text
   CLIENT_URL=https://collabx.vercel.app
   ```
   *(If you have multiple domains or local preview, separate with comma: `https://collabx.vercel.app,http://localhost:5173`)*
3. Render will automatically redeploy with the updated CORS policy.

---

## 5. Verification Checklist

- [ ] Health check probe: Visit `https://your-backend.onrender.com/api/health` -> should return `status: "ok"`.
- [ ] Frontend loads: Visit `https://your-frontend.vercel.app/login`.
- [ ] Signup & Login: Test student, mentor, and director logins.
- [ ] OTP & Email: Forgot password sends live branded OTP.
- [ ] Real-time Chat: Socket.IO connects without CORS error.
- [ ] Director Student View: `/director/students` lists all students, search works, and project inspect drawer opens.
