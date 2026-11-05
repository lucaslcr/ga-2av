// API de sincronização: /api/check, /api/register, /api/login, /api/progress, /api/logout
const MAX_DATA = 256 * 1024;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const USER_RE = /^[a-z0-9._]{3,20}$/;
const PIN_RE = /^\d{4}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const err = (msg, status = 400) => json({ error: msg }, status);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256
  );
  return hex(bits);
}
async function sha(s) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const normUser = (u) => String(u || "").trim().toLowerCase().replace(/^@/, "");

async function newSession(db, username) {
  const token = randHex(32);
  await db.prepare("INSERT INTO sessions (token_hash, username, created) VALUES (?, ?, ?)")
    .bind(await sha(token), username, Date.now()).run();
  return token;
}
async function auth(db, request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) return null;
  const row = await db.prepare("SELECT username FROM sessions WHERE token_hash = ?").bind(await sha(m[1])).first();
  return row ? row.username : null;
}
async function body(request) {
  try {
    const t = await request.text();
    if (t.length > MAX_DATA + 4096) return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// Cria as tabelas na primeira chamada de cada instância (não faz nada se já existem).
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, data TEXT, ts INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, created INTEGER NOT NULL)"),
      db.prepare("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(username)"),
    ]).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return err("Banco de dados não configurado.", 500);
  const route = (params.path || []).join("/");
  const method = request.method;

  try {
    await ensureSchema(db);
    if (route === "check" && method === "GET") {
      const u = normUser(new URL(request.url).searchParams.get("u"));
      if (!USER_RE.test(u)) return json({ ok: false, reason: "invalid" });
      const row = await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(u).first();
      return json({ ok: !row, reason: row ? "taken" : null });
    }

    if (route === "register" && method === "POST") {
      const b = await body(request);
      if (!b) return err("Pedido inválido.");
      const u = normUser(b.username), name = String(b.name || "").trim().slice(0, 40), pin = String(b.pin || "");
      if (!name) return err("Escreva seu nome.");
      if (!USER_RE.test(u)) return err("Usuário: de 3 a 20 caracteres, só letras minúsculas, números, ponto ou _.");
      if (!PIN_RE.test(pin)) return err("O PIN tem que ter 4 números.");
      let data = null, ts = 0;
      if (b.data && typeof b.data === "object") {
        data = JSON.stringify(b.data);
        if (data.length > MAX_DATA) return err("Progresso grande demais.", 413);
        ts = Date.now();
      }
      const salt = randHex(16);
      const ph = await hashPin(pin, salt);
      const r = await db.prepare(
        "INSERT INTO users (username, name, pin_hash, salt, data, ts, created) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username) DO NOTHING"
      ).bind(u, name, ph, salt, data, ts, Date.now()).run();
      if (!r.meta || r.meta.changes !== 1) return err("Esse usuário já está em uso. Escolha outro.", 409);
      const token = await newSession(db, u);
      return json({ token, username: u, name, ts });
    }

    if (route === "login" && method === "POST") {
      const b = await body(request);
      if (!b) return err("Pedido inválido.");
      const u = normUser(b.username), pin = String(b.pin || "");
      const row = await db.prepare("SELECT * FROM users WHERE username = ?").bind(u).first();
      if (!row) return err("Usuário não encontrado.", 404);
      const now = Date.now();
      if (row.locked_until > now) {
        const min = Math.ceil((row.locked_until - now) / 60000);
        return err("Muitas tentativas erradas. Tente de novo em " + min + " min.", 429);
      }
      const ph = await hashPin(pin, row.salt);
      if (!safeEq(ph, row.pin_hash)) {
        const fails = row.fails + 1;
        const lock = fails >= MAX_FAILS ? now + LOCK_MS : 0;
        await db.prepare("UPDATE users SET fails = ?, locked_until = ? WHERE username = ?")
          .bind(lock ? 0 : fails, lock, u).run();
        return err(lock ? "PIN incorreto. Conta bloqueada por 15 min." : "PIN incorreto.", 401);
      }
      await db.prepare("UPDATE users SET fails = 0, locked_until = 0 WHERE username = ?").bind(u).run();
      const token = await newSession(db, u);
      return json({ token, username: u, name: row.name, data: row.data ? JSON.parse(row.data) : null, ts: row.ts });
    }

    if (route === "progress") {
      const u = await auth(db, request);
      if (!u) return err("Sessão expirada. Entre de novo.", 401);
      if (method === "GET") {
        const row = await db.prepare("SELECT name, data, ts FROM users WHERE username = ?").bind(u).first();
        if (!row) return err("Usuário não encontrado.", 404);
        return json({ username: u, name: row.name, data: row.data ? JSON.parse(row.data) : null, ts: row.ts });
      }
      if (method === "PUT") {
        const b = await body(request);
        if (!b || !b.data || typeof b.data !== "object") return err("Pedido inválido.");
        const data = JSON.stringify(b.data);
        if (data.length > MAX_DATA) return err("Progresso grande demais.", 413);
        const ts = Date.now();
        await db.prepare("UPDATE users SET data = ?, ts = ? WHERE username = ?").bind(data, ts, u).run();
        return json({ ok: true, ts });
      }
    }

    if (route === "logout" && method === "POST") {
      const h = request.headers.get("authorization") || "";
      const m = h.match(/^Bearer ([a-f0-9]{64})$/);
      if (m) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(m[1])).run();
      return json({ ok: true });
    }

    return err("Rota não encontrada.", 404);
  } catch (e) {
    return err("Erro no servidor.", 500);
  }
}
