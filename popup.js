const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get("block") === "0") document.body.className = "nob";
if (params.get("primary") !== "1") $("card").hidden = true; // autres écrans : simple voile

let current = null;
window.native.onData(d => {
  current = d;
  $("date").textContent = new Date(d.date).toLocaleString("fr-FR");
  $("text").textContent = d.message;
  $("count").textContent = d.remaining ? `${d.remaining} autre${d.remaining > 1 ? "s" : ""} feedback${d.remaining > 1 ? "s" : ""} à lire ensuite` : "";
  $("ok").focus();
});

$("ok").addEventListener("click", () => { if (current) window.native.ack(current.id); });
$("reply").addEventListener("click", () => {
  $("replyBox").hidden = false;
  $("reply").hidden = true;
  $("ta").focus();
});
$("send").addEventListener("click", () => {
  const m = $("ta").value.trim();
  if (m && current) window.native.reply(current.id, m);
});
