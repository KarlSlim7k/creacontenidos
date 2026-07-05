-- Los leads del formulario público (010) se escribían pero nadie podía verlos:
-- estado + notas para gestionarlos desde el panel (módulo Leads).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS notes TEXT;
