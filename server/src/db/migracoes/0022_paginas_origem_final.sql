-- Evidência de site guarda para onde a leitura realmente foi: URL final e a
-- cadeia de redirecionamentos. A chave continua sendo a URL pedida (cache).
ALTER TABLE paginas_publicas ADD COLUMN url_final TEXT;
ALTER TABLE paginas_publicas ADD COLUMN cadeia JSONB NOT NULL DEFAULT '[]';
