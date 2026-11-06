/* =========================================================
   Synkro — Interface
   ========================================================= */

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* Blocs de code : barre avec Copier / Lancer / Enregistrer */
try {
  marked.use({ renderer: { code(code, lang) {
    const raw = typeof code === "object" ? code.text : code;
    const l = String((typeof code === "object" ? code.lang : lang) || "").trim().split(/\s+/)[0].toLowerCase();
    const isHtml = l === "html" || /^\s*<(!doctype|html)/i.test(raw);
    const n = raw.split("\n").length;
    return `<div class="codeblock"><div class="cb-bar"><span>${esc(l || "code")} · ${n} ligne${n > 1 ? "s" : ""}</span>
      ${isHtml ? `<button class="cb-btn run" data-cb="run">▶ Lancer</button>` : ""}
      <button class="cb-btn" data-cb="save">Enregistrer</button>
      <button class="cb-btn" data-cb="copy">Copier le code</button></div>
      <pre><code data-lang="${esc(l)}">${esc(raw)}</code></pre></div>`;
  } } });
} catch {}
const md = s => {
  try { return DOMPurify.sanitize(marked.parse(String(s ?? ""), { breaks: true })); }
  catch { return esc(s).replace(/\n/g, "<br>"); }
};
const initial = name => (name || "?").trim().charAt(0).toUpperCase();
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
async function copy(text, msg = "Copié !") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { toast("Impossible de copier"); }
}
function ask(msg, okLabel = "Confirmer") {
  return new Promise(res => {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal card"><p>${esc(msg)}</p><div class="row gap-s" style="justify-content:flex-end">
      <button class="btn ghost" data-no>Annuler</button><button class="btn primary" data-yes>${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(wrap);
    const done = v => { wrap.remove(); res(v); };
    $("[data-no]", wrap).onclick = () => done(false);
    $("[data-yes]", wrap).onclick = () => done(true);
    wrap.onclick = e => { if (e.target === wrap) done(false); };
  });
}
let DOWNLOADS = null;
const EXT_OK = ["txt", "json", "md", "csv", "html", "svg", "png"];
async function saveFile(name, data) {
  if (DOWNLOADS) {
    const ext = name.split(".").pop().toLowerCase();
    if (!EXT_OK.includes(ext)) name += ".txt";
    try { await DOWNLOADS.save({ filename: name, data }); toast("Fichier enregistré"); }
    catch (e) { if (e?.code !== "declined") toast("Impossible d'enregistrer : " + (e?.message || e?.code || "erreur")); }
    return;
  }
  if (IS_EMBEDDED) { toast("Enregistrement indisponible ici, utilise Copier"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openPreview(code) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="preview card">
    <div class="card-title"><span>Aperçu</span><div class="row gap-s">
      <button class="btn ghost sm" data-pv="reload">Relancer</button>
      <button class="btn ghost sm" data-pv="full">Plein écran</button>
      <button class="btn primary sm" data-pv="close">Fermer</button></div></div>
    <iframe sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></div>`;
  document.body.appendChild(wrap);
  const frame = $("iframe", wrap);
  const load = () => { frame.srcdoc = code; setTimeout(() => frame.focus(), 300); };
  load();
  const close = () => { frame.srcdoc = ""; wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("[data-pv=close]", wrap).onclick = close;
  $("[data-pv=reload]", wrap).onclick = load;
  $("[data-pv=full]", wrap).onclick = () => frame.requestFullscreen?.().catch(() => toast("Plein écran refusé"));
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-cb]"); if (!b) return;
  e.stopPropagation();
  const codeEl = b.closest(".codeblock")?.querySelector("pre code"); if (!codeEl) return;
  const code = codeEl.textContent, lang = codeEl.dataset.lang || "";
  if (b.dataset.cb === "copy") copy(code, "Code copié");
  if (b.dataset.cb === "run") openPreview(code);
  if (b.dataset.cb === "save") {
    const ext = { html: "html", json: "json", md: "markdown", csv: "csv", svg: "svg" }[lang] || (/^\s*<(!doctype|html)/i.test(code) ? "html" : "txt");
    const title = (code.match(/<title>([^<]{1,60})<\/title>/i)?.[1] || "synkro-code").replace(/[^\p{L}\p{N}\- ]+/gu, "").trim() || "synkro-code";
    saveFile(`${title}.${ext === "markdown" ? "md" : ext}`, code);
  }
}, true);

function download(name, text, type = "text/markdown") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function glyph(agent) {
  return ICONS[agent.icon] ? `<svg viewBox="0 0 24 24">${ICONS[agent.icon]}</svg>` : esc(initial(agent.name));
}
function avatar(agent, sm = false, extra = "") {
  return `<div class="avatar${sm ? " sm" : ""}" style="background:${agent.color};${extra}">${glyph(agent)}</div>`;
}
function provLabel(agent) {
  const r = Store.resolve(agent);
  const p = PROVIDERS[r.provider];
  return `<span class="prov-tag" title="${esc(r.model)}${r.fallback ? " (IA choisie sans clé, remplacée)" : ""}" style="color:${p.color}">${p.name}${r.fallback ? " ⚠" : ""}</span>`;
}
function agentOptions(selected, { includeChef = true } = {}) {
  return Store.agents.filter(a => includeChef || a.id !== "chef")
    .map(a => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
}

/* ---------- Navigation ---------- */
function showView(name) {
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  if (name === "agents") renderAgents();
  if (name === "historique") renderHistory();
  if (name === "parametres") renderSettings();
  if (name === "labo") renderLaboChips();
  if (name === "chat") renderChatAgents();
  if (name === "mission" && !mission) renderMissionIdle();
}
$$(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

function renderProviderStatus() {
  const provs = SAMPLE ? ["integre", "gemini", "openai", "anthropic"].filter(p => p === "integre" || Store.hasKey(p)) : ["gemini", "openai", "anthropic"];
  $("#providerStatus").innerHTML = provs.map(p =>
    `<div class="ps ${Store.hasKey(p) ? "on" : ""}"><i></i>${PROVIDERS[p].name}${p === "integre" ? " intégré" : ""}${Store.hasKey(p) ? "" : " — pas de clé"}</div>`
  ).join("") + (Store.activeProviders().length ? "" : `<div class="ps" style="color:var(--accent)"><i style="background:var(--accent)"></i>Mode démo</div>`);
}

/* =========================================================
   MISSION CONTROL
   ========================================================= */
let mission = null;
const nodePos = {};

function renderNetwork() {
  const svg = $("#networkSvg");
  const chef = Store.chef();
  const others = Store.agents.filter(a => a.id !== chef.id);
  const cx = 200, cy = 140, rx = 150, ry = 100;
  nodePos[chef.id] = [cx, cy];
  others.forEach((a, i) => {
    const ang = -Math.PI / 2 + (i / others.length) * Math.PI * 2;
    nodePos[a.id] = [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)];
  });
  const edges = others.map(a => edgeSvg(chef.id, a.id)).join("");
  const nodes = Store.agents.map(a => {
    const [x, y] = nodePos[a.id];
    const s = a.id === chef.id ? 44 : 36;
    return `<g class="node" data-node="${a.id}" transform="translate(${x},${y})">
      <rect class="ring" x="${-s / 2 - 5}" y="${-s / 2 - 5}" width="${s + 10}" height="${s + 10}" rx="${s / 3 + 4}" stroke="${a.color}"/>
      <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s / 3}" fill="${a.color}" stroke="none"/>
      ${ICONS[a.icon] ? `<svg x="${-s * .27}" y="${-s * .27}" width="${s * .54}" height="${s * .54}" viewBox="0 0 24 24" class="nglyph">${ICONS[a.icon]}</svg>` : `<text>${esc(initial(a.name))}</text>`}
      <text class="label" y="${s / 2 + 13}">${esc(a.name)}</text>
    </g>`;
  }).join("");
  svg.innerHTML = `<g id="edges">${edges}</g><g id="nodes">${nodes}</g>`;
}
function edgeKey(a, b) { return [a, b].sort().join("__"); }
function edgeSvg(a, b) {
  const [x1, y1] = nodePos[a] || [0, 0], [x2, y2] = nodePos[b] || [0, 0];
  return `<line class="edge" data-edge="${edgeKey(a, b)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}
function setEdge(a, b, state) {
  if (a === b || !nodePos[a] || !nodePos[b]) return;
  let line = $(`[data-edge="${edgeKey(a, b)}"]`);
  if (!line) { $("#edges").insertAdjacentHTML("beforeend", edgeSvg(a, b)); line = $(`[data-edge="${edgeKey(a, b)}"]`); }
  line.classList.toggle("active", state === "active");
  line.classList.toggle("done", state === "done");
}
function setNode(id, state) { $(`[data-node="${id}"]`)?.classList.toggle("working", state === "working"); }

function renderPanels() {
  $("#agentPanels").innerHTML = Store.agents.map(a => `
    <div class="panel" data-panel="${a.id}" style="--c:${a.color}">
      <div class="panel-head">${avatar(a)}
        <div class="ph-txt"><strong>${esc(a.name)}</strong><small>${esc(a.role)}</small></div>
        ${provLabel(a)}
      </div>
      <div class="panel-body"><div class="idle">En attente</div></div>
    </div>`).join("");
}
const panelQueue = {};
function setPanel(id, state, content) {
  if (state === "working") {
    const first = !panelQueue[id];
    panelQueue[id] = content;
    if (first) requestAnimationFrame(() => { const c = panelQueue[id]; delete panelQueue[id]; if (c !== undefined) renderPanelNow(id, "working", c); });
    return;
  }
  delete panelQueue[id];
  renderPanelNow(id, state, content);
}
function renderPanelNow(id, state, content) {
  const p = $(`[data-panel="${id}"]`); if (!p) return;
  p.classList.toggle("working", state === "working");
  const body = $(".panel-body", p);
  body.innerHTML = `<div class="md">${md(content)}</div>` +
    (state === "working" ? `<div class="typing"><i></i><i></i><i></i></div>` : "") ;
  if (state === "error") body.firstChild.style.color = "#F26B6B";
  body.scrollTop = state === "working" ? body.scrollHeight : 0;
}

function renderPlan(tasks, editable = false) {
  const el = $("#planList");
  if (!tasks?.length) { el.innerHTML = `<div class="empty small">Le plan apparaîtra ici.</div>`; return; }
  el.innerHTML = tasks.map(t => {
    const a = Store.agent(t.agentId) || Store.chef();
    const deps = t.deps.length ? ` · après ${t.deps.map(d => tasks.findIndex(x => x.id === d) + 1).filter(n => n > 0).map(n => "n°" + n).join(", ")}` : " · en parallèle";
    return `<div class="task ${t.status}" data-task="${t.id}">
      <div class="t-status"></div>
      <div class="t-body">
        <div class="t-title">${tasks.indexOf(t) + 1}. ${esc(t.title)}</div>
        <div class="t-meta">${editable
          ? `<select class="select sm t-agent" data-task="${t.id}" style="margin-top:6px">${agentOptions(t.agentId, { includeChef: false })}</select>`
          : `${esc(a.name)}${deps}`}</div>
      </div>
      ${editable ? `<button class="t-del" data-del="${t.id}" title="Supprimer">×</button>` : ""}
    </div>`;
  }).join("");
  if (editable) {
    $$(".t-agent", el).forEach(s => s.addEventListener("change", () => {
      const t = tasks.find(x => x.id === s.dataset.task); t.agentId = s.value;
    }));
    $$(".t-del", el).forEach(b => b.addEventListener("click", () => {
      const i = tasks.findIndex(x => x.id === b.dataset.del);
      const [gone] = tasks.splice(i, 1);
      tasks.forEach(t => t.deps = t.deps.filter(d => d !== gone.id));
      renderPlan(tasks, true);
    }));
  }
}

function setPhase(text, kind = "") {
  const p = $("#missionPhase"); p.textContent = text; p.className = "pill " + kind;
}

function addBoardEntry(e) {
  const b = $("#board");
  if (b.querySelector(".empty")) b.innerHTML = "";
  const a = Store.agent(e.agentId) || Store.chef();
  const div = document.createElement("div");
  div.className = "entry";
  div.innerHTML = `${avatar(a, true)}<div class="e-body">
    <div class="e-head">${esc(a.name)} <span class="muted">· ${esc(e.title)}</span></div>
    <div class="e-text">${esc(e.text)}</div></div>`;
  div.addEventListener("click", () => div.classList.toggle("open"));
  b.prepend(div);
  const n = b.children.length;
  $("#boardCount").textContent = `${n} entrée${n > 1 ? "s" : ""}`;
}

function renderMissionIdle() {
  renderNetwork(); renderPanels(); renderPlan([]);
  $("#board").innerHTML = `<div class="empty small">Les agents écriront ici ce qu'ils produisent.</div>`;
  $("#boardCount").textContent = "0 entrée";
  $("#finalCard").hidden = true;
  $("#planActions").hidden = true;
  setPhase("En attente");
}

function setRunning(on) {
  $("#missionStart").hidden = on;
  $("#missionStop").hidden = !on;
  $("#goalInput").disabled = on;
}

const hooks = {
  phase: setPhase,
  agent: setPanel,
  node: setNode,
  edge: setEdge,
  plan: tasks => renderPlan(tasks),
  task: () => renderPlan(mission.tasks),
  board: addBoardEntry,
  save: m => Store.upsertMission(m.toRecord()),
  final: text => {
    $("#finalCard").hidden = false;
    $("#finalOutput").innerHTML = md(text);
    $("#finalCard").scrollIntoView({ behavior: "smooth", block: "start" });
  },
};

async function startMission() {
  const goal = $("#goalInput").value.trim();
  if (!goal) { $("#goalInput").focus(); toast("Écris d'abord un objectif"); return; }
  if (mission instanceof Mission && mission.status === "awaiting") Store.deleteMission(mission.id);
  renderMissionIdle();
  mission = new Mission(goal, {
    maxTasks: +$("#optMaxTasks").value,
    review: $("#optReview").checked,
  }, hooks);
  setRunning(true);
  $("#missionReset").hidden = false;
  try {
    await mission.plan();
    if ($("#optValidate").checked) {
      setPhase("À valider", "live");
      renderPlan(mission.tasks, true);
      $("#planActions").hidden = false;
      setRunning(false);
      $("#missionStart").hidden = true;
      return;
    }
    await runMission();
  } catch (e) { handleMissionError(e); }
}

async function runMission() {
  $("#planActions").hidden = true;
  if (!mission.tasks.length) { toast("Le plan est vide"); return; }
  renderPlan(mission.tasks);
  setRunning(true);
  try {
    await mission.run();
  } catch (e) { handleMissionError(e); }
  setRunning(false);
}

function handleMissionError(e) {
  setRunning(false);
  if (mission instanceof Mission) mission.save(e.name === "AbortError" ? "stopped" : "error");
  if (e.name === "AbortError") { setPhase("Arrêtée"); toast("Mission arrêtée"); }
  else { setPhase("Erreur"); setPanel(Store.chef().id, "error", "**Erreur :** " + e.message); toast(e.message); }
  $$(".node.working").forEach(n => n.classList.remove("working"));
  $$(".edge.active").forEach(n => n.classList.remove("active"));
  $$(".panel.working").forEach(n => n.classList.remove("working"));
}

$("#missionStart").addEventListener("click", startMission);
$("#goalInput").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) startMission(); });
$("#missionStop").addEventListener("click", () => mission?.stop());
$("#planApprove").addEventListener("click", runMission);
$("#planReplan").addEventListener("click", startMission);
$("#missionReset").addEventListener("click", () => {
  mission?.stop(); mission = null; setRunning(false);
  $("#goalInput").value = ""; $("#missionReset").hidden = true; renderMissionIdle();
});
$("#finalCopy").addEventListener("click", () => copy(mission?.final || ""));
$("#finalDownload").addEventListener("click", () => saveFile("synkro-resultat.md", `# ${mission?.goal}\n\n${mission?.final || ""}`));

