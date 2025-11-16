import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GROQ_KEY = process.env.GROQ_KEY || '';

// Simple persistent history store (file-backed)
const HISTORY_FILE = path.join(__dirname, 'history.json');
let history = [];
try {
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8') || '[]');
  }
} catch (e) {
  console.error('Failed to load history:', e.message);
  history = [];
}
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save history:', e.message);
  }
}

/* ----------------------
   Helper: call Groq AI
   ---------------------- */
async function callGroq(prompt) {
  if (!GROQ_KEY) throw new Error('GROQ_KEY not set on server');
  const payload = {
    model: "llama-3.1-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 800,
    temperature: 0.6
  };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Groq API error: ${t}`);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content || j?.choices?.[0]?.text || '';
  return text;
}

/* =========================
   AI endpoint (basic)
   POST /ai  { prompt }
   ========================= */
app.post('/ai', async (req, res) => {
  const prompt = req.body && req.body.prompt ? String(req.body.prompt) : '';
  if (!prompt) return res.status(400).json({ error: 'Prompt empty' });
  try {
    const reply = await callGroq(prompt);
    // store in history
    history.push({ id: Date.now(), prompt, reply, ts: new Date().toISOString() });
    saveHistory();
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/* =========================
   AI streaming (SSE simulated)
   GET /ai/stream?prompt=...
   This will call Groq, then stream the reply in small chunks via SSE.
   If Groq supports streaming in future, replace with real streaming.
   ========================= */
app.get('/ai/stream', async (req, res) => {
  const prompt = req.query.prompt || '';
  if (!prompt) return res.status(400).json({ error: 'Prompt missing' });

  // Tell client this is an event-stream (SSE)
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  try {
    const reply = await callGroq(prompt);
    // Save to history at end
    history.push({ id: Date.now(), prompt, reply, ts: new Date().toISOString() });
    saveHistory();

    // simulate streaming by chunking into sentences or fixed sizes
    const CHUNK_SIZE = 60;
    let sent = 0;
    while (sent < reply.length) {
      const chunk = reply.slice(sent, sent + CHUNK_SIZE);
      // send event
      res.write(`data: ${chunk}\n\n`);
      sent += CHUNK_SIZE;
      // small delay to simulate typing (server-side)
      await new Promise(r => setTimeout(r, 120));
    }
    // send end marker
    res.write(`event: done\ndata: [DONE]\n\n`);
    res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${String(err.message)}\n\n`);
    res.end();
  }
});

/* =========================
   YouTube transcript helper (best-effort stub)
   GET /yt/transcript?url=...
   NOTE: Many transcripts require parsing or third-party API.
   This endpoint will attempt to fetch the youtube transcript via
   a public transcript host if available, otherwise returns a helpful message.
   ========================= */
app.get('/yt/transcript', async (req, res) => {
  const url = req.query.url || '';
  if (!url) return res.status(400).json({ error: 'url missing' });
  try {
    // extract video id if possible
    let vid = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) vid = u.pathname.slice(1);
      if (u.hostname.includes('youtube.com')) vid = new URLSearchParams(u.search).get('v');
    } catch (e) {}
    if (!vid) return res.json({ error: 'Could not parse video id. Provide a full YouTube URL.' });

    // Try to fetch transcripts from youtube transcripts service (unofficial).
    // We'll use an unauthenticated domain that some services provide; if it fails, return guidance.
    const transcriptApi = `https://r.jina.ai/http://r.jina.ai/http://r.jina.ai/http://r.jina.ai/http://r.jina.ai/http://r.jina.ai/https://yewtu.cafe/watch?v=${vid}`;
    // Fallback: not reliable. We'll inform user how to proceed.
    res.json({
      error: 'Transcript fetching is environment-dependent. Use an external transcript service or provide the text. This endpoint is a stub to show where to implement transcript fetching.'
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/* =========================
   Instagram caption generator
   POST /ig/caption  { text, tone? }
   Uses Groq AI to create captions from provided description.
   ========================= */
app.post('/ig/caption', async (req, res) => {
  const text = req.body && req.body.text ? String(req.body.text) : '';
  const tone = req.body && req.body.tone ? String(req.body.tone) : 'inspiratif';
  if (!text) return res.status(400).json({ error: 'text missing' });
  try {
    const prompt = `Buatkan caption Instagram singkat dan menarik dalam bahasa Indonesia dengan tone ${tone} berdasarkan teks ini: ${text}. Sertakan 3 tagar relevan.`;
    const reply = await callGroq(prompt);
    // save history
    history.push({ id: Date.now(), type: 'ig_caption', text, tone, reply, ts: new Date().toISOString() });
    saveHistory();
    res.json({ caption: reply });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/* =========================
   History endpoints
   GET /history -> list
   POST /history/clear -> clear history
   ========================= */
app.get('/history', (req, res) => {
  res.json(history.slice().reverse()); // latest first
});
app.post('/history/clear', (req, res) => {
  history = [];
  saveHistory();
  res.json({ ok: true });
});

/* =========================
   Serve SPA index
   ========================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
