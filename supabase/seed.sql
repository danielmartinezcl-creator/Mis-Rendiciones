-- PENTA y Cía. como primer cliente (beta)
-- Ejecutar después de 001_initial_schema.sql

-- Crear organización PENTA
insert into organizations (id, name, slug, country, currency, plan)
values (
  '00000000-0000-0000-0000-000000000001',
  'PENTA y Cía.',
  'penta',
  'CL',
  'CLP',
  'free'
);

-- NOTA: Los usuarios se crean via Supabase Auth (sign up)
-- Luego se vinculan manualmente a la org en la tabla users.
