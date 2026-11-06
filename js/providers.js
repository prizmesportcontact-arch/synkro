/* =========================================================
   Synkro — Connexion aux IA (Gemini, ChatGPT, Claude, Démo)
   Les clés sont lues depuis le navigateur (localStorage).
   ========================================================= */

const PROVIDERS = {
  integre: {
    name: "Claude", by: "Intégré · inclus dans ton abonnement", color: "#D97757", letter: "C",
    defaultModel: "intégré", suggestions: ["intégré"],
  },
  gemini: {
    name: "Gemini", by: "Google", color: "#3D7BFF", letter: "G",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Gratuit (avec quota) sur Google AI Studio",
    defaultModel: "gemini-2.5-flash",
    suggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  },
  openai: {
    name: "ChatGPT", by: "OpenAI", color: "#10A37F", letter: "O",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "Payant à l'usage (crédit à ajouter)",
    defaultModel: "gpt-4o-mini",
    suggestions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
  },
  anthropic: {
    name: "Claude", by: "Anthropic", color: "#D97757", letter: "C",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Payant à l'usage (crédit à ajouter)",
    defaultModel: "claude-sonnet-4-5",
    suggestions: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
  },
  demo: {
    name: "Démo", by: "Simulé", color: "#6B7280", letter: "D",
    defaultModel: "demo", suggestions: ["demo"],
  },
};

class LLMError extends Error {}

/** Appel générique.
 *  opts = { provider, model, key, system, messages:[{role:'user'|'assistant', content}], json, signal }
 *  → Promise<string>
 */
async function callLLM(opts) {
  const { provider } = opts;
  if (provider === "demo") return demoCall(opts);
  if (provider === "integre") return callIntegre(opts);
  if (!opts.key) throw new LLMError(`Pas de clé ${PROVIDERS[provider].name}. Ajoute-la dans Paramètres.`);
  if (provider === "gemini") return callGemini(opts);
  if (provider === "openai") return callOpenAI(opts);
  if (provider === "anthropic") return callAnthropic(opts);
  throw new LLMError("Fournisseur inconnu : " + provider);
}

async function readError(res) {
  let txt = "";
  try {
    const j = await res.json();
    txt = j.error?.message || j.error?.type || JSON.stringify(j).slice(0, 200);
  } catch { txt = res.statusText; }
  if (res.status === 401 || res.status === 403) txt = "Clé refusée (" + txt + ")";
  if (res.status === 429) txt = "Quota dépassé ou trop de requêtes, réessaie dans un moment (" + txt + ")";
  if (res.status === 404) txt = "Modèle introuvable (" + txt + ")";
  return new LLMError(txt);
}

/* ---------- Claude intégré (page publiée sur claude.ai) ---------- */
let SAMPLE = null;          // fonction "sample" fournie par claude.ai, ou null
const IS_EMBEDDED = (() => { try { return window.top !== window.self; } catch { return true; } })();

async function callIntegre({ system, messages, json, signal, onText, chat }) {
  if (!SAMPLE) throw new LLMError("Claude intégré n'est pas disponible ici.");
  const msgs = messages.map(m => ({ role: m.role, content: m.content }));
  const head = `CONSIGNES (à suivre, ne pas répéter) :\n${system || ""}${json ? "\n\nRéponds UNIQUEMENT avec du JSON valide, sans texte autour." : ""}\n\n---\n\n`;
  msgs[0] = { ...msgs[0], content: head + msgs[0].content };
  try {
    const r = await SAMPLE(msgs, {
      signal,
      cache: chat ? false : undefined,
      onText: onText ? ({ text }) => { if (text && text !== "Thinking...") onText(text); } : undefined,
    });
    if (!r?.text) throw new LLMError("Réponse vide de Claude");
    return r.text;
  } catch (e) {
    if (e?.name === "AbortError" || signal?.aborted) throw new DOMException("Arrêté", "AbortError");
    if (e instanceof LLMError) throw e;
    if (e?.code === "rate_limited" && !callIntegre._retry) {
      callIntegre._retry = true;
      try { await sleep(5000, signal); return await callIntegre({ system, messages, json, signal, onText, chat }); }
      finally { callIntegre._retry = false; }
    }
    if (e?.code === "rate_limited") throw new LLMError("Trop de demandes d'un coup, attends un peu puis relance.");
    if (e?.code === "not_granted") throw new LLMError("Autorisation refusée : accepte la demande d'accès à Claude puis relance.");
    throw new LLMError(e?.message || "Erreur de Claude");
  }
}

