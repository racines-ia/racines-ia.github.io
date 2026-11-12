import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

// mk-notify : appelé par la base quand un acheteur envoie sa capture.
// Envoie une notification sur le téléphone du vendeur (ou de l'admin pour une vente « loyer »).
const PUB = "BLtRAGJQHR_PdDY53BuJclpFDnRcntA05a7vsZUsj3l3h8-fyr6U2hlleG6hoVJMeY885Hdgddgw4bwazZ7mlik";
const SITE = "https://racines-ia.github.io/cuervo/";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "méthode" }, 405);
  const hook = req.headers.get("x-mk-hook") ?? "";
  const { order_id } = await req.json().catch(() => ({}));
  if (!hook || !order_id) return json({ error: "requête invalide" }, 400);
  const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const rpc = (fn: string, body: unknown) => fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const r = await rpc("mk_notify_ctx", { p_order: order_id, p_hook: hook });
  if (!r.ok) return json({ error: "interdit" }, 403);
  const c = await r.json();
  if (!c || !c.subs?.length) return json({ envoye: 0 });
  webpush.setVapidDetails(SITE, PUB, c.vapid);
  const prix = Number(c.montant).toLocaleString("fr-FR") + (c.devise === "CDF" ? " FC" : " $");
  const payload = JSON.stringify({
    title: c.pour_loyer ? "Paiement loyer à confirmer" : "Nouveau paiement à confirmer",
    body: `${c.nom || "Un client"} a payé ${prix} pour « ${c.titre} ». Touche pour vérifier et confirmer.`,
    url: SITE + "?v=compte",
  });
  const morts: string[] = []; let ok = 0;
  await Promise.all(c.subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" }); ok++; }
    catch (e) { const st = (e as { statusCode?: number }).statusCode; if (st === 404 || st === 410) morts.push(s.id); }
  }));
  if (morts.length) await rpc("mk_push_drop", { p_ids: morts, p_hook: hook });
  return json({ envoye: ok, supprimes: morts.length });
});
