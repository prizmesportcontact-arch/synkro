/* =========================================================
   Synkro — Données (agents, clés, historique) dans le navigateur
   ========================================================= */

const ICONS = {
  crown: '<path d="M3.5 8l4.5 4 4-6.5 4 6.5 4.5-4-1.8 10.5H5.3z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  pen: '<path d="M4 20l4.5-1 10.3-10.3a2.1 2.1 0 0 0-3-3L5.5 16 4 20z"/><path d="M14 7.5l3 3"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16.2 9.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/>',
  chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/>',
};

const AGENT_COLORS = ["#FF5C35", "#3D7BFF", "#22B573", "#F5A524", "#E8478B", "#8B5CF6", "#14B8A6", "#64748B"];

const DEFAULT_AGENTS = [
  {
    id: "chef", icon: "crown", name: "Chef d'équipe", color: "#FF5C35", provider: "auto", model: "",
    role: "Orchestrateur : découpe l'objectif, distribue le travail et assemble le résultat final.",
    prompt: "Tu es un chef de projet très organisé. Tu découpes les objectifs en tâches claires et tu assembles le travail de ton équipe en un livrable final propre, complet et directement utilisable.",
  },
  {
    id: "chercheur", icon: "search", name: "Chercheur", color: "#3D7BFF", provider: "auto", model: "",
    role: "Analyse, faits, contexte, comparaisons.",
    prompt: "Tu es un analyste rigoureux. Tu poses le contexte, tu listes les faits importants, les options possibles et leurs avantages/inconvénients. Tu signales clairement ce dont tu n'es pas sûr.",
  },
  {
    id: "stratege", icon: "target", name: "Stratège", color: "#22B573", provider: "auto", model: "",
    role: "Plans d'action, étapes, priorités.",
    prompt: "Tu es un stratège pragmatique. Tu transformes les idées en plans d'action concrets : étapes, priorités, délais réalistes et indicateurs de réussite.",
  },
  {
    id: "redacteur", icon: "pen", name: "Rédacteur", color: "#F5A524", provider: "auto", model: "",
    role: "Textes, descriptions, posts, mise en forme.",
    prompt: "Tu es un excellent rédacteur. Tu écris des textes clairs, vivants et bien structurés, adaptés au public visé. Tu évites le blabla et les phrases creuses.",
  },
  {
    id: "creatif", icon: "bulb", name: "Créatif", color: "#E8478B", provider: "auto", model: "",
    role: "Idées originales, noms, concepts.",
    prompt: "Tu es un créatif qui trouve des idées originales, surprenantes mais réalisables. Tu proposes plusieurs pistes variées et tu évites les clichés.",
  },
  {
    id: "codeur", icon: "code", name: "Codeur", color: "#8B5CF6", provider: "auto", model: "",
    role: "Code, scripts, solutions techniques.",
    prompt: "Tu es un développeur expérimenté. Tu écris du code propre, commenté et complet, et tu expliques simplement comment l'utiliser à quelqu'un qui ne sait pas coder.",
  },
  {
    id: "critique", icon: "check", name: "Critique", color: "#14B8A6", provider: "auto", model: "",
    role: "Relit, repère les erreurs et les faiblesses.",
    prompt: "Tu es un relecteur exigeant mais constructif. Tu repères les erreurs, incohérences, oublis et faiblesses, et tu proposes des corrections précises.",
  },
];

const LS = {
  get(k, d) { try { const v = localStorage.getItem("synkro." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("synkro." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("synkro." + k); } catch {} },
};

const Store = {
  agents: LS.get("agents", null) || structuredClone(DEFAULT_AGENTS),
  providers: LS.get("providers", {
    gemini: { key: "", model: PROVIDERS.gemini.defaultModel, models: [] },
    openai: { key: "", model: PROVIDERS.openai.defaultModel, models: [] },
    anthropic: { key: "", model: PROVIDERS.anthropic.defaultModel, models: [] },
  }),
  history: LS.get("history", []),
  theme: LS.get("theme", "dark"),

  init() {
    this.agents.forEach(a => { if (!a.icon) a.icon = DEFAULT_AGENTS.find(d => d.id === a.id)?.icon || "spark"; });
  },

  saveAgents() {
    LS.set("agents", this.agents);
    clearTimeout(this._agT);
    this._agT = setTimeout(() => Cloud.saveAgents(this.agents), 700);
  },
  saveProviders() { LS.set("providers", this.providers); },
  saveHistory() { LS.set("history", this.history.slice(0, 30)); },
  upsertMission(rec) {
    const i = this.history.findIndex(h => h.id === rec.id);
    if (i >= 0) this.history[i] = rec; else this.history.unshift(rec);
    this.history.sort((a, b) => b.date - a.date);
    this.saveHistory();
    Cloud.saveMission(rec);
  },
  deleteMission(id) {
    this.history = this.history.filter(h => h.id !== id);
    this.saveHistory();
    Cloud.deleteMission(id);
  },

  agent(id) { return this.agents.find(a => a.id === id); },
  chef() { return this.agent("chef") || this.agents[0]; },
  critique() { return this.agent("critique"); },

  hasKey(p) { return p === "integre" ? !!SAMPLE : !!this.providers[p]?.key; },
  activeProviders() { return ["integre", "gemini", "openai", "anthropic"].filter(p => this.hasKey(p)); },

  /** Détermine quelle IA utilise réellement un agent.
   *  "auto" → la première IA qui a une clé ; sinon démo.
   *  IA choisie sans clé → repli sur une IA disponible. */
  resolve(agent) {
    const active = this.activeProviders();
    let provider = agent.provider;
    let fallback = false;
    if (provider === "auto" || !provider) provider = active[0] || "demo";
    else if (provider !== "demo" && !this.hasKey(provider)) { fallback = true; provider = active[0] || "demo"; }
    const cfg = this.providers[provider] || {};
    const model = provider === "demo" ? "demo" : provider === "integre" ? "intégré"
      : (agent.provider === provider && agent.model) ? agent.model
      : cfg.model || PROVIDERS[provider].defaultModel;
    return { provider, model, key: cfg.key || "", fallback };
  },
};