/* =========================================================
   LABO — même demande à plusieurs agents
   ========================================================= */
const laboSel = new Set(LS.get("laboSel", ["chercheur", "redacteur", "creatif"]));
let laboResults = {};

function renderLaboChips() {
  $("#laboAgents").innerHTML = Store.agents.map(a =>
    `<button class="chip ${laboSel.has(a.id) ? "on" : ""}" data-id="${a.id}"><span class="dot" style="background:${a.color}">${glyph(a)}</span>${esc(a.name)}</button>`
  ).join("");
  $$("#laboAgents .chip").forEach(c => c.addEventListener("click", () => {
    laboSel.has(c.dataset.id) ? laboSel.delete(c.dataset.id) : laboSel.add(c.dataset.id);
    LS.set("laboSel", [...laboSel]); renderLaboChips();
  }));
}

async function laboSend() {
  const text = $("#laboInput").value.trim();
  const agents = Store.agents.filter(a => laboSel.has(a.id));
  if (!text) { toast("Écris une demande"); return; }
  if (!agents.length) { toast("Choisis au moins un agent"); return; }
  laboResults = {};
  $("#laboJudge").disabled = true;
  $("#laboGrid").innerHTML = agents.map(a => `
    <div class="panel working" data-labo="${a.id}" style="--c:${a.color}">
      <div class="panel-head">${avatar(a)}<div class="ph-txt"><strong>${esc(a.name)}</strong><small>${esc(Store.resolve(a).model)}</small></div>${provLabel(a)}</div>
      <div class="panel-body"><div class="typing"><i></i><i></i><i></i></div></div>
    </div>`).join("");
  await Promise.all(agents.map(async a => {
    const p = $(`[data-labo="${a.id}"]`), body = $(".panel-body", p);
    try {
      const r = Store.resolve(a);
      const out = await callLLM({ ...r, system: agentSystem(a), messages: [{ role: "user", content: text }],
        onText: t => { body.innerHTML = `<div class="md">${md(t)}</div>`; } });
      laboResults[a.id] = out;
      body.innerHTML = `<div class="md">${md(out)}</div>`;
    } catch (e) { body.innerHTML = `<div class="md" style="color:#F26B6B">${esc(e.message)}</div>`; }
    p.classList.remove("working");
  }));
  $("#laboJudge").disabled = Object.keys(laboResults).length < 2 || !Store.critique();
}

