import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// mk-reset : mot de passe oublié → lien envoyé sur le Gmail de la boutique (Brevo)
const SITE = "https://racines-ia.github.io/cuervo/";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (t: string) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const masque = (e: string) => { const [a, d] = e.split("@"); return (a.length <= 2 ? a[0] + "*" : a.slice(0, 2) + "*".repeat(Math.min(6, a.length - 2))) + "@" + d; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rpc = (fn: string, body: unknown) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const b = await req.json().catch(() => ({}));

  if (b.action === "ask") {
    const tel = String(b.tel || "").replace(/\D/g, "");
    if (tel.length < 11 || tel.length > 15) return json({ error: "Entre le numéro de ton compte." }, 400);
    const r = await rpc("mk_reset_prepare", { p_tel: tel });
    if (!r.ok) return json({ error: "Erreur, réessaie." }, 500);
    const c = await r.json();
    if (!c) return json({ error: "Aucune boutique avec ce numéro." }, 404);
    if (c.sans_email) return json({ sans_email: true });
    if (c.trop) return json({ error: "Un lien vient déjà d'être envoyé. Regarde ton Gmail (et les spams) ou réessaie dans 2 minutes." }, 429);
    const h = { "api-key": c.brevo, "Content-Type": "application/json", accept: "application/json" };
    const sr = await fetch("https://api.brevo.com/v3/senders", { headers: h }).catch(() => null);
    const sd = sr && sr.ok ? await sr.json() : null;
    const s = (sd?.senders || []).find((x: { active?: boolean }) => x.active !== false) || (sd?.senders || [])[0];
    if (!s) return json({ error: "Envoi d'e-mail indisponible." }, 500);
    const lien = `${SITE}?reset=${c.token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#0A0705;color:#FFF4EA;border-radius:18px">
  <div style="font-size:22px;font-weight:800">cuervo<span style="color:#FF7A1A">.co</span></div>
  <h2 style="margin:22px 0 6px;font-size:22px">Nouveau mot de passe</h2>
  <p style="color:#BFA996;margin:0 0 18px">Bonjour ${esc(c.nom || "")}, tu as demandé à changer le mot de passe de ta boutique. Touche le bouton ci-dessous. Le lien marche pendant 30 minutes.</p>
  <a href="${lien}" style="display:inline-block;padding:14px 26px;border-radius:99px;background:#FF7A1A;color:#1a0a00;font-weight:800;text-decoration:none">Choisir mon nouveau mot de passe</a>
  <p style="color:#7d6b5d;font-size:12px;margin-top:22px">Si ce n'est pas toi, ignore cet e-mail : ton mot de passe ne change pas.</p></div>`;
    const m = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: h, body: JSON.stringify({ sender: { email: s.email, name: "cuervo.co" }, to: [{ email: c.email }], subject: "Ton nouveau mot de passe cuervo.co", htmlContent: html }) }).catch(() => null);
    if (!m || !m.ok) { console.log("brevo", m && m.status, m && await m.text()); return json({ error: "L'e-mail n'a pas pu partir. Réessaie." }, 500); }
    return json({ envoye: true, email: masque(c.email) });
  }

  if (b.action === "set") {
    const tok = String(b.token || ""), pw = String(b.password || "");
    if (!/^[0-9a-f]{48}$/.test(tok)) return json({ error: "Lien invalide." }, 400);
    if (pw.length < 6 || pw.length > 72) return json({ error: "Le mot de passe doit avoir au moins 6 caractères." }, 400);
    const r = await rpc("mk_reset_use", { p_token: tok });
    const uid = r.ok ? await r.json() : null;
    if (!uid) return json({ error: "Ce lien a expiré ou a déjà servi. Redemande un nouveau lien." }, 400);
    const u = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: H, body: JSON.stringify({ password: pw }) });
    if (!u.ok) return json({ error: "Impossible de changer le mot de passe. Redemande un lien." }, 500);
    return json({ ok: true });
  }
  return json({ error: "requête invalide" }, 400);
});
