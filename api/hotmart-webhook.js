const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // 1. Verificação do método (A Hotmart sempre envia POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  // 2. Configuração das chaves (Pegando das variáveis que você salvou na Vercel)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO: Chaves SUPABASE_URL ou SUPABASE_SERVICE_KEY não encontradas na Vercel!");
    return res.status(500).json({ error: "Erro de configuração interna nas variáveis de ambiente" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Na Vercel, o body já vem pronto, não precisa de JSON.parse
    const body = req.body;
    console.log("Dados recebidos da Hotmart:", body);

    // Pega o e-mail e nome (tentando os dois formatos da Hotmart)
    const email = body.data?.buyer?.email || body.email;
    const name = body.data?.buyer?.name || body.name;

    if (!email) {
      console.error("E-mail não encontrado no JSON enviado pela Hotmart");
      return res.status(400).json({ error: "E-mail não encontrado no JSON" });
    }

    // 3. Tenta salvar no Supabase (Tabela 'members' que você criou)
    const { error } = await supabase
      .from('members')
      .upsert({ 
        email: email, 
        name: name || 'Cliente Sem Nome',
        active: true,
        updated_at: new Date() 
      }, { onConflict: 'email' });

    if (error) {
      console.error("Erro ao inserir no Supabase:", error.message);
      throw error;
    }

    // Resposta de sucesso para a Hotmart parar de tentar enviar
    return res.status(200).send("OK");

  } catch (err) {
    console.error("Erro fatal na execução da API:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
