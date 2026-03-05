// api/hotmart-webhook.js
// Webhook Hotmart — formato Vercel (substitui netlify/functions/hotmart-webhook.js)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HOTMART_SECRET       = process.env.HOTMART_SECRET;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const SITE_URL             = process.env.SITE_URL || 'https://seu-site.vercel.app';
const FROM_EMAIL           = process.env.FROM_EMAIL || 'noreply@potenciamaxima.com.br';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // Verifica token secreto
  const token = req.headers['x-hotmart-hottok'] || req.headers['hottok'];
  if (HOTMART_SECRET && token !== HOTMART_SECRET) {
    console.error('[Webhook] Token inválido:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const evento        = body?.event;
  const email         = body?.data?.buyer?.email?.toLowerCase()?.trim();
  const nome          = body?.data?.buyer?.name || '';
  const hotmartProdId = body?.data?.product?.id?.toString();
  const transacaoId   = body?.data?.purchase?.transaction || body?.data?.transaction_id || '';

  console.log(`[Webhook] ${evento} | ${email} | produto: ${hotmartProdId}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Loga o evento
  await supabase.from('webhook_log').insert({
    evento, email,
    produto_hotmart_id: hotmartProdId,
    transacao_id:       transacaoId,
    payload:            body,
    processado:         false
  });
  try {

    // ——— COMPRA APROVADA ———
    if (evento === 'PURCHASE_APPROVED') {
      if (!email || !hotmartProdId) {
        return res.status(200).json({ ok: true, msg: 'Dados incompletos' });
      }

      await supabase.from('members').upsert({ 
        email: email, 
        name: nome,    
        active: true   
      }, { onConflict: 'email' });
    }
      // Libera acesso + bônus via função SQL
      const { data, error } = await supabase.rpc('liberar_acesso', {
        p_email:        email,
        p_nome:         nome,
        p_hotmart_id:   hotmartProdId,
        p_transacao_id: transacaoId
      });

      if (error) {
        console.error('[Webhook] Erro liberar_acesso:', error);
        await logErro(supabase, transacaoId, error.message);
        return res.status(500).json({ error: 'Erro interno' });
      }

      console.log(`[Webhook] Acesso liberado: ${email} → ${data}`);

      // Envia e-mail com magic link
      await enviarEmailBoasVindas(supabase, email, nome);

      await supabase.from('webhook_log')
        .update({ processado: true })
        .eq('transacao_id', transacaoId);

      return res.status(200).json({ ok: true });
    }

    // ——— REEMBOLSO / CHARGEBACK / CANCELAMENTO ———
    if (['PURCHASE_REFUNDED','PURCHASE_CHARGEBACK','PURCHASE_CANCELED','SUBSCRIPTION_CANCELLATION'].includes(evento)) {
      if (email && hotmartProdId) {
        const { data: membro } = await supabase
          .from('membros').select('id').eq('email', email).single();
        const { data: produto } = await supabase
          .from('produtos').select('id').eq('hotmart_id', hotmartProdId).single();

        if (membro && produto) {
          await supabase.from('acessos')
            .update({ ativo: false })
            .eq('membro_id', membro.id)
            .eq('produto_id', produto.id);

          // Invalida sessões ativas do membro
          await supabase.from('sessoes')
            .update({ expires_at: new Date().toISOString() })
            .eq('membro_id', membro.id);

          console.log(`[Webhook] Acesso revogado: ${email}`);
        }
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true, msg: 'Evento ignorado' });

  } catch (err) {
    console.error('[Webhook] Erro inesperado:', err);
    await logErro(supabase, transacaoId, err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

async function enviarEmailBoasVindas(supabase, email, nome) {
  if (!RESEND_API_KEY) return;
  try {
    // Gera magic link de boas-vindas
    const token = generateToken();
    const expires = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h na compra

    const { data: membro } = await supabase
      .from('membros').select('id').eq('email', email).single();

    if (!membro) return;

    await supabase.from('magic_tokens').insert({
      membro_id:  membro.id,
      email,
      token,
      expires_at: expires.toISOString(),
      used:       false
    });

    const link = `${SITE_URL}?token=${token}`;
    const firstName = nome ? nome.split(' ')[0] : 'membro';

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      email,
        subject: '🔥 Seu acesso ao Potência Máxima está liberado!',
        html:    buildBoasVindasHtml(firstName, link)
      })
    });
  } catch (e) {
    console.error('[Webhook] Erro ao enviar e-mail boas-vindas:', e);
  }
}

function generateToken() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 64; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}

async function logErro(supabase, transacaoId, erro) {
  if (!transacaoId) return;
  await supabase.from('webhook_log').update({ erro }).eq('transacao_id', transacaoId);
}

function buildBoasVindasHtml(nome, link) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0608;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0608;padding:40px 16px">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#130a0d;border-radius:16px;border:1px solid rgba(232,0,45,0.15);overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,#1a0c11,#0d0608);padding:32px;text-align:center;border-bottom:1px solid rgba(232,0,45,0.12)">
    <div style="font-size:40px;margin-bottom:10px">🔥</div>
    <h1 style="color:#e8002d;font-size:22px;font-weight:900;margin:0">POTÊNCIA MÁXIMA</h1>
    <p style="color:rgba(245,232,236,0.5);font-size:11px;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase">Acesso liberado!</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="color:#f5e8ec;font-size:18px;font-weight:700;margin:0 0 6px">Parabéns, ${nome}! 🎉</p>
    <p style="color:rgba(245,232,236,0.7);font-size:14px;line-height:1.7;margin:0 0 20px">
      Sua compra foi confirmada e seu acesso à área de membros já está liberado. Clique abaixo para acessar agora:
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#e8002d;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px 36px;border-radius:10px">
        🚀 Acessar minha área agora
      </a>
    </div>
    <div style="background:rgba(232,0,45,0.06);border:1px solid rgba(232,0,45,0.12);border-radius:10px;padding:14px">
      <p style="color:rgba(245,232,236,0.5);font-size:12px;margin:0;line-height:1.6">
        ⏰ Link válido por <strong style="color:rgba(245,232,236,0.7)">72 horas.</strong><br>
        Para acessar depois, use a opção "Enviar novo link" na tela de login.<br>
        Precisa de ajuda? Responda este e-mail.
      </p>
    </div>
  </td></tr>
  <tr><td style="padding:14px 32px 24px;border-top:1px solid rgba(232,0,45,0.08);text-align:center">
    <p style="color:rgba(245,232,236,0.2);font-size:11px;margin:0">© Potência Máxima · Todos os direitos reservados</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
