const SUPABASE_URL = "https://mzjiyusbgtslfzchoykf.supabase.co";
const SUPABASE_KEY = "sb_publishable_6JGumr_7n73O3U6MjRdgkw_5mZH46cc";
const BUCKET = "feedback-images";
const MAX_IMG = 5 * 1024 * 1024; // 5 Mo

const $ = id => document.getElementById(id);
const store = {
  get: k => JSON.parse(localStorage.getItem(k) || "null"),
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: k => localStorage.removeItem(k)
};
let userId = null;
const fmt = d => new Date(d).toLocaleString("fr-FR");

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

/* ---------- Images ---------- */
async function uploadImage(blob, name) {
  if (!blob) return null;
  if (!blob.type.startsWith("image/")) throw new Error("Le fichier doit être une image.");
  if (blob.size > MAX_IMG) throw new Error("Image trop lourde (5 Mo maximum).");
  const s = await validSession();
  if (!s) throw new Error("Non connecté");
  const ext = ((name || "").split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${s.user_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": blob.type },
    body: blob
  });
  if (!r.ok) throw new Error("Envoi de l'image impossible : " + await r.text());
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
async function postReply(feedbackId, message, blob, name) {
  const image_url = await uploadImage(blob, name);
  await api("reponses", { method: "POST", body: JSON.stringify({ feedback_id: feedbackId, auteur_id: userId, message: message || "", image_url }) });
}

/* Bulle : kind = "recv" (gris, reçu) ou "sent" (bleu, envoyé) */
function bubble(kind, metaText, text, imageUrl) {
  const b = document.createElement("div");
  b.className = "bubble " + kind;
  const m = document.createElement("div");
  m.className = "bm";
  m.textContent = metaText;
  b.appendChild(m);
  if (text) {
    const t = document.createElement("div");
    t.className = "txt";
    t.textContent = text;
    b.appendChild(t);
  }
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl; img.alt = "Image jointe";
    img.addEventListener("click", ev => { ev.stopPropagation(); img.classList.toggle("zoom"); });
    b.appendChild(img);
  }
  return b;
}

/* ---------- Affichage ---------- */
async function init() {
  const s = await validSession();
  $("login").hidden = !!s;
  $("main").hidden = !s;
  if (!s) { window.native.unread(0); return; }
  userId = s.user_id;
  const p = await api(`profiles?id=eq.${userId}&select=nom,modele`);
  $("who").textContent = p[0]?.nom || s.email;
  $("modele").hidden = !p[0]?.modele;
  $("modele").textContent = p[0]?.modele ? "Modèle : " + p[0].modele : "";
  await render();
  check();
}

async function render(auto = false) {
  const list = $("list");
  // Ne pas effacer une réponse en cours de saisie
  if (auto && ([...list.querySelectorAll("textarea")].some(t => t.value.trim() || t === document.activeElement)
      || [...list.querySelectorAll("input[type=file]")].some(i => i.files.length))) return;

  const rows = await api(`feedbacks?agent_id=eq.${userId}&select=*,reponses(id,message,image_url,created_at)&order=created_at.desc&limit=50`);
  list.replaceChildren();
  if (!rows.length) { list.textContent = "Aucun feedback pour le moment."; return; }

  rows.forEach(f => {
    const div = document.createElement("div");
    div.className = "fb" + (f.lu ? "" : " unread");
    const meta = document.createElement("div");
    meta.className = "meta";
    const dt = document.createElement("span");
    dt.textContent = fmt(f.created_at) + (f.lu ? "" : " · cliquez pour marquer comme lu");
    meta.appendChild(dt);
    if (f.modele) {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = "Modèle : " + f.modele;
      meta.appendChild(t);
    }
    div.appendChild(meta);

    // Feedback reçu (gris) avec son image, puis mes réponses (bleu)
    div.appendChild(bubble("recv", "Reçu", f.message, f.image_url));
    (f.reponses || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(r => {
      div.appendChild(bubble("sent", "Votre réponse · " + fmt(r.created_at), r.message, r.image_url));
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
    const fi = document.createElement("input");
    fi.type = "file"; fi.accept = "image/*";
    fi.setAttribute("aria-label", "Joindre une image");
    const prev = document.createElement("img");
    prev.className = "preview"; prev.alt = "Aperçu"; prev.hidden = true;
    fi.addEventListener("change", () => {
      if (prev.src.startsWith("blob:")) URL.revokeObjectURL(prev.src);
      const f0 = fi.files[0];
      if (f0 && f0.type.startsWith("image/")) { prev.src = URL.createObjectURL(f0); prev.hidden = false; }
      else { prev.removeAttribute("src"); prev.hidden = true; }
    });
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = "Envoyer la réponse";
    const note = document.createElement("div");
    note.className = "err";
    box.append(ta, fi, prev, send, note);
    open.addEventListener("click", ev => { ev.stopPropagation(); box.hidden = !box.hidden; if (!box.hidden) ta.focus(); });
    box.addEventListener("click", ev => ev.stopPropagation());
    send.addEventListener("click", async ev => {
      ev.stopPropagation();
      const message = ta.value.trim();
      const file = fi.files[0];
      if (!message && !file) return;
      send.disabled = true;
      note.textContent = "";
      try {
        await postReply(f.id, message, file, file && file.name);
        await render();
      } catch (e) {
        note.textContent = "Envoi impossible : " + e.message;
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
    const rows = await api(`feedbacks?agent_id=eq.${s.user_id}&lu=eq.false&select=id,message,image_url,modele,created_at&order=created_at.asc`);
    window.native.unread(rows.length);
    window.native.popup(rows.map(r => ({ id: r.id, message: r.message, image_url: r.image_url, modele: r.modele, date: r.created_at })));
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
window.native.onReply(async ({ id, message, image }) => {
  try {
    const blob = image ? new Blob([image.data], { type: image.type }) : null;
    await postReply(id, message, blob, image && image.name);
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