async function laboJudge() {
  const critic = Store.critique(); if (!critic) return;
  const text = $("#laboInput").value.trim();
  const div = document.createElement("div");
  div.className = "panel working judge"; div.style.setProperty("--c", critic.color);
  div.innerHTML = `<div class="panel-head">${avatar(critic)}<div class="ph-txt"><strong>Verdict du ${esc(critic.name)}</strong><small>Compare les réponses</small></div>${provLabel(critic)}</div><div class="panel-body"><div class="typing"><i></i><i></i><i></i></div></div>`;
  $("#laboGrid").prepend(div);
  try {
    const dump = Object.entries(laboResults).map(([id, r]) => `## Réponse de ${Store.agent(id)?.name}\n${r}`).join("\n\n");
    const out = await callLLM({
      ...Store.resolve(critic),
      system: agentSystem(critic, "Compare plusieurs réponses à une même demande. Dis laquelle est la meilleure et pourquoi, les points forts de chacune, puis propose une réponse finale qui combine le meilleur."),
      messages: [{ role: "user", content: `DEMANDE : ${text}\n\n${dump}` }],
    });
    $(".panel-body", div).innerHTML = `<div class="md">${md(out)}</div>`;
  } catch (e) { $(".panel-body", div).innerHTML = `<div class="md" style="color:#F26B6B">${esc(e.message)}</div>`; }
  div.classList.remove("working");
}
$("#laboSend").addEventListener("click", laboSend);
$("#laboJudge").addEventListener("click", laboJudge);
$("#laboInput").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) laboSend(); });

