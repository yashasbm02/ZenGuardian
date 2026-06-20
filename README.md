# 🛡️ ZenGuardian

**A GenAI-powered mental wellness companion for students grinding through high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE).** 

Taking an exam is stressful enough. ZenGuardian is here to help you unpack those feelings, track your stress over time, and provide you with an empathetic companion that remembers your journey. Simply journal how you feel, and ZenGuardian will analyze your emotions, retrieve your past entries, and stream back grounded, personalized support.

---

## 🚀 Try It Out (Demo)

Want to see ZenGuardian in action without setting up an account? Use our demo credentials:

- **Email:** `test@test.com`
- **Password:** `12345678`

*Note: Data in the demo account may be periodically cleared.*

---

## 📖 How It Works

1. **Journal Your Thoughts:** Write a quick entry about how your studies are going.
2. **AI Analysis:** Our models instantly analyze your text to identify primary emotions, detect triggers, and gauge your stress level on a scale of 1 to 10.
3. **Personalized Support:** ZenGuardian searches your past entries to understand your history, then streams a caring and highly personalized response to guide you through tough moments.
4. **Crisis Safety Net:** If ZenGuardian detects severe distress or explicit crisis language, it immediately surfaces professional helplines (like Tele-MANAS) to ensure you get the help you need.

---

## 🛠️ For Developers: Under the Hood

> Built for the *Google Build with AI* hackathon. Monolithic deployment (Express serves the React bundle) in a single Cloud Run container.

### Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Cloud Run container (port 8080)                             │
│                                                              │
│   React/Vite bundle  ──served by──►  Express                 │
│                                  ├─ /api/auth    (JWT in HTTP-only cookie)
│                                  ├─ /api/journal (analyze + RAG, SSE)
│                                  └─ /api/chat    (companion chatbot, SSE)
│                                              │               │
│                         ┌────────────────────┼─────────────┐ │
│                         ▼                    ▼             ▼ │
│                  Gemini embed          NVIDIA Kimi    NVIDIA Kimi
│                 (gemini-embedding-001) (analyze JSON) (chat stream)
│                         │                                     │
│                         ▼                                     │
│              MongoDB Atlas Vector Search (per-user RAG memory)│
└──────────────────────────────────────────────────────────────┘
```

**Tech Stack:** 
- **Frontend:** React 18 + Vite (TypeScript)
- **Backend:** Express + Mongoose (TypeScript)
- **Database:** MongoDB Atlas (with Vector Search)
- **AI Providers:** NVIDIA Kimi (`openai` SDK) for chat generation + Gemini (`@google/genai`) for embeddings.
- **Security:** Helmet, CORS, strict rate-limiting, and JWT auth in HTTP-only cookies.
- **Testing:** Vitest across frontend and backend.

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js 20+
- A **MongoDB Atlas** cluster (Vector Search needs Atlas — local `mongod` won't work)
- An **NVIDIA** inference key from [build.nvidia.com](https://build.nvidia.com)
- A **Google AI Studio** API key for Gemini 

### Running Locally

```bash
# 1. Start the Backend
cd backend
cp .env.example .env          # Fill in your real API keys here!
npm install
npm run dev                   # Starts on http://localhost:8080

# 2. Start the Frontend (in a separate terminal)
cd frontend
npm install
npm run dev                   # Starts on http://localhost:5173
```

Open **http://localhost:5173** in your browser. Vite proxies `/api` requests to the backend so everything works seamlessly.

---

## 🚀 Deployment (Cloud Run / Render)

You can easily deploy ZenGuardian using Docker or a provided Blueprint.

### Deploy to Render
We have provided a `render.yaml` Blueprint file. Simply connect your GitHub repository to your Render account, and it will automatically deploy the web service and inject your environment variables.

### Deploy to Google Cloud Run
```bash
docker build -t zenguardian .
gcloud run deploy zenguardian \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,MONGODB_URI=...,JWT_SECRET=...,NVIDIA_API_KEY=...,GEMINI_API_KEY=..."
```

---

## 🔒 Security & Accessibility Notes

- **Data Privacy:** Sensitive fields like passwords and vector embeddings are strictly excluded from normal database queries (`select: false`).
- **Accessibility:** Frontend components are built with Semantic HTML, `aria-labels`, focus traps, and screen-reader polite announcements.
- **Testing:** The codebase includes `vitest` coverage verifying authentication boundaries and crisis detection safety nets.
