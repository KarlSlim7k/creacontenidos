# Public

API pública para el portal (apps/web): lectura de artículos con `status = 'published'` y alta de leads del formulario de Estudio (`POST /leads`, validado + rate limit estricto + honeypot). Sin auth, con rate limiting. Nunca escribe en tablas de contenido.
