const $ = id => document.getElementById(id);
const MAX_IMG = 5 * 1024 * 1024;
const params = new URLSearchParams(location.search);
if (params.get("block") === "0") document.body.className = "nob";
if (params.get("primary") !== "1") $("card").hidden = true; // autres écrans : simple voile

let current = null;
window.native.onData(d => {
  current = d;
  $("date").textContent = new Date(d.date).toLocaleString("fr-FR");
  $("modele").hidden = !d.modele;
  $("modele").textContent = d.modele ? "Modèle : " + d.modele : "";
  $("text").hidden = !d.message;
  $("text").textContent = d.message || "";
  $("img").hidden = !d.image_url;
  if (d.image_url) $("img").src = d.image_url; else $("img").removeAttribute("src");
  $("count").textContent = d.remaining ? `${d.remaining} autre${d.remaining > 1 ? "s" : ""} feedback${d.remaining > 1 ? "s" : ""} à lire ensuite` : "";
  $("ok").focus();
});

$("ok").addEventListener("click", () => { if (current) window.native.ack(current.id); });
$("reply").addEventListener("click", () => {
  $("replyBox").hidden = false;
  $("reply").hidden = true;
  $("ta").focus();
});
$("file").addEventListener("change", () => {
  const f = $("file").files[0];
  if ($("prev").src.startsWith("blob:")) URL.revokeObjectURL($("prev").src);
  if (f && f.type.startsWith("image/")) { $("prev").src = URL.createObjectURL(f); $("prev").hidden = false; }
  else { $("prev").removeAttribute("src"); $("prev").hidden = true; }
});
$("send").addEventListener("click", async () => {
  const m = $("ta").value.trim();
  const f = $("file").files[0];
  $("err").textContent = "";
  if (!current || (!m && !f)) return;
  let image = null;
  if (f) {
    if (!f.type.startsWith("image/")) { $("err").textContent = "Le fichier doit être une image."; return; }
    if (f.size > MAX_IMG) { $("err").textContent = "Image trop lourde (5 Mo maximum)."; return; }
    image = { name: f.name, type: f.type, data: await f.arrayBuffer() };
  }
  window.native.reply(current.id, m, image);
});