/* =========================================================
   CHAT
   ========================================================= */
let chatAgentId = LS.get("chatAgent", "chef");
let chatHistory = LS.get("chat." + chatAgentId, []);
let chatBusy = false;

function renderChatAgents() {
  if (!Store.agent(chatAgentId)) chatAgentId = Store.agents[0].id;
  $("#chatAgent").innerHTML = agentOptions(chatAgentId);
  renderChat();
}
function renderChat() {
  const a = Store.agent(chatAgentId);
  const log = $("#chatLog");
  if (!chatHistory.length) {
    log.innerHTML = `<div class="empty">${avatar(a, false, "margin:0 auto 10px")}
      <strong style="color:var(--text)">${esc(a.name)}</strong><br>${esc(a.role)}</div>`;
    return;
  }
  log.innerHTML = chatHistory.map(m => m.role === "user"
    ? `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`
    : `<div class="msg bot">${avatar(a, true)}<div class="bubble md">${md(m.content)}</div></div>`).join("");
  log.scrollTop = log.scrollHeight;
}
async function chatSend() {
  const input = $("#chatInput"); const text = input.value.trim();
  if (!text || chatBusy) return;
  const a = Store.agent(chatAgentId);
  chatHistory.push({ role: "user", content: text });
  input.value = ""; input.style.height = "";
  renderChat();
  $("#chatLog").insertAdjacentHTML("beforeend", `<div class="msg bot" id="chatTyping" style="--c:${a.color}">${avatar(a, true)}<div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div></div>`);
  $("#chatLog").scrollTop = 1e9;
  chatBusy = true;
  try {
    const hist = chatHistory.slice(-20);
    if (hist[0]?.role === "assistant") hist.shift();
    const out = await callLLM({ ...Store.resolve(a), system: agentSystem(a), messages: hist, chat: true,
      onText: t => { const b = $("#chatTyping .bubble"); if (b) { b.className = "bubble md"; b.innerHTML = md(t); $("#chatLog").scrollTop = 1e9; } } });
    chatHistory.push({ role: "assistant", content: out });
  } catch (e) {
    chatHistory.push({ role: "assistant", content: "⚠️ " + e.message });
  }
  chatBusy = false;
  LS.set("chat." + chatAgentId, chatHistory);
  Cloud.saveChat(chatAgentId, chatHistory);
  renderChat();
}
$("#chatAgent").addEventListener("change", e => {
  chatAgentId = e.target.value; LS.set("chatAgent", chatAgentId);
  chatHistory = LS.get("chat." + chatAgentId, []); renderChat();
  loadCloudChat();
});
async function loadCloudChat() {
  if (!Cloud.ready) return;
  const id = chatAgentId;
  try {
    const msgs = await Cloud.loadChat(id);
    if (msgs && id === chatAgentId && !chatBusy) { chatHistory = msgs; LS.set("chat." + id, msgs); renderChat(); }
  } catch {}
}
$("#chatClear").addEventListener("click", () => { chatHistory = []; LS.del("chat." + chatAgentId); Cloud.deleteChat(chatAgentId); renderChat(); });
$("#chatSend").addEventListener("click", chatSend);
$("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatSend(); } });
$("#chatInput").addEventListener("input", e => { e.target.style.height = ""; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; });

/* =========================================================
   AGENTS
   ========================================================= */
function modelOptions(provider, current) {
  if (provider === "integre") return `<option value="">Choisi par Claude</option>`;
  if (provider === "auto" || provider === "demo") return `<option value="">${provider === "demo" ? "demo" : "Modèle par défaut de l'IA"}</option>`;
  const cfg = Store.providers[provider];
  const list = [...new Set([...(cfg.models?.length ? cfg.models : PROVIDERS[provider].suggestions), cfg.model, current].filter(Boolean))];
  return `<option value="">Par défaut (${esc(cfg.model)})</option>` +
    list.map(m => `<option value="${esc(m)}" ${m === current ? "selected" : ""}>${esc(m)}</option>`).join("");
}

function renderAgents() {
  $("#agentsGrid").innerHTML = Store.agents.map(a => `
    <div class="card agent-card" data-agent="${a.id}">
      <div class="ac-head">${avatar(a)}
        <div style="flex:1;min-width:0">
          <input class="name" value="${esc(a.name)}" data-f="name" />
          <div class="ac-role">${a.id === "chef" ? `<span class="badge-chef">Orchestrateur</span>` : a.id === "critique" ? `<span class="badge-chef" style="color:#14B8A6;background:rgba(20,184,166,.14)">Relecteur</span>` : "Agent"}</div>
        </div>
        ${provLabel(a)}
      </div>
      <div class="ac-row">
        <label class="f">IA
          <select class="select" data-f="provider">
            <option value="auto" ${a.provider === "auto" ? "selected" : ""}>Auto (première dispo)</option>
            ${[...(SAMPLE ? ["integre"] : []), "gemini", "openai", "anthropic", "demo"].map(p => `<option value="${p}" ${a.provider === p ? "selected" : ""}>${PROVIDERS[p].name}${p === "integre" ? " intégré (gratuit)" : ""}${p !== "demo" && !Store.hasKey(p) ? " (pas de clé)" : ""}</option>`).join("")}
          </select>
        </label>
        <label class="f">Modèle
          <select class="select" data-f="model">${modelOptions(a.provider, a.model)}</select>
        </label>
      </div>
      <label class="f">Rôle (court, utilisé par le chef pour distribuer)
        <input class="input" data-f="role" value="${esc(a.role)}" />
      </label>
      <label class="f">Consignes / personnalité
        <textarea rows="4" data-f="prompt">${esc(a.prompt)}</textarea>
      </label>
      <div class="ac-foot">
        <div class="col-s">
        <div class="swatches icons">${Object.keys(ICONS).map(k => `<button data-icon="${k}" class="${k === a.icon ? "on" : ""}" title="${k}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg></button>`).join("")}</div>
        <div class="swatches">${AGENT_COLORS.map(c => `<button data-color="${c}" class="${c === a.color ? "on" : ""}" style="background:${c}"></button>`).join("")}</div>
        </div>
        ${a.id === "chef" || a.id === "critique" ? "" : `<button class="btn danger sm" data-remove>Supprimer</button>`}
      </div>
    </div>`).join("");

  $$(".agent-card").forEach(card => {
    const a = Store.agent(card.dataset.agent);
    $$("[data-f]", card).forEach(inp => inp.addEventListener("change", () => {
      a[inp.dataset.f] = inp.value;
      if (inp.dataset.f === "provider") a.model = "";
      Store.saveAgents();
      if (["provider", "model", "name"].includes(inp.dataset.f)) renderAgents();
      refreshAgentViews();
    }));
    $$("[data-icon]", card).forEach(b => b.addEventListener("click", () => {
      a.icon = b.dataset.icon; Store.saveAgents(); renderAgents(); refreshAgentViews();
    }));
    $$("[data-color]", card).forEach(b => b.addEventListener("click", () => {
      a.color = b.dataset.color; Store.saveAgents(); renderAgents(); refreshAgentViews();
    }));
    $("[data-remove]", card)?.addEventListener("click", async () => {
      if (!(await ask(`Supprimer l'agent « ${a.name} » ?`, "Supprimer"))) return;
      Store.agents = Store.agents.filter(x => x !== a); Store.saveAgents(); renderAgents(); refreshAgentViews();
    });
  });
}
function refreshAgentViews() { if (!mission) renderMissionIdle(); renderProviderStatus(); }

