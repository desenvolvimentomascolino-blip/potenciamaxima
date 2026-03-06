// api/magic-link.js
// Verifica se o email existe no Supabase e envia magic link via Resend

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY       = process.env.RESEND_API_KEY;
const SITE_URL             = process.env.SITE_URL || 'https://seu-site.vercel.app';
const FROM_EMAIL = process.env.FROM_EMAIL || 'acesso@tuguiaemocional.store';
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verifica se o membro existe e está ativo
  const { data: membro, error: membroErr } = await supabase
    .from('membros')
    .select('id, nome, email, ativo')
    .ilike('email', normalizedEmail)
    .single();

  if (membroErr || !membro) {
    // Responde 200 mesmo assim (segurança — não revela se email existe)
    return res.status(200).json({ ok: true, message: 'Se o email estiver cadastrado, você receberá o link.' });
  }

  if (!membro.ativo) {
    return res.status(200).json({ ok: true, message: 'Se o email estiver cadastrado, você receberá o link.' });
  }

  // Gera token único
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

  // Salva token no banco
  await supabase.from('magic_tokens').insert({
    membro_id:  membro.id,
    email:      normalizedEmail,
    token,
    expires_at: expiresAt.toISOString(),
    used:       false
  });

  const magicLink = `${SITE_URL}/api/verify?token=${token}`;
  const nome = membro.nome ? membro.nome.split(' ')[0] : 'membro';

  // Envia e-mail via Resend
  const emailSent = await sendEmail({
    to:      normalizedEmail,
    subject: '🔐 Seu acesso ao Potência Máxima',
    html:    buildEmailHtml(nome, magicLink)
  });

  if (!emailSent) {
    console.error('Falha ao enviar e-mail para:', normalizedEmail);
    return res.status(500).json({ error: 'Erro ao enviar e-mail. Tente novamente.' });
  }

  return res.status(200).json({ ok: true, message: 'Link enviado! Verifique seu e-mail.' });
};

// ——— Helpers ———

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

async function sendEmail({ to, subject, html }) {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer re_seu_token_aqui' // <--- COLOQUE SUA CHAVE DO RESEND AQUI DENTRO DAS ASPAS
      },
      body: JSON.stringify({ 
        from: 'suporte@tuguiaemocional.store', 
        to: to, 
        subject: subject, 
        html: html 
      })
    });
    
    return resp.ok;
  } catch (e) {
    return false;
  }
}
    
    const resText = await resp.text();
    console.log('Resposta do Resend:', resText);
    
    return resp.ok;
  } catch (e) {
    console.error('Erro fatal no fetch do Resend:', e);
    return false;
  }
}

function buildEmailHtml(nome, link) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0608;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0608;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#130a0d;border-radius:16px;border:1px solid rgba(232,0,45,0.15);overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a0c11,#0d0608);padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(232,0,45,0.12)">
            <div style="font-size:36px;margin-bottom:10px">🔐</div>
            <h1 style="color:#e8002d;font-size:22px;font-weight:900;margin:0;letter-spacing:1px">POTÊNCIA MÁXIMA</h1>
            <p style="color:rgba(245,232,236,0.5);font-size:12px;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase">Área de Membros Exclusiva</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="color:#f5e8ec;font-size:18px;font-weight:700;margin:0 0 8px">Olá, ${nome}! 👋</p>
            <p style="color:rgba(245,232,236,0.7);font-size:14px;line-height:1.7;margin:0 0 24px">
              Seu link de acesso exclusivo à área de membros está pronto. Clique no botão abaixo para entrar agora:
            </p>
            <div style="text-align:center;margin:28px 0">
              <a href="${link}" style="display:inline-block;background:#e8002d;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:16px 36px;border-radius:10px;letter-spacing:0.5px">
                ▶ Acessar minha área
              </a>
            </div>
            <div style="background:rgba(232,0,45,0.06);border:1px solid rgba(232,0,45,0.12);border-radius:10px;padding:14px;margin-top:8px">
              <p style="color:rgba(245,232,236,0.5);font-size:12px;margin:0;line-height:1.6">
                ⏰ <strong style="color:rgba(245,232,236,0.7)">Este link expira em 30 minutos.</strong><br>
                Se você não solicitou este acesso, ignore este e-mail.<br>
                Dificuldades? Responda este e-mail.
              </p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid rgba(232,0,45,0.08);text-align:center">
            <p style="color:rgba(245,232,236,0.25);font-size:11px;margin:0">© Potência Máxima · Todos os direitos reservados</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
