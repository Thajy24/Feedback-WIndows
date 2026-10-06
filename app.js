const SUPABASE_URL = "https://mzjiyusbgtslfzchoykf.supabase.co";
const SUPABASE_KEY = "sb_publishable_6JGumr_7n73O3U6MjRdgkw_5mZH46cc";

const $ = id => document.getElementById(id);
const store = {
  get: k => JSON.parse(localStorage.getItem(k) || "null"),
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: k => localStorage.removeItem(k)
};
let userId = null;

/* ---------- Authentification ---------- */
async function authRequest(grant, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("Identifiants incorrects");
  const d = await r.json();
  const s = { access_token: d.access_token, refresh_token: d.refresh_token,
              expires_at: Date.now() + (d.expires_in - 60) * 1000, user_id: d.user.id, email: d.user.email };
  store.set("session", s);
  return s;
}
async function validSession() {
  let s = store.get("session");
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    try { s = await authRequest("refresh_token", { refresh_token: s.refresh_token }); }
    catch { store.del("session"); return null; }
  }
  return s;
}
async function api(path, opts = {}) {
  const s = await validSession();
  if (!s) throw new Error("Non connecté");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* ---------- Affichage ---------- */
async function init() {
  const s = await validSession();
  $("login").hidden = !!s;
  $("main").hidden = !s;
  if (!s) { window.native.unread(0); return; }
  userId = s.user_id;
  const p = await api(`profiles?id=eq.${userId}&select=nom`);
  $("who").textContent = p[0]?.nom || s.email;
  await render();
  check();
}

async function render(auto = false) {
  const list = $("list");
  // Ne pas effacer une réponse en cours de saisie
  if (auto && [...list.querySelectorAll("textarea")].some(t => t.value.trim() || t === document.activeElement)) return;

  const rows = await api(`feedbacks?agent_id=eq.${userId}&select=*,reponses(id,message,created_at)&order=created_at.desc&limit=50`);
  list.replaceChildren();
  if (!rows.length) { list.textContent = "Aucun feedback pour le moment."; return; }

  rows.forEach(f => {
    const div = document.createElement("div");
    div.className = "fb" + (f.lu ? "" : " unread");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = new Date(f.created_at).toLocaleString("fr-FR") + (f.lu ? "" : " · cliquez pour marquer comme lu");
    const msg = document.createElement("div");
    msg.className = "msg";
    msg.textContent = f.message;
    div.append(meta, msg);

    (f.reponses || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(r => {
      const d = document.createElement("div");
      d.className = "reply";
      const rm = document.createElement("div");
      rm.className = "meta";
      rm.textContent = "Votre réponse · " + new Date(r.created_at).toLocaleString("fr-FR");
      const rt = document.createElement("div");
      rt.className = "msg";
      rt.textContent = r.message;
      d.append(rm, rt);
      div.appendChild(d);
    });

    const open = document.createElement("button");
    open.type = "button";
    open.className = "link";
    open.style.marginTop = "6px";
    open.textContent = "Répondre";
    const box = document.createElement("div");
    box.hidden = true;
    box.style.marginTop = "6px";
    const ta = document.createElement("textarea");
    ta.placeholder = "Votre réponse...";
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = "Envoyer la réponse";
    box.append(ta, send);
    open.addEventListener("click", ev => { ev.stopPropagation(); box.hidden = !box.hidden; if (!box.hidden) ta.focus(); });
    box.addEventListener("click", ev => ev.stopPropagation());
    send.addEventListener("click", async ev => {
      ev.stopPropagation();
      const message = ta.value.trim();
      if (!message) return;
      send.disabled = true;
      try {
        await api("reponses", { method: "POST", body: JSON.stringify({ feedback_id: f.id, auteur_id: userId, message }) });
        await render();
      } catch (e) {
        alert("Envoi impossible : " + e.message);
        send.disabled = false;
      }
    });
    div.append(open, box);

    if (!f.lu) {
      div.addEventListener("click", async () => {
        await api(`feedbacks?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ lu: true }) });
        div.classList.remove("unread");
        check();
      }, { once: true });
    }
    list.appendChild(div);
  });
}

/* ---------- Pop-up : un pour chaque feedback non lu ---------- */
async function check() {
  try {
    const s = await validSession();
    if (!s) return;
    const rows = await api(`feedbacks?agent_id=eq.${s.user_id}&lu=eq.false&select=id,message,created_at&order=created_at.asc`);
    window.native.unread(rows.length);
    window.native.popup(rows.map(r => ({ id: r.id, message: r.message, date: r.created_at })));
    await render(true);
  } catch (e) { console.error(e); }
}

async function markRead(id) {
  await api(`feedbacks?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ lu: true }) });
}
window.native.onMarkRead(async id => {
  try { await markRead(id); } catch (e) { console.error(e); }
  check();
});
window.native.onReply(async ({ id, message }) => {
  try {
    await api("reponses", { method: "POST", body: JSON.stringify({ feedback_id: id, auteur_id: userId, message }) });
    await markRead(id);
  } catch (e) { console.error(e); }
  check();
});

$("loginBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try {
    await authRequest("password", { email: $("email").value.trim(), password: $("password").value });
    $("password").value = "";
    await init();
  } catch (e) { $("loginErr").textContent = e.message; }
});
$("logoutBtn").addEventListener("click", () => {
  store.del("session");
  init();
});

init().catch(console.error);
setInterval(check, 30000);
