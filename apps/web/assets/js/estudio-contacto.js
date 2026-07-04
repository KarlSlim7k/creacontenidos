// Estudio CREA — envío del formulario de contacto a POST /api/public/leads.
// Solo se carga en estudio/contacto.html. Los chips [data-interest] y el menú
// móvil los maneja main.js; aquí solo va el submit.

// main.js se carga antes en contacto.html y ya resuelve CREA_API_BASE (incluye
// el caso same-origin en prod, donde vale '' — un `||` aquí lo rompería porque
// '' es falsy).
var CREA_API_BASE = window.CREA_API_BASE;

document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('form[data-lead-form]');
  if (!form) return;
  var note = form.querySelector('[data-form-note]');
  var submitBtn = form.querySelector('button[type="submit"]');

  function setNote(text, kind) {
    note.textContent = text;
    note.style.color = kind === 'error' ? 'var(--accent)' : 'var(--brand)';
    // Foco al mensaje para lectores de pantalla y teclado (además del aria-live).
    note.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var activeChip = form.querySelector('[data-interest].active');
    var payload = {
      name: form.elements.nombre.value.trim(),
      email: form.elements.email.value.trim(),
      company: form.elements.negocio.value.trim(),
      service_interest: activeChip ? activeChip.dataset.value : '',
      message: form.elements.mensaje.value.trim(),
      source_page: 'estudio/contacto',
      website: form.elements.website.value, // honeypot: vacío para humanos
    };

    submitBtn.disabled = true;
    setNote('Enviando…', 'ok');

    fetch(CREA_API_BASE + '/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.status === 201 || res.status === 200) {
          form.reset();
          form.querySelectorAll('[data-interest].active').forEach(function (c) { setChipActive(c, false); });
          setNote('¡Gracias! Recibimos tu mensaje. El equipo comercial te responde en menos de 48 horas.', 'ok');
          return;
        }
        if (res.status === 429) {
          setNote('Has enviado demasiados mensajes en poco tiempo. Espera unos minutos e inténtalo de nuevo.', 'error');
          return;
        }
        return res.json().then(function (body) {
          var fields = body && body.fields ? Object.keys(body.fields).join(', ') : '';
          setNote('No pudimos enviar tu mensaje. Revisa los campos' + (fields ? ' (' + fields + ')' : '') + ' e inténtalo de nuevo.', 'error');
        });
      })
      .catch(function () {
        setNote('No pudimos conectar con el servidor. Inténtalo de nuevo o escríbenos a estudio@crearcontenidos.com.', 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
});
