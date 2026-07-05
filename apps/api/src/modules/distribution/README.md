# Distribution

Capa 4: empuja notas ya publicadas (`status='published'`) a canales externos, solo director. `POST /facebook` (Graph API, requiere `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN`), `POST /whatsapp` (devuelve link wa.me — sin Business API), `POST /wordpress` (REST + `WORDPRESS_URL`/`WORDPRESS_USER`/`WORDPRESS_APP_PASSWORD`). Cada push queda en `published_content`; `GET /log` y `GET /channels` alimentan la sección Distribución de la pantalla Aprobación. Sin credenciales el canal responde 503 ("no configurado").

Spec original: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
