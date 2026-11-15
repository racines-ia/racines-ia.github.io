// racines.ia — envoi des notifications sur les téléphones (Web Push)
// Appelée par le déclencheur ecole_push_trg à chaque document utile.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let cfg: Record<string, string> | null = null;
async function conf() {
  if (cfg) return cfg;
  const { data } = await sb.from("ecole_push_cfg").select("k,v");
  cfg = Object.fromEntries((data || []).map((r: any) => [r.k, r.v]));
  webpush.setVapidDetails("mailto:racines.ia@gmail.com", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}
const TYPES: Record<string, string> = { journal: "cahier journal", prep: "cahier de préparation", devoirs: "cahier de devoirs", exos: "cahier d’exercices", resume: "cahier de résumés" };

Deno.serve(async (req) => {
  const c = await conf();
  if (req.headers.get("x-hook-secret") !== c.hook_secret) return new Response("non", { status: 401 });
  const ev = await req.json();
  const { school_id, col, data: d = {}, old, op, by } = ev;
  const { data: mem } = await sb.from("ecole_members").select("user_id,role,profile_id").eq("school_id", school_id);
  const M = mem || [];
  const admins = M.filter((m: any) => m.role === "admin").map((m: any) => m.user_id);
  const all = M.map((m: any) => m.user_id);
  const teacher = (pid: string) => M.filter((m: any) => m.profile_id === pid || m.user_id === pid).map((m: any) => m.user_id);
  let to: string[] = [], msg: any = null;

  // les textes restent généraux : pas de nom d'élève ni de montant (ils passent par les serveurs de Google ou d'Apple)
  if (col === "paiements" && op === "INSERT") {
    to = admins; msg = { title: "Nouveau paiement enregistré", body: "Un paiement vient d’être enregistré. Ouvrez l’application pour le voir.", tag: "paiement" };
  } else if (col === "fiches") {
    if (d.dir && (!old || !old.dir || old.dir.at !== d.dir.at)) {
      to = teacher(d.ens); msg = { title: "Votre document a été corrigé", body: `La direction a signé votre ${TYPES[d.type] || "document"} et donné son avis.`, tag: "fiche-" + ev.id };
    } else if (!d.dir) {
      to = admins; msg = { title: "Document à signer", body: `${d.nom || "Un enseignant"} a enregistré son ${TYPES[d.type] || "document"}.`, tag: "fiche-" + ev.id };
    }
  } else if (col === "communiques") {
    const actif = !d.deb || Date.parse(d.deb) <= Date.now() + 60000;
    if (actif && (!old || old.maj !== d.maj)) { to = all; msg = { title: "Communiqué de la direction", body: d.titre || "Un nouveau communiqué vous attend.", tag: "comm-" + ev.id, always: true }; }
  } else if (col === "messages" && op === "INSERT" && d.ens && d.sens === "dir") {
    to = teacher(d.ens); msg = { title: "Message de la direction", body: "La direction vous a écrit. Ouvrez l’application.", tag: "msg" };
  } else if (col === "messages" && op === "INSERT" && d.sens === "ens") {
    to = admins; msg = { title: "Réponse d’un enseignant", body: `${d.nom || "Un enseignant"} a répondu.`, tag: "msg" };
  } else if (col === "presence") {
    to = admins; msg = { title: "Présence du personnel", body: "La présence du personnel a été mise à jour.", tag: "presence" };
  }
  to = [...new Set(to)].filter((u) => u && u !== by);
  if (!msg || !to.length) return new Response("rien");

  const { data: subs } = await sb.from("ecole_push").select("endpoint,sub").eq("school_id", school_id).in("user_id", to);
  const payload = JSON.stringify({ ...msg, url: "/ecole/" });
  let ok = 0; const errs: string[] = [];
  await Promise.all((subs || []).map(async (s: any) => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 86400, urgency: "high" }); ok++; }
    catch (e: any) { errs.push(String(e?.statusCode || '') + ' ' + String(e?.body || e?.message || e).slice(0, 200)); if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("ecole_push").delete().eq("endpoint", s.endpoint); }
  }));
  return new Response(JSON.stringify({ envoyes: ok, abonnes: (subs || []).length, errs }), { headers: { "Content-Type": "application/json" } });
});