$("#agentAdd").addEventListener("click", () => {
  const id = "agent" + Date.now().toString(36);
  Store.agents.push({ id, icon: "spark", name: "Nouvel agent", color: AGENT_COLORS[Store.agents.length % AGENT_COLORS.length], provider: "auto", model: "", role: "Décris sa spécialité en une phrase.", prompt: "Tu es un expert en … Tu réponds de façon …" });
  Store.saveAgents(); renderAgents(); refreshAgentViews();
  setTimeout(() => $(`[data-agent="${id}"] input.name`)?.select(), 50);
});
$("#agentsReset").addEventListener("click", async () => {
  if (!(await ask("Remettre les agents par défaut ? Tes modifications seront perdues.", "Réinitialiser"))) return;
  Store.agents = structuredClone(DEFAULT_AGENTS); Store.saveAgents(); renderAgents(); refreshAgentViews();
});

/* =========================================================
   OUTILS
   ========================================================= */
/* --- Palette --- */
let palette = [];
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return ("#" + f(0) + f(8) + f(4)).toUpperCase();
}
function genPalette() {
  const mode = $("#palMode").value, base = Math.random() * 360, r = (a, b) => a + Math.random() * (b - a);
  const hues = {
    analogue: [0, 20, 40, -20, -40],
    complementaire: [0, 10, 180, 190, 0],
    triade: [0, 120, 240, 10, 130],
    mono: [0, 0, 0, 0, 0],
  }[mode];
  const lights = mode === "mono" ? [18, 32, 48, 65, 82] : [r(20, 35), r(45, 60), r(55, 65), r(70, 82), r(88, 95)];
  const next = hues.map((dh, i) => hslToHex((base + dh + 360) % 360, mode === "mono" ? r(55, 80) : r(55, 90), lights[i]));
  palette = next.map((hex, i) => palette[i]?.locked ? palette[i] : { hex, locked: false });
  renderPalette();
}
function renderPalette() {
  $("#palette").innerHTML = palette.map((c, i) => {
    const lum = parseInt(c.hex.slice(1, 3), 16) * .299 + parseInt(c.hex.slice(3, 5), 16) * .587 + parseInt(c.hex.slice(5, 7), 16) * .114;
    return `<div class="swatch" data-i="${i}" style="background:${c.hex};color:${lum > 150 ? "#111" : "#fff"}">
      <button class="lock ${c.locked ? "on" : ""}" data-lock="${i}"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 ${c.locked ? "8 0v3" : "7.5-1"}"/></svg></button>
      <span>${c.hex}</span></div>`;
  }).join("");
  $$(".swatch").forEach(s => s.addEventListener("click", e => {
    if (e.target.closest(".lock")) { const c = palette[+s.dataset.i]; c.locked = !c.locked; renderPalette(); return; }
    copy(palette[+s.dataset.i].hex, palette[+s.dataset.i].hex + " copié");
  }));
}
$("#palGen").addEventListener("click", genPalette);
$("#palMode").addEventListener("change", genPalette);
document.addEventListener("keydown", e => {
  if (e.code === "Space" && $("#view-outils").classList.contains("active") && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); genPalette(); }
});

