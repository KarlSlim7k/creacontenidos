-- El default 'editor' venía de 001 y no es un rol válido (ROLE_MODULES: director,
-- produccion, comercial, colaborador). Un usuario con role='editor' autentica pero
-- queda con allowedModules vacío. Default al rol de menor privilegio.
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'colaborador';
UPDATE users SET role = 'colaborador' WHERE role = 'editor';
