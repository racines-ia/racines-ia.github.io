// Envoi progressif des campagnes (appelé chaque minute par pg_cron).
// Chaque message est rédigé par l'IA pour le client, à partir de l'objectif et de la base de connaissances.
import { askAI, knowledge, logMessage, sendTemplate, sendText, sql, upsertConversation } from "../shared.ts";

Deno.serve(async (req) => {
  const [cfg] = await sql`select value from agent.config where key = 'worker_secret'`;
  if (req.headers.get("x-worker-secret") !== cfg?.value) return new Response("non autorisé", { status: 401 });

  // On réserve les messages dus (évite les doublons si deux exécutions se chevauchent).
  const items = await sql`
    update agent.campaign_items set status = 'sending'
    where id in (
      select i.id from agent.campaign_items i
      join agent.campaigns c on c.id = i.campaign_id
      where i.status = 'pending' and i.send_at <= now() and c.status = 'running'
      order by i.send_at limit 6
      for update skip locked
    )
    returning *`;

  const kbCache = new Map<string, string>();
  for (const it of items) {
    const [camp] = await sql`select * from agent.campaigns where id = ${it.campaign_id}`;
    const [space] = await sql`select * from agent.spaces where id = ${it.space_id}`;
    if (!camp || !space) continue;
    try {
      if (!kbCache.has(space.id)) kbCache.set(space.id, await knowledge(space.id));
      const text = await askAI(
        space,
        `Tu rédiges un message WhatsApp personnel au nom de « ${space.name} » (${space.business}). Ton : ${space.tone}.
Base de connaissances (seule source autorisée, n'invente rien) :
${kbCache.get(space.id)}

Règles : 1 à 3 phrases, naturel, personnalisé avec le prénom si connu, pas de markdown, au plus un émoji,
pas de salutation de fin ni de signature. Réponds uniquement avec le texte du message.`,
        `Objectif de la campagne : ${camp.goal}\nClient : ${it.client_name || "client"}\nNotes sur ce client : ${it.notes || "aucune"}`,
      );
      const conv = await upsertConversation(space.id, it.phone, it.client_name);
      const open = conv.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 23.5 * 3600 * 1000;
      let r;
      if (open) {
        r = await sendText(space, it.phone, text);
      } else if (camp.template_name) {
        r = await sendTemplate(space, it.phone, camp.template_name, camp.template_lang,
          [it.client_name || "", text]);
      } else {
        r = { ok: false, error: "Ce client ne t'a pas écrit depuis 24 h : WhatsApp exige un modèle approuvé (champ « Modèle » de la campagne)." };
      }
      await logMessage(conv.id, "out", "campaign", text, r.id, r.ok ? "ok" : `erreur: ${r.error}`);
      await sql`update agent.campaign_items set status = ${r.ok ? "sent" : "failed"}, text = ${text}, error = ${r.error ?? ""} where id = ${it.id}`;
      if (r.ok) await sql`update agent.campaigns set sent = sent + 1 where id = ${camp.id}`;
      else await sql`update agent.campaigns set failed = failed + 1 where id = ${camp.id}`;
    } catch (e) {
      await sql`update agent.campaign_items set status = 'failed', error = ${String(e).slice(0, 300)} where id = ${it.id}`;
      await sql`update agent.campaigns set failed = failed + 1 where id = ${camp.id}`;
    }
  }

  // Campagnes terminées
  await sql`update agent.campaigns c set status = 'done'
            where status = 'running' and not exists (
              select 1 from agent.campaign_items i where i.campaign_id = c.id and i.status in ('pending','sending'))`;
  return new Response(JSON.stringify({ processed: items.length }), { headers: { "content-type": "application/json" } });
});