/* --- QR --- */
function renderQR() {
  const text = $("#qrInput").value || " ";
  const box = $("#qrBox");
  try {
    if (qrcode.stringToBytesFuncs?.["UTF-8"]) qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const qr = qrcode(0, "M"); qr.addData(text, "Byte"); qr.make();
    const n = qr.getModuleCount(), scale = 10, size = n * scale;
    const c = document.createElement("canvas"); c.width = c.height = size;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = $("#qrColor").value;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) ctx.fillRect(x * scale, y * scale, scale, scale);
    box.innerHTML = ""; box.appendChild(c);
  } catch { box.innerHTML = `<span style="color:#999;font-size:12px">Texte trop long</span>`; }
}
$("#qrInput").addEventListener("input", renderQR);
$("#qrColor").addEventListener("input", renderQR);
$("#qrDownload").addEventListener("click", () => {
  const c = $("#qrBox canvas"); if (!c) return;
  const out = document.createElement("canvas"), pad = 40; out.width = out.height = c.width + pad * 2;
  const ctx = out.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(c, pad, pad);
  out.toBlob(b => b && saveFile("qrcode.png", b), "image/png");
});

/* --- Noms --- */
async function genNames() {
  const what = $("#nameInput").value.trim(); if (!what) { toast("Dis pour quoi tu cherches un nom"); return; }
  const a = Store.agent($("#nameAgent").value) || Store.chef();
  const out = $("#nameOut"); out.innerHTML = `<div class="typing" style="--c:${a.color}"><i></i><i></i><i></i></div>`;
  try {
    const raw = await callLLM({
      ...Store.resolve(a),
      system: agentSystem(a, `MODE NOMS. Propose 8 noms originaux, courts et mémorables (évite les clichés). Réponds UNIQUEMENT en JSON : {"noms":[{"nom":"…","pourquoi":"raison en quelques mots"}]}`),
      messages: [{ role: "user", content: `Trouve des noms pour : ${what}. Réponds en JSON.` }], json: true,
    });
    const list = parseJSONLoose(raw).noms || [];
    out.innerHTML = list.map(n => `<div class="name-chip" data-n="${esc(n.nom)}">${esc(n.nom)}<small>${esc(n.pourquoi || "")}</small></div>`).join("");
    $$(".name-chip", out).forEach(c => c.addEventListener("click", () => copy(c.dataset.n, `« ${c.dataset.n} » copié`)));
  } catch (e) { out.innerHTML = `<span style="color:#F26B6B">${esc(e.message)}</span>`; }
}
$("#nameGen").addEventListener("click", genNames);
$("#nameInput").addEventListener("keydown", e => { if (e.key === "Enter") genNames(); });

/* --- Texte --- */
function txtStats() {
  const v = $("#txtInput").value, w = (v.trim().match(/\S+/g) || []).length;
  $("#txtStats").textContent = `${w} mot${w > 1 ? "s" : ""} · ${v.length} caractère${v.length > 1 ? "s" : ""}`;
}
$("#txtInput").addEventListener("input", txtStats);
$$("[data-txt]").forEach(b => b.addEventListener("click", () => {
  const t = $("#txtInput"), v = t.value;
  const ops = {
    upper: () => v.toUpperCase(),
    lower: () => v.toLowerCase(),
    title: () => v.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()),
    clean: () => v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").split("\n").map(l => l.trim()).join("\n").trim(),
    slug: () => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  };
  if (b.dataset.txt === "copy") return copy(v);
  t.value = ops[b.dataset.txt](); txtStats();
}));

/* =========================================================
   HISTORIQUE
   ========================================================= */
