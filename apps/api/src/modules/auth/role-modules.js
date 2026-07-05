// Mapa canónico rol → módulos del panel admin permitidos. Única fuente de verdad:
// el backend lo aplica en requireRole() y lo expone vía GET /api/auth/session para
// que apps/admin/assets/js/panel.js arme el nav sin mantener su propia copia.
const ROLE_MODULES = {
  director: ['dashboard', 'ideas', 'editor', 'aprobacion', 'comercial', 'leads', 'metricas', 'radar', 'propuestas', 'producciones', 'hermes', 'pipeline', 'configuracion'],
  produccion: ['dashboard', 'ideas', 'editor', 'radar', 'propuestas', 'producciones', 'metricas', 'pipeline'],
  comercial: ['comercial', 'leads'],
  colaborador: ['ideas'],
};

module.exports = { ROLE_MODULES };
