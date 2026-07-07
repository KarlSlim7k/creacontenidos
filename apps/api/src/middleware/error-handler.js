function errorHandler(err, req, res, next) {
  console.error(err);
  // Errores operacionales llevan err.status explícito (400/404/409...) y un mensaje
  // seguro pensado para el cliente. Los que no (500 sin status, ej. excepción de pg)
  // en producción se ocultan tras un mensaje genérico: el detalle va solo al log.
  const status = err.status || 500;
  const safeMessage = err.status
    ? (err.message || 'Error')
    : (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : (err.message || 'Internal server error'));
  res.status(status).json({ error: safeMessage });
}

module.exports = { errorHandler };
