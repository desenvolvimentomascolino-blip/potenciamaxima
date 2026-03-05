// api/verify-token.js
// Valida o magic link token e retorna dados do membro + produtos liberados

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token ausente' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Busca token válido
  const { data: magicToken, error } = await supabase
    .from('magic_tokens')
    .select('*, membros(id, nome, email, ativo)')
    .eq('token', token)
    .eq('used', false)
    .single();

  if (error || !magicToken) {
    return res.status(401).json({ error: 'Link inválido ou expirado.' });
  }

  // Verifica expiração
  if (new Date(magicToken.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Link expirado. Solicite um novo.' });
  }

  const membro = magicToken.membros;
  if (!membro || !membro.ativo) {
    return res.status(403).json({ error: 'Acesso inativo.' });
  }

  // Marca token como usado
  await supabase
    .from('magic_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', magicToken.id);

  // Atualiza último acesso
  await supabase
    .from('membros')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', membro.id);

  // Busca produtos liberados para este membro
  const { data: acessos } = await supabase
    .from('acessos')
    .select(`
      produto_id,
      ativo,
      produtos (
        id, titulo, tipo, descricao, capa_url, banner_url,
        pdf_url, video_url, hotmart_id, url_vendas, preco,
        duracao, publicado, destaque, is_bonus, ordem,
        categorias (nome, icone)
      )
    `)
    .eq('membro_id', membro.id)
    .eq('ativo', true);

  const produtosLiberados = (acessos || [])
    .filter(a => a.produtos && a.produtos.publicado)
    .map(a => a.produtos);

  // Gera sessão assinada (simples, sem JWT pesado)
  const sessaoId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  await supabase.from('sessoes').insert({
    id:         sessaoId,
    membro_id:  membro.id,
    expires_at: expiresAt.toISOString()
  });

  return res.status(200).json({
    ok: true,
    sessao: sessaoId,
    expira: expiresAt.toISOString(),
    membro: {
      id:    membro.id,
      nome:  membro.nome,
      email: membro.email
    },
    produtos: produtosLiberados
  });
};

function generateSessionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 80; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}
