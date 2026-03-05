// api/session.js
// Valida sessão existente e retorna produtos atualizados

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessaoId } = req.body || {};
  if (!sessaoId) return res.status(400).json({ error: 'Sessão ausente' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: sessao } = await supabase
    .from('sessoes')
    .select('*, membros(id, nome, email, ativo)')
    .eq('id', sessaoId)
    .single();

  if (!sessao || new Date(sessao.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }

  const membro = sessao.membros;
  if (!membro || !membro.ativo) {
    return res.status(403).json({ error: 'Acesso inativo' });
  }

  // Renova expiração
  const novaExpiracao = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await supabase.from('sessoes')
    .update({ expires_at: novaExpiracao.toISOString() })
    .eq('id', sessaoId);

  // Produtos liberados atualizados
  const { data: acessos } = await supabase
    .from('acessos')
    .select(`
      produto_id, ativo,
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

  return res.status(200).json({
    ok: true,
    membro: { id: membro.id, nome: membro.nome, email: membro.email },
    produtos: produtosLiberados
  });
};
