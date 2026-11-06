/* =========================================================
   Synkro — Sauvegarde dans le compte (quand la page tourne sur claude.ai)
   Tout est rangé dans l'espace privé de l'utilisateur :
     data/users/<id>/agents              → { agents: [...] }
     data/users/<id>/profile/missions/*  → une mission par document
     data/users/<id>/profile/chats/*     → un chat par agent
   Les clés API ne sont JAMAIS envoyées ici (elles restent dans le navigateur).
   ========================================================= */

const Cloud = {
  ready: false,
  db: null,
  uid: null,
  queues: {},

  async init() {
    try {
      if (!window.claude?.use) return false;
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return false;
      const uid = await user.id();
      if (!uid) return false;
      this.db = db; this.uid = uid;
      // Petit test de lecture pour vérifier que tout répond
      await this.withTimeout(this.agentsRef().get(), 10000);
      this.ready = true;
      return true;
    } catch (e) {
      console.warn("Sauvegarde compte indisponible", e);
      this.ready = false;
      return false;
    }
  },

  withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko({ code: "timeout" }), ms))]);
  },

  base() { return "data/users/" + this.uid; },
  agentsRef() { return this.db.doc(this.base() + "/agents"); },
  missions() { return this.db.doc(this.base() + "/profile").collection("missions"); },
  chats() { return this.db.doc(this.base() + "/profile").collection("chats"); },

  /** Écrit un document, une écriture à la fois par document ;
   *  si plusieurs écritures arrivent, seule la dernière part. */
  write(ref, data) {
    if (!this.ready) return;
    const key = ref.path;
    const q = this.queues[key] || (this.queues[key] = { busy: false, next: null });
    q.next = { ref, data };
    if (q.busy) return;
    const pump = async () => {
      q.busy = true;
      while (q.next) {
        const job = q.next; q.next = null;
        try { await job.ref.set(fitSize(job.data)); }
        catch (e) {
          if (e?.code === "unavailable") { await new Promise(r => setTimeout(r, 800 + Math.random() * 800)); try { await job.ref.set(fitSize(job.data)); } catch {} }
          else if (e?.code === "quota_exceeded") toast("Stockage plein : supprime de vieilles missions dans l'historique");
          else console.warn("Écriture échouée", e);
        }
      }
      q.busy = false;
    };
    pump();
  },

  remove(ref) { if (this.ready) ref.delete().catch(() => {}); },

  async loadAgents() {
    const snap = await this.agentsRef().get();
    return snap.exists ? snap.data().agents : null;
  },
  saveAgents(agents) { this.write(this.agentsRef(), { agents }); },

  async loadMissions() {
    const snap = await this.missions().orderBy("date", "desc").limit(40).get();
    return snap.docs.map(d => d.data());
  },
  saveMission(rec) { this.write(this.missions().doc(rec.id), rec); },
  deleteMission(id) { this.remove(this.missions().doc(id)); },

  async loadChat(agentId) {
    const snap = await this.chats().doc(agentId).get();
    return snap.exists ? snap.data().messages || [] : null;
  },
  saveChat(agentId, messages) { this.write(this.chats().doc(agentId), { messages: messages.slice(-60) }); },
  deleteChat(agentId) { this.remove(this.chats().doc(agentId)); },
};

/** Un document est limité à 256 Ko : on raccourcit les textes si besoin. */
function fitSize(data) {
  let json = JSON.stringify(data);
  if (json.length < 240000) return data;
  const copy = JSON.parse(json);
  const cut = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "\n\n…(raccourci pour la sauvegarde)" : s);
  for (const lim of [20000, 8000, 3000]) {
    (copy.tasks || []).forEach(t => t.result = cut(t.result, lim));
    copy.review = cut(copy.review, lim);
    (copy.messages || []).forEach(m => m.content = cut(m.content, lim));
    if (JSON.stringify(copy).length < 240000) break;
  }
  return copy;
}
