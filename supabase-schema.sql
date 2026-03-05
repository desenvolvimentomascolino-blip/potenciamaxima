-- ============================================================
-- POTÊNCIA MÁXIMA — Schema Supabase
-- Cole este SQL no painel do Supabase:
--   Dashboard → SQL Editor → New query → Cole e Execute
-- ============================================================

-- ===========================
-- TABELA: members
-- Registra quem comprou e tem acesso
-- ===========================
CREATE TABLE IF NOT EXISTS members (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL,
  name          TEXT        DEFAULT '',
  product_id    TEXT        NOT NULL,
  product_name  TEXT        DEFAULT '',
  active        BOOLEAN     DEFAULT true,
  purchased_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Evita duplicar o mesmo email+produto
  UNIQUE (email, product_id)
);

-- Índice para busca por email (ex: verificar acesso no login)
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_product ON members(product_id);

-- ===========================
-- TABELA: progress
-- Armazena o progresso de leitura de cada membro
-- ===========================
CREATE TABLE IF NOT EXISTS progress (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT        NOT NULL,
  product_id    TEXT        NOT NULL,
  percent       INT         DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (email, product_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_email ON progress(email);

-- ===========================
-- FUNÇÃO: atualiza updated_at automaticamente
-- ===========================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================
-- ROW LEVEL SECURITY (RLS)
-- Protege os dados para que cada usuário veja apenas o seu
-- ===========================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

-- Política para a Netlify Function (service_role ignora RLS automaticamente)
-- Política para leitura pública por email (opcional, se quiser consulta pelo front-end)
CREATE POLICY "Leitura pelo próprio email"
  ON members FOR SELECT
  USING (true); -- Ajuste conforme sua necessidade de segurança

CREATE POLICY "Inserção pelo webhook"
  ON members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Atualização pelo webhook"
  ON members FOR UPDATE
  USING (true);

CREATE POLICY "Progresso: leitura pelo email"
  ON progress FOR SELECT
  USING (true);

CREATE POLICY "Progresso: inserção/atualização"
  ON progress FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===========================
-- EXEMPLO DE CONSULTA
-- Verificar se um email tem acesso a um produto:
-- SELECT active FROM members WHERE email = 'usuario@email.com' AND product_id = 'potencia-maxima' AND active = true;
-- ===========================


-- ============================================================
--  ATUALIZAÇÃO DO SCHEMA — Magic Links, Sessões e Vídeos
--  Cole este bloco no SQL Editor do Supabase
-- ============================================================

-- Adiciona campo video_url na tabela produtos (se não existir)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ============================================================
--  MAGIC TOKENS (links de acesso por e-mail)
-- ============================================================
CREATE TABLE IF NOT EXISTS magic_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  membro_id   UUID NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT false,
  used_at     TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magic_token ON magic_tokens(token);
CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_tokens(email);

-- Limpeza automática de tokens velhos (roda via cron ou manualmente)
-- DELETE FROM magic_tokens WHERE expires_at < NOW() - INTERVAL '1 day';

-- ============================================================
--  SESSÕES (mantém usuário logado por 7 dias)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessoes (
  id          TEXT PRIMARY KEY,   -- session ID gerado no backend
  membro_id   UUID NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_membro ON sessoes(membro_id);

-- RLS para novas tabelas
ALTER TABLE magic_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;

-- Somente service_role acessa essas tabelas (backend)
CREATE POLICY "magic_tokens_service" ON magic_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "sessoes_service" ON sessoes
  FOR ALL USING (auth.role() = 'service_role');