/* ---------- Gemini ---------- */
async function callGemini({ onText, chat,  model, key, system, messages, json, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig = { responseMimeType: "application/json" };
  const res = await fetch(url, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map(p => p.text || "").join("") || "";
  if (!text) throw new LLMError("Réponse vide de Gemini" + (cand?.finishReason ? ` (${cand.finishReason})` : ""));
  return text;
}

/* ---------- OpenAI ---------- */
async function callOpenAI({ onText, chat,  model, key, system, messages, json, signal }) {
  const msgs = [];
  if (system) msgs.push({ role: "system", content: system });
  msgs.push(...messages);
  const body = { model, messages: msgs };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new LLMError("Réponse vide de ChatGPT");
  return text;
}

/* ---------- Anthropic ---------- */
async function callAnthropic({ onText, chat,  model, key, system, messages, json, signal }) {
  const body = { model, max_tokens: 4096, messages };
  if (system) body.system = system + (json ? "\n\nRéponds UNIQUEMENT avec du JSON valide, sans texte autour." : "");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  if (!text) throw new LLMError("Réponse vide de Claude");
  return text;
}

/* ---------- Liste des modèles (bouton "Tester") ---------- */
async function listModels(provider, key) {
  if (provider === "gemini") {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": key } });
    if (!res.ok) throw await readError(res);
    const d = await res.json();
    return (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .filter(n => /^gemini/.test(n) && !/(tts|image|embedding|audio|live|robotics)/.test(n));
  }
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw await readError(res);
    const d = await res.json();
    return (d.data || []).map(m => m.id)
      .filter(id => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|image|tts|transcribe|search|instruct|embedding|codex)/.test(id));
  }
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    });
    if (!res.ok) throw await readError(res);
    const d = await res.json();
    return (d.data || []).map(m => m.id);
  }
  return ["demo"];
}

/** Choisit un bon modèle par défaut dans une liste. */
function pickDefaultModel(provider, models) {
  const prefs = { gemini: /flash(?!-lite)/, openai: /mini/, anthropic: /sonnet/ };
  const sorted = [...models].sort().reverse(); // les versions récentes en premier (approx.)
  return sorted.find(m => prefs[provider]?.test(m) && !/preview|exp/.test(m)) || sorted.find(m => prefs[provider]?.test(m)) || sorted[0];
}

/** Extrait un objet JSON d'un texte (même entouré de ```json …```). */
function parseJSONLoose(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  throw new LLMError("Le chef d'équipe n'a pas renvoyé un plan lisible.");
}

/* =========================================================
   MODE DÉMO — réponses simulées pour tester sans clé
   ========================================================= */
const sleep = (ms, signal) => new Promise((ok, ko) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); ko(new DOMException("Arrêté", "AbortError")); });
});

async function demoCall({ system = "", messages, json, signal }) {
  await sleep(900 + Math.random() * 1600, signal);
  const last = messages[messages.length - 1]?.content || "";

  if (json && /PLAN/.test(system)) {
    const goal = (last.match(/OBJECTIF :\s*([\s\S]*?)\n\n/) || [, last])[1].trim().slice(0, 80);
    const ids = [...last.matchAll(/- id: (\S+)/g)].map(m => m[1]).filter(i => i !== "chef" && i !== "critique");
    const pick = i => ids[i % ids.length] || "redacteur";
    return JSON.stringify({
      resume: `Plan de démo pour : « ${goal} »`,
      taches: [
        { id: "t1", titre: "Analyser l'objectif et le contexte", agent: pick(0), instructions: "Identifie les points clés, le public visé et les contraintes.", depend_de: [] },
        { id: "t2", titre: "Trouver des idées", agent: pick(3), instructions: "Propose 5 idées originales.", depend_de: [] },
        { id: "t3", titre: "Construire le plan d'action", agent: pick(1), instructions: "À partir de l'analyse et des idées, fais un plan concret.", depend_de: ["t1", "t2"] },
        { id: "t4", titre: "Rédiger le livrable", agent: pick(2), instructions: "Rédige une version propre et claire.", depend_de: ["t3"] },
      ],
    });
  }

  if (json && /NOMS/.test(system)) {
    return JSON.stringify({ noms: [
      { nom: "Nova Rush", pourquoi: "Court et dynamique" }, { nom: "Hatchery", pourquoi: "Évoque l'éclosion" },
      { nom: "Yolk Raid", pourquoi: "Drôle et clair" }, { nom: "Egglord", pourquoi: "Mémorable" },
      { nom: "Shellshock", pourquoi: "Jeu de mots" }, { nom: "Nestbreak", pourquoi: "Action + thème" },
    ] });
  }

  const role = (system.match(/Tu es « ([^»]+) »/) || [, "l'agent"])[1];
  return `### Réponse de ${role} *(mode démo)*

Ceci est une **réponse simulée** pour tester l'interface. Ajoute une clé API dans **Paramètres** pour avoir de vraies réponses.

- Point 1 : ce que l'agent aurait analysé
- Point 2 : une proposition concrète
- Point 3 : la prochaine étape

> Demande reçue : « ${last.replace(/\s+/g, " ").slice(0, 140)}${last.length > 140 ? "…" : ""} »`;
}
