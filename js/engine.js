/* =========================================================
   Synkro — Moteur de mission (agents connectés)
   1. Le chef découpe l'objectif en tâches (plan JSON)
   2. Les tâches prêtes tournent en parallèle ; chaque agent reçoit
      le travail des tâches dont il dépend (tableau partagé)
   3. Le Critique relit l'ensemble (optionnel)
   4. Le chef assemble le résultat final
   ========================================================= */

const MAX_PARALLEL = 3;

function agentSystem(agent, extra = "") {
  return `Tu es « ${agent.name} », un agent de l'équipe Synkro.
Ton rôle : ${agent.role}

${agent.prompt}

${extra}
Réponds toujours en français, en Markdown clair (titres courts, listes, gras pour l'essentiel).`.trim();
}

class Mission {
  constructor(goal, opts, hooks) {
    this.goal = goal.trim();
    this.opts = { maxTasks: 5, review: true, ...opts };
    this.h = hooks;
    this.ctrl = new AbortController();
    this.tasks = [];
    this.board = [];
    this.review = "";
    this.final = "";
    this.stopped = false;
  }

  stop() { this.stopped = true; this.ctrl.abort(); }

  async ask(agent, { system, user, json = false, onText }) {
    const r = Store.resolve(agent);
    return callLLM({ ...r, system, messages: [{ role: "user", content: user }], json, onText, signal: this.ctrl.signal });
  }

  /* ---------- 1. PLAN ---------- */
  async plan() {
    const chef = Store.chef();
    const team = Store.agents.filter(a => a.id !== chef.id && a.id !== "critique");
    this.h.phase("Planification", "live");
    this.h.agent(chef.id, "working", "Je découpe l'objectif en tâches…");
    this.h.node(chef.id, "working");

    const system = agentSystem(chef, `MODE PLAN.
Découpe l'objectif en ${this.opts.maxTasks} tâches MAXIMUM (moins si c'est suffisant), et attribue chaque tâche à l'agent le plus adapté.
Règles :
- Utilise uniquement les identifiants d'agents fournis (jamais toi-même).
- Fais tourner les tâches en parallèle quand c'est possible : "depend_de" ne liste que les tâches dont le RÉSULTAT est vraiment nécessaire.
- Les instructions doivent être précises et suffire à l'agent pour travailler seul.
Réponds UNIQUEMENT en JSON avec ce format exact :
{"resume":"une phrase","taches":[{"id":"t1","titre":"…","agent":"<id>","instructions":"…","depend_de":[]}]}`);

    const user = `OBJECTIF : ${this.goal}

ÉQUIPE DISPONIBLE :
${team.map(a => `- id: ${a.id} — ${a.name} : ${a.role}`).join("\n")}

Renvoie le plan en JSON.`;

    const raw = await this.ask(chef, { system, user, json: true });
    const data = parseJSONLoose(raw);
    const list = Array.isArray(data) ? data : (data.taches || data.tasks || []);
    if (!list.length) throw new LLMError("Le plan est vide.");

    const ids = new Set();
    this.tasks = list.slice(0, this.opts.maxTasks).map((t, i) => {
      let id = String(t.id || `t${i + 1}`);
      if (ids.has(id)) id = `t${i + 1}`;
      ids.add(id);
      const agentId = Store.agent(t.agent) && t.agent !== chef.id ? t.agent : (team[i % team.length] || chef).id;
      return {
        id, agentId,
        title: t.titre || t.title || `Tâche ${i + 1}`,
        instructions: t.instructions || "",
        deps: (t.depend_de || t.depends_on || []).map(String),
        status: "pending", result: "",
      };
    });
    // Nettoie les dépendances invalides
    this.tasks.forEach(t => { t.deps = t.deps.filter(d => d !== t.id && ids.has(d)); });
    this.summary = data.resume || "";

    this.h.agent(chef.id, "done", `**Plan prêt** — ${this.tasks.length} tâches.\n\n${this.summary}`);
    this.h.node(chef.id, "idle");
    this.h.plan(this.tasks);
    return this.tasks;
  }