const STATUS = {
  done: ["Terminée", "done"], running: ["Interrompue", "live"], stopped: ["Arrêtée", "live"],
  error: ["Erreur", "live"], awaiting: ["Plan à valider", "live"], planning: ["Interrompue", "live"],
};
function renderHistory() {
  const list = $("#histList");
  if (!Store.history.length) { list.innerHTML = `<div class="card empty">Aucune mission pour l'instant.</div>`; return; }
  list.innerHTML = Store.history.map(h => {
    const [label, kind] = STATUS[h.status || "done"] || STATUS.done;
    const done = (h.tasks || []).filter(t => t.status === "done").length;
    return `<div class="card hist-item" data-id="${h.id}">
      <div class="avatar" style="background:var(--accent)">${(h.tasks || []).length}</div>
      <div class="h-body"><strong>${esc(h.goal)}</strong>
        <small>${new Date(h.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} · ${done}/${(h.tasks || []).length} tâches faites</small></div>
      <span class="pill ${kind}">${label}</span>
      <button class="btn ${h.status && h.status !== "done" ? "primary" : "ghost"} sm" data-open="${h.id}">${h.status && h.status !== "done" ? "Reprendre" : "Ouvrir"}</button>
      <button class="btn ghost sm" data-del="${h.id}" title="Supprimer">×</button>
    </div>`;
  }).join("");
  $$("[data-open]", list).forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openHistory(b.dataset.open); }));
  $$("[data-del]", list).forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    if (!(await ask("Supprimer cette mission de l'historique ?", "Supprimer"))) return;
    Store.deleteMission(b.dataset.del); renderHistory(); checkResume();
  }));
  $$(".hist-item", list).forEach(c => c.addEventListener("click", () => openHistory(c.dataset.id)));
}

function replayRecord(h) {
  renderMissionIdle();
  $("#goalInput").value = h.goal;
  $("#missionReset").hidden = false;
  (h.tasks || []).forEach(t => {
    if (t.status === "done") {
      addBoardEntry({ agentId: t.agentId, title: t.title, text: t.result });
      setPanel(t.agentId, "done", `**${t.title}**\n\n${t.result}`);
    }
  });
  if (h.review && Store.critique()) setPanel(Store.critique().id, "done", h.review);
}

function openHistory(id) {
  const h = Store.history.find(x => x.id === id);
  if (!h) return;
  if (mission instanceof Mission && ["running", "planning"].includes(mission.status) && !mission.stopped && $("#missionStop").hidden === false) {
    toast("Une mission tourne déjà : arrête-la d'abord"); return;
  }
  showView("mission");
  if (h.status && h.status !== "done") return resumeMission(h);
  replayRecord(h);
  mission = Mission.fromRecord(h, hooks);
  renderPlan(h.tasks.map((t, k) => ({ ...t, id: t.id || "h" + k, deps: t.deps || [] })));
  setPanel(Store.chef().id, "done", "Résultat final livré ✓");
  setPhase("Archive", "done");
  hooks.final(h.final);
}

async function resumeMission(h) {
  $("#resumeBanner").hidden = true;
  replayRecord(h);
  mission = Mission.fromRecord(h, hooks);
  const left = mission.tasks.filter(t => t.status !== "done").length;
  if (!mission.tasks.length) { $("#goalInput").value = h.goal; Store.deleteMission(h.id); return startMission(); }
  if (h.status === "awaiting") {
    setPhase("À valider", "live");
    renderPlan(mission.tasks, true);
    $("#planActions").hidden = false;
    $("#missionStart").hidden = true;
    return;
  }
  toast(left ? `Reprise : ${left} tâche${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}` : "Reprise : assemblage final");
  await runMission();
}

let resumeCandidate = null;
function checkResume() {
  resumeCandidate = Store.history.find(h => ["running", "planning"].includes(h.status));
  const busy = mission instanceof Mission && $("#missionStop").hidden === false;
  $("#resumeBanner").hidden = !resumeCandidate || busy;
  if (resumeCandidate) {
    const done = resumeCandidate.tasks.filter(t => t.status === "done").length;
    $("#resumeText").textContent = `« ${resumeCandidate.goal.slice(0, 90)} » · ${done}/${resumeCandidate.tasks.length} tâches déjà faites`;
  }
}
$("#resumeGo").addEventListener("click", () => resumeCandidate && resumeMission(resumeCandidate));
$("#resumeIgnore").addEventListener("click", () => {
  if (resumeCandidate) { resumeCandidate.status = "stopped"; Store.upsertMission(resumeCandidate); }
  checkResume();
});

$("#histClear").addEventListener("click", async () => {
  if (!(await ask("Effacer tout l'historique ?", "Effacer"))) return;
  Store.history.forEach(h => Cloud.deleteMission(h.id));
  Store.history = []; Store.saveHistory(); renderHistory(); checkResume();
});

/* =========================================================
   PARAMÈTRES
   ========================================================= */
