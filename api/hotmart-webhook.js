const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Configuração das suas chaves (Usando a sua nomenclatura)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO: Chaves não configuradas no Netlify!");
    return { statusCode: 500, body: "Erro de configuração interna" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = JSON.parse(event.body);
    console.log("Dados recebidos da Hotmart:", body);

    const email = body.data?.buyer?.email || body.email;
    const name = body.data?.buyer?.name || body.name;

    if (!email) {
      return { statusCode: 400, body: "E-mail não encontrado no JSON" };
    }

    // Tenta salvar no Supabase
    const { error } = await supabase
      .from('members')
      .upsert({ 
        email: email, 
        name: name,
        active: true,
        updated_at: new Date() 
      }, { onConflict: 'email' });

    if (error) throw error;

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Erro na execução:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