  /* ---------- 2. EXÉCUTION ---------- */
  async run() {
    const chef = Store.chef();
    this.h.phase("Exécution", "live");

    while (!this.stopped) {
      const pending = this.tasks.filter(t => t.status === "pending");
      if (!pending.length) break;
      let ready = pending.filter(t => t.deps.every(d => this.tasks.find(x => x.id === d)?.status !== "pending" && this.tasks.find(x => x.id === d)?.status !== "running"));
      if (!ready.length) ready = [pending[0]]; // sécurité si dépendance circulaire
      await Promise.all(ready.slice(0, MAX_PARALLEL).map(t => this.runTask(t, chef)));
    }
    if (this.stopped) throw new DOMException("Arrêté", "AbortError");

    /* ---------- 3. RELECTURE ---------- */
    const critic = Store.critique();
    if (this.opts.review && critic) {
      this.h.phase("Relecture", "live");
      this.h.agent(critic.id, "working", "Je relis tout le travail de l'équipe…");
      this.h.node(critic.id, "working");
      this.tasks.forEach(t => this.h.edge(t.agentId, critic.id, "active"));
      try {
        this.review = await this.ask(critic, {
          system: agentSystem(critic, "Tu relis le travail de toute l'équipe avant la livraison. Liste les problèmes (erreurs, oublis, incohérences, passages faibles) et les corrections à faire, par ordre d'importance. Sois concis et précis."),
          user: `OBJECTIF : ${this.goal}\n\nTRAVAIL DE L'ÉQUIPE :\n\n${this.workDump()}`,
          onText: t => this.h.agent(critic.id, "working", t),
        });
        this.h.agent(critic.id, "done", this.review);
        this.addBoard(critic, "Relecture", this.review);
      } catch (e) {
        if (e.name === "AbortError") throw e;
        this.h.agent(critic.id, "error", e.message);
      }
      this.tasks.forEach(t => this.h.edge(t.agentId, critic.id, "done"));
      this.h.node(critic.id, "idle");
    }

    /* ---------- 4. SYNTHÈSE ---------- */
    this.h.phase("Assemblage", "live");
    this.h.agent(chef.id, "working", "J'assemble le résultat final…");
    this.h.node(chef.id, "working");
    this.tasks.forEach(t => this.h.edge(chef.id, t.agentId, "active"));
    this.final = await this.ask(chef, {
      system: agentSystem(chef, `MODE SYNTHÈSE.
Assemble le travail de ton équipe en UN livrable final complet, bien structuré et directement utilisable par l'utilisateur.
${this.review ? "Applique les corrections demandées par le Critique." : ""}
Ne parle pas de l'équipe ni du processus : donne directement le résultat.`),
      onText: t => this.h.agent(chef.id, "working", t.length > 400 ? "J'assemble le résultat final… (" + t.length + " caractères)" : t),
      user: `OBJECTIF : ${this.goal}\n\nTRAVAIL DE L'ÉQUIPE :\n\n${this.workDump()}${this.review ? `\n\n---\nRELECTURE DU CRITIQUE :\n${this.review}` : ""}`,
    });
    this.tasks.forEach(t => this.h.edge(chef.id, t.agentId, "done"));
    this.h.node(chef.id, "idle");
    this.h.agent(chef.id, "done", "Résultat final livré ✓");
    this.h.phase("Terminé", "done");
    this.h.final(this.final);
    return this.final;
  }

  async runTask(task, chef) {
    const agent = Store.agent(task.agentId) || chef;
    task.status = "running";
    this.h.task(task);
    this.h.edge(chef.id, agent.id, "active");
    task.deps.forEach(d => { const dt = this.tasks.find(x => x.id === d); if (dt) this.h.edge(dt.agentId, agent.id, "active"); });
    this.h.node(agent.id, "working");
    this.h.agent(agent.id, "working", `**${task.title}**`);

    const depText = task.deps.map(d => this.tasks.find(x => x.id === d)).filter(Boolean)
      .map(dt => `### ${Store.agent(dt.agentId)?.name || "Agent"} — ${dt.title}\n${dt.status === "error" ? "(cette tâche a échoué)" : dt.result}`).join("\n\n");
    const others = this.tasks.filter(t => t !== task && !task.deps.includes(t.id)).map(t => `- ${t.title} (${Store.agent(t.agentId)?.name})`).join("\n");

    const user = `OBJECTIF GLOBAL : ${this.goal}

TA TÂCHE : ${task.title}
INSTRUCTIONS : ${task.instructions}
${depText ? `\nTRAVAIL DÉJÀ FAIT PAR L'ÉQUIPE (appuie-toi dessus) :\n\n${depText}\n` : ""}
${others ? `\nLes autres tâches, faites par tes collègues (ne les fais pas) :\n${others}\n` : ""}
Fais uniquement ta tâche, de façon complète et concrète.`;

    try {
      task.result = await this.ask(agent, {
        system: agentSystem(agent, "Tu travailles en équipe avec d'autres agents sur un objectif commun."),
        user,
        onText: t => this.h.agent(agent.id, "working", `**${task.title}**\n\n${t}`),
      });
      task.status = "done";
      this.h.agent(agent.id, "done", `**${task.title}**\n\n${task.result}`);
      this.addBoard(agent, task.title, task.result);
    } catch (e) {
      if (e.name === "AbortError") { task.status = "pending"; throw e; }
      task.status = "error";
      task.result = e.message;
      this.h.agent(agent.id, "error", `**${task.title}** — échec : ${e.message}`);
    }
    this.h.edge(chef.id, agent.id, "done");
    task.deps.forEach(d => { const dt = this.tasks.find(x => x.id === d); if (dt) this.h.edge(dt.agentId, agent.id, "done"); });
    this.h.node(agent.id, "idle");
    this.h.task(task);
  }

  workDump() {
    return this.tasks.map(t => `## ${t.title} (par ${Store.agent(t.agentId)?.name || "?"})\n${t.status === "done" ? t.result : "(non réalisée)"}`).join("\n\n");
  }

  addBoard(agent, title, text) {
    const e = { agentId: agent.id, title, text, at: Date.now() };
    this.board.push(e);
    this.h.board(e);
  }

  toHistory() {
    return {
      id: Date.now().toString(36), date: Date.now(), goal: this.goal,
      tasks: this.tasks.map(t => ({ id: t.id, deps: t.deps, title: t.title, agentId: t.agentId, status: t.status, result: t.result })),
      review: this.review, final: this.final,
    };
  }
}
