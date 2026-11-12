import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

// mk-notify : appelé par la base quand un acheteur envoie sa capture.
// Envoie une notification sur le téléphone du vendeur (ou de l'admin pour une vente « loyer »).
const PUB = "BLtRAGJQHR_PdDY53BuJclpFDnRcntA05a7vsZUsj3l3h8-fyr6U2hlleG6hoVJMeY885Hdgddgw4bwazZ7mlik";
const SITE = "https://racines-ia.github.io/cuervo/";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const OPS: Record<string, string> = { mpesa: "M-Pesa", airtel: "Airtel Money", orange: "Orange Money" };
const esc = (t: string) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
let SENDER: { email: string; name: string } | null = null;
async function sendMails(c: Record<string, any>, prix: string) {
  const h = { "api-key": c.brevo, "Content-Type": "application/json", accept: "application/json" };
  if (!SENDER) {
    const r = await fetch("https://api.brevo.com/v3/senders", { headers: h }).catch(() => null);
    const d = r && r.ok ? await r.json() : null;
    const s = (d?.senders || []).find((x: { active?: boolean }) => x.active !== false) || (d?.senders || [])[0];
    if (!s) return 0;
    SENDER = { email: s.email, name: "cuervo.co" };
  }
  const sujet = (c.pour_loyer ? "Paiement loyer à confirmer — " : "Nouveau paiement à confirmer — ") + prix;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0A0705;color:#FFF4EA;border-radius:18px">
  <div style="font-size:22px;font-weight:800">cuervo<span style="color:#FF7A1A">.co</span></div>
  <h2 style="margin:22px 0 6px;font-size:22px">${c.pour_loyer ? "Paiement loyer à confirmer" : "Nouveau paiement à confirmer"}</h2>
  <p style="color:#BFA996;margin:0 0 18px">Un client vient d'envoyer la capture de son paiement. Vérifie que l'argent est bien arrivé sur ton numéro, puis confirme la vente.</p>
  <table style="width:100%;border-collapse:collapse;background:#16100C;border-radius:14px">
   <tr><td style="padding:10px 14px;color:#BFA996">Produit</td><td style="padding:10px 14px;font-weight:700">${esc(c.titre)}</td></tr>
   <tr><td style="padding:10px 14px;color:#BFA996">Montant</td><td style="padding:10px 14px;font-weight:800;color:#FF7A1A">${esc(prix)}</td></tr>
   <tr><td style="padding:10px 14px;color:#BFA996">Client</td><td style="padding:10px 14px">${esc(c.nom || "")} ${c.tel ? "· " + esc(c.tel) : ""}</td></tr>
   <tr><td style="padding:10px 14px;color:#BFA996">Moyen</td><td style="padding:10px 14px">${esc(OPS[c.op] || c.op || "")}</td></tr>
  </table>
  <a href="${SITE}?v=compte" style="display:inline-block;margin-top:22px;padding:14px 26px;border-radius:99px;background:#FF7A1A;color:#1a0a00;font-weight:800;text-decoration:none">Voir et confirmer</a>
  <p style="color:#7d6b5d;font-size:12px;margin-top:22px">Tu reçois cet e-mail car ton adresse est enregistrée dans ta boutique cuervo.co.</p></div>`;
  let n = 0;
  for (const e of c.emails as { email: string; nom: string }[]) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: h, body: JSON.stringify({ sender: SENDER, to: [{ email: e.email, name: e.nom || undefined }], subject: sujet, htmlContent: html }) }).catch(() => null);
    if (r && r.ok) n++; else console.log("brevo", r && r.status, r && await r.text());
  }
  return n;
}

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
  if (!c) return json({ envoye: 0 });
  const prix = Number(c.montant).toLocaleString("fr-FR") + (c.devise === "CDF" ? " FC" : " $");
  const payload = JSON.stringify({
    title: c.pour_loyer ? "Paiement loyer à confirmer" : "Nouveau paiement à confirmer",
    body: `${c.nom || "Un client"} a payé ${prix} pour « ${c.titre} ». Touche pour vérifier et confirmer.`,
    url: SITE + "?v=compte",
  });
  const morts: string[] = []; let ok = 0, mails = 0;
  if (c.subs?.length) webpush.setVapidDetails(SITE, PUB, c.vapid);
  await Promise.all((c.subs || []).map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" }); ok++; }
    catch (e) { const st = (e as { statusCode?: number }).statusCode; if (st === 404 || st === 410) morts.push(s.id); }
  }));
  if (morts.length) await rpc("mk_push_drop", { p_ids: morts, p_hook: hook });
  // E-mail (Brevo) aux vendeurs qui ont renseigné leur adresse
  if (c.brevo && c.emails?.length) mails = await sendMails(c, prix);
  return json({ envoye: ok, emails: mails, supprimes: morts.length });
});