function renderSettings() {
  const integreCard = SAMPLE ? `<div class="card prov-card">
      <div class="pc-head">
        <div class="pc-logo" style="background:${PROVIDERS.integre.color}">C</div>
        <div><strong>Claude intégré</strong><small>Inclus dans ton abonnement · aucune clé</small></div>
        <span class="pill done">Actif</span>
      </div>
      <p class="hint">Tous les agents réglés sur « Auto » ou « Claude intégré » l'utilisent. La première fois, claude.ai te demande d'autoriser la page.</p>
    </div>` : "";
  const note = IS_EMBEDDED ? `<p class="hint" style="color:var(--accent)">Les clés externes ne fonctionnent que sur la version GitHub du site (ici, le navigateur bloque ces connexions).</p>` : "";
  $("#providerSettings").innerHTML = integreCard + ["gemini", "openai", "anthropic"].map(p => {
    const P = PROVIDERS[p], cfg = Store.providers[p];
    const models = cfg.models?.length ? cfg.models : P.suggestions;
    return `<div class="card prov-card" data-prov="${p}">
      <div class="pc-head">
        <div class="pc-logo" style="background:${P.color}">${P.letter}</div>
        <div><strong>${P.name}</strong><small>${P.by} · ${P.keyHint}</small></div>
        <span class="pill ${cfg.key ? "done" : ""}">${cfg.key ? "Connectée" : "Pas de clé"}</span>
      </div>
      <div class="pc-key">
        <input class="input" type="password" placeholder="Colle ta clé API ici" value="${esc(cfg.key)}" data-key autocomplete="off" spellcheck="false" />
        <button class="btn ghost" data-test>Tester</button>
      </div>
      <label class="field-inline" style="justify-content:space-between">Modèle par défaut
        <select class="select sm" data-model style="max-width:60%">${[...new Set([cfg.model, ...models])].map(m => `<option ${m === cfg.model ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
      </label>
      <div class="row" style="justify-content:space-between">
        <a href="${P.keyUrl}" target="_blank" rel="noopener">Obtenir une clé ↗</a>
        <span class="pc-msg" data-msg></span>
      </div>${note}
    </div>`;
  }).join("");

  $$(".prov-card[data-prov]").forEach(card => {
    const p = card.dataset.prov, cfg = Store.providers[p], msg = $("[data-msg]", card);
    const keyInp = $("[data-key]", card);
    keyInp.addEventListener("change", () => {
      cfg.key = keyInp.value.trim(); Store.saveProviders(); renderProviderStatus();
      if (cfg.key) testProvider(p, card); else renderSettings();
    });
    $("[data-model]", card).addEventListener("change", e => { cfg.model = e.target.value; Store.saveProviders(); });
    $("[data-test]", card).addEventListener("click", () => {
      cfg.key = keyInp.value.trim(); Store.saveProviders();
      if (!cfg.key) { msg.className = "pc-msg err"; msg.textContent = "Colle d'abord une clé"; return; }
      testProvider(p, card);
    });
  });
}

async function testProvider(p, card) {
  const cfg = Store.providers[p], msg = $("[data-msg]", card);
  msg.className = "pc-msg"; msg.textContent = "Test en cours…";
  try {
    const models = await listModels(p, cfg.key);
    if (!models.length) throw new Error("Aucun modèle trouvé");
    cfg.models = models.sort();
    if (!models.includes(cfg.model)) cfg.model = pickDefaultModel(p, models);
    Store.saveProviders(); renderProviderStatus(); renderSettings();
    const m = $(`[data-prov="${p}"] [data-msg]`); m.className = "pc-msg ok"; m.textContent = `✓ Clé valide · ${models.length} modèles`;
    if (!mission) renderMissionIdle();
  } catch (e) {
    msg.className = "pc-msg err";
    msg.textContent = e instanceof TypeError ? "Connexion impossible (réseau bloqué ?)" : e.message;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = Store.theme;
  $("#themeToggle").checked = Store.theme === "light";
}
$("#themeToggle").addEventListener("change", e => { Store.theme = e.target.checked ? "light" : "dark"; LS.set("theme", Store.theme); applyTheme(); });
$("#exportCfg").addEventListener("click", () => IS_EMBEDDED
  ? copy(JSON.stringify({ synkro: 1, agents: Store.agents }, null, 2), "Agents copiés (colle-les dans un fichier .json)")
  : download("synkro-agents.json", JSON.stringify({ synkro: 1, agents: Store.agents }, null, 2), "application/json"));
$("#importCfg").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.agents) || !d.agents.length) throw 0;
    Store.agents = d.agents; Store.saveAgents(); toast("Agents importés"); refreshAgentViews();
  } catch { toast("Fichier invalide"); }
  e.target.value = "";
});
$("#wipeAll").addEventListener("click", async () => {
  if (!(await ask("Effacer TOUT (clés, agents, historique, chats) de ce navigateur ?", "Tout effacer"))) return;
  Object.keys(localStorage).filter(k => k.startsWith("synkro.")).forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* =========================================================
   DÉMARRAGE
   ========================================================= */
Store.init();
Store.history = Store.history.map((h, i) => ({ status: "done", ...h, id: h.id || "old" + i + h.date }));
if (IS_EMBEDDED) $$("#finalDownload, #qrDownload").forEach(b => b.hidden = true);
(async () => {
  try {
    const d = await window.claude?.use?.("downloads");
    if (d) { DOWNLOADS = d; $$("#finalDownload, #qrDownload").forEach(b => b.hidden = false); }
  } catch {}
})();
(async () => {
  try {
    const s = await window.claude?.use?.("sample");
    if (s) {
      SAMPLE = s;
      renderProviderStatus();
      if (!mission) renderMissionIdle();
      if ($("#view-agents").classList.contains("active")) renderAgents();
      if ($("#view-parametres").classList.contains("active")) renderSettings();
    }
  } catch {}
})();
(async () => {
  renderSync("…");
  const ok = await Cloud.init();
  renderSync(ok ? "on" : "off");
  if (!ok) { checkResume(); return; }
  try {
    const cloudAgents = await Cloud.loadAgents();
    if (cloudAgents?.length) { Store.agents = cloudAgents; Store.init(); LS.set("agents", Store.agents); }
    else Cloud.saveAgents(Store.agents);

    const cloudMissions = await Cloud.loadMissions();
    const byId = new Map(cloudMissions.map(m => [m.id, m]));
    Store.history.forEach(h => { if (!byId.has(h.id)) { byId.set(h.id, h); Cloud.saveMission(h); } else if ((h.updated || 0) > (byId.get(h.id).updated || 0)) { byId.set(h.id, h); Cloud.saveMission(h); } });
    Store.history = [...byId.values()].sort((a, b) => b.date - a.date);
    Store.saveHistory();

    if (!mission || !(mission instanceof Mission)) renderMissionIdle();
    if ($("#view-agents").classList.contains("active")) renderAgents();
    if ($("#view-historique").classList.contains("active")) renderHistory();
    renderLaboChips();
    loadCloudChat();
  } catch (e) { console.warn(e); }
  checkResume();
})();
function renderSync(state) {
  const el = $("#syncStatus"); if (!el) return;
  el.className = "sync" + (state === "on" ? " on" : "");
  el.innerHTML = `<i></i>${state === "on" ? "Sauvegardé dans ton compte" : state === "off" ? "Sauvegarde : ce navigateur" : "Connexion au compte…"}`;
}
applyTheme();
renderProviderStatus();
renderMissionIdle();
renderLaboChips();
$("#nameAgent").innerHTML = agentOptions("creatif");
genPalette();
renderQR();
