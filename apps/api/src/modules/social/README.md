# Social / Producciones CREA

Embeds de redes sociales (TikTok hoy, YouTube cuando se apruebe la API). El editor pega
URLs en el panel admin, el backend resuelve oEmbed y persiste el HTML. El sitio público
solo lee de la DB; si la red cae, los embeds viejos siguen sirviendo.

Rutas:
- `GET  /api/public/social?network=tiktok` (público, con rate limit)
- `GET  /api/public/social/:id/embed` (público, on-demand)
- `GET  /api/admin/social` (autenticado)
- `POST /api/admin/social` (autenticado)
- `PATCH /api/admin/social/:id` (autenticado)
- `DELETE /api/admin/social/:id` (director)
