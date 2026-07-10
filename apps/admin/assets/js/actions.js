// CREA Panel Admin — acciones (submit/handle) y delegación de eventos por data-action.
import { state, setState, setData, adminApi, adminApiBlob, loadScreenData, mergeKey, setProposalsKey, isSoundMuted } from './store.js';
import { readEditorForm, buildNotaPreviewDoc } from './editor.js';
import { readNewsletterForm } from './hermes.js';
import { goTo, login, logout } from './auth.js';

// ---------- lectura de formularios inline ----------

function getNewsletterEventForm() {
  var evDate = document.getElementById('ne-date').value;
  var evTitle = document.getElementById('ne-title').value.trim();
  return { evDate: evDate, evTitle: evTitle };
}

// ---------- click delegation ----------

export function handleClick(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.getAttribute('data-action');
  switch (action) {
    case 'logout': logout(); break;
    case 'goto': goTo(el.getAttribute('data-id'), el.getAttribute('data-pid') ? Number(el.getAttribute('data-pid')) : null); break;
    case 'open-editor': goTo('editor', Number(el.getAttribute('data-id'))); break;
    case 'close-editor': setState({ editorProposalId: null, editorDraft: null }); break;
    case 'toggle-notifications':
      var opening = !state.showNotifications;
      setState({ showNotifications: opening });
      if (opening) {
        try { localStorage.setItem('crea-admin-last-notif-seen', new Date().toISOString()); } catch (e) { /* modo privado */ }
      }
      break;
    case 'toggle-sound':
      var muted = !isSoundMuted();
      try { localStorage.setItem('crea-admin-sound-muted', muted ? '1' : '0'); } catch (e) { /* modo privado */ }
      setState({ soundMuted: muted });
      break;
    case 'dismiss-toast':
      if (el.getAttribute('data-kind') === 'error') setState({ errorMsg: null });
      else setState({ successMsg: null });
      break;
    case 'set-radar-source': setState({ radarSource: el.getAttribute('data-value') }); break;
    case 'set-radar-status': setState({ radarStatus: el.getAttribute('data-value') }); break;
    case 'set-radar-tab': setState({ radarTab: el.getAttribute('data-tab') }); loadScreenData('radar'); break;
    case 'detect-competitors':
      setState({ competitorsBusy: true });
      adminApi('/api/listening/competitors/detect', { method: 'POST' })
        .then(function () { return adminApi('/api/listening/competitors'); })
        .then(function (posts) {
          state.data.competitors = posts;
          setState({ competitorsBusy: false, successMsg: 'Exploración de competencia completada.' });
        })
        .catch(function (err) { setState({ competitorsBusy: false, errorMsg: err.message }); });
      break;
    case 'detect-competitors-fb':
      setState({ competitorsBusy: true });
      adminApi('/api/listening/competitors/detect', { method: 'POST', body: { source: 'facebook' } })
        .then(function () { return Promise.all([adminApi('/api/listening/competitors'), adminApi('/api/listening/topics')]); })
        .then(function (results) {
          state.data.competitors = results[0];
          state.data.topics = results[1];
          setState({ competitorsBusy: false, successMsg: 'Escaneo de Facebook completado.' });
        })
        .catch(function (err) { setState({ competitorsBusy: false, errorMsg: err.message }); });
      break;
    case 'analyze-competitor': submitAnalyzeCompetitor(Number(el.getAttribute('data-id'))); break;
    case 'delete-competitor': submitDeleteCompetitor(Number(el.getAttribute('data-id'))); break;
    case 'clear-competitors': submitClearCompetitors(); break;
    case 'competitor-to-idea': submitCompetitorToIdea(Number(el.getAttribute('data-id'))); break;
    case 'set-leads-status': setState({ leadsStatus: el.getAttribute('data-value') }); break;
    case 'mark-lead': submitMarkLead(Number(el.getAttribute('data-id')), el.getAttribute('data-status')); break;
    case 'convert-lead': submitConvertLead(Number(el.getAttribute('data-id'))); break;
    case 'delete-lead': submitDeleteLead(Number(el.getAttribute('data-id'))); break;
    case 'open-radar': setState({ selectedRadarId: Number(el.getAttribute('data-id')) }); break;
    case 'close-radar': setState({ selectedRadarId: null }); break;
    case 'approve-topic': submitApproveTopic(Number(el.getAttribute('data-id'))); break;
    case 'delete-topic': submitDeleteTopic(Number(el.getAttribute('data-id'))); break;
    case 'clear-topics': submitClearTopics(); break;
    case 'open-comentario': setState({ comentarioPieceId: Number(el.getAttribute('data-id')), comentarioText: '' }); break;
    case 'close-comentario': setState({ comentarioPieceId: null, comentarioText: '' }); break;
    case 'confirm-comentario': submitReturn(Number(el.getAttribute('data-id'))); break;
    case 'set-transparency': setState({ transparency: mergeKey(state.transparency, el.getAttribute('data-piece'), el.getAttribute('data-label')) }); break;
    case 'approve-piece': submitPublish(Number(el.getAttribute('data-id'))); break;
    case 'distribute': submitDistribute(el.getAttribute('data-channel'), Number(el.getAttribute('data-id'))); break;
    case 'set-config-tab': setState({ configTab: el.getAttribute('data-tab') }); loadScreenData('configuracion'); break;
    case 'approve-propuesta': submitApproveProposal(Number(el.getAttribute('data-id'))); break;
    case 'start-reject-propuesta': setState({ propuestaRejecting: Number(el.getAttribute('data-id')) }); break;
    case 'confirm-reject-propuesta': submitRejectProposal(Number(el.getAttribute('data-id'))); break;
    case 'advance-client': submitAdvanceClient(Number(el.getAttribute('data-id')), el.getAttribute('data-stage')); break;
    case 'delete-idea': submitDeleteIdea(Number(el.getAttribute('data-id'))); break;
    case 'open-client-form': setState({ clientFormOpen: true, clientFormError: null }); break;
    case 'close-client-form': setState({ clientFormOpen: false, clientFormError: null }); break;
    case 'delete-client': submitDeleteClient(Number(el.getAttribute('data-id'))); break;
    case 'delete-propuesta': submitDeleteProposal(Number(el.getAttribute('data-id'))); break;
    case 'save-draft': submitDraft(Number(el.getAttribute('data-id')), false); break;
    case 'submit-review': submitDraft(Number(el.getAttribute('data-id')), true); break;
    case 'open-new-user': setState({ newUserOpen: true, newUserError: null, editingUserId: null }); break;
    case 'open-edit-user': setState({ newUserOpen: true, newUserError: null, editingUserId: Number(el.getAttribute('data-id')) }); break;
    case 'close-new-user': setState({ newUserOpen: false, newUserError: null, editingUserId: null }); break;
    case 'toggle-user-active': submitToggleUser(Number(el.getAttribute('data-id')), el.getAttribute('data-active') === 'true'); break;
    case 'open-new-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: null }); break;
    case 'edit-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: Number(el.getAttribute('data-id')) }); break;
    case 'close-service-form': setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null }); break;
    case 'delete-service': submitDeleteService(Number(el.getAttribute('data-id'))); break;
    case 'open-new-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: null }); break;
    case 'edit-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: Number(el.getAttribute('data-id')) }); break;
    case 'close-fb-account-form': setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null }); break;
    case 'delete-fb-account': submitDeleteFbAccount(Number(el.getAttribute('data-id'))); break;
    case 'generate-draft':
      if (!state.editorProposalId) break;
      state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm());
      setState({ generatingDraft: true });
      adminApi('/api/content/generate-draft', { method: 'POST', body: { proposal_id: state.editorProposalId } })
        .then(function (res) {
          if (state.editorDraft) state.editorDraft.body = res.body;
          setState({ generatingDraft: false });
        })
        .catch(function (err) { setState({ generatingDraft: false, errorMsg: err.message }); });
      break;
    case 'preview-piece': {
      var ppid = Number(el.getAttribute('data-id'));
      var ppLists = (state.data.proposalsByKey.borrador || []).concat(state.data.proposalsByKey.en_revision || []);
      var pp = ppLists.filter(function (p) { return p.id === ppid; })[0];
      if (pp) setState({ pickerPreview: pp });
      break;
    }
    case 'close-picker-preview': setState({ pickerPreview: null }); break;
    case 'toggle-mobile-nav': setState({ mobileNavOpen: !state.mobileNavOpen }); break;
    case 'delete-borrador': submitDeleteBorrador(Number(el.getAttribute('data-id'))); break;
    case 'reopen-published': submitReopenPublished(Number(el.getAttribute('data-id'))); break;
    case 'delete-published': submitDeletePublished(Number(el.getAttribute('data-id'))); break;
    case 'generate-image':
      if (!state.editorProposalId) break;
      state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm());
      var imgPrompt = document.getElementById('editor-image-prompt').value;
      if (!imgPrompt.trim()) { setState({ errorMsg: 'Escribe un prompt para generar la imagen.' }); break; }
      setState({ generatingImage: true, editorImagePrompt: imgPrompt });
      adminApi('/api/content/generate-image', { method: 'POST', body: { proposal_id: state.editorProposalId, prompt: imgPrompt } })
        .then(function (res) {
          if (state.editorDraft) state.editorDraft.cover_image_url = res.cover_image_url;
          setState({ generatingImage: false, successMsg: 'Imagen de portada generada.' });
        })
        .catch(function (err) { setState({ generatingImage: false, errorMsg: err.message }); });
      break;
    case 'run-qa':
      if (!state.editorProposalId) break;
      setState({ qaBusy: true, qaResult: null });
      adminApi('/api/content/qa-check', { method: 'POST', body: { proposal_id: state.editorProposalId } })
        .then(function (res) { setState({ qaBusy: false, qaResult: res }); })
        .catch(function (err) { setState({ qaBusy: false, errorMsg: err.message }); });
      break;
    case 'close-qa': setState({ qaResult: null }); break;
    case 'preview-nota':
      if (!state.editorDraft) break;
      var previewFields = readEditorForm();
      state.editorDraft = Object.assign({}, state.editorDraft, previewFields);
      setState({ notaPreviewHtml: buildNotaPreviewDoc(previewFields) });
      break;
    case 'close-nota-preview': setState({ notaPreviewHtml: null }); break;
    case 'generate-newsletter':
    case 'regenerate-newsletter':
      setState({ newsletterBusy: true, errorMsg: null });
      adminApi('/api/newsletter/generate', { method: 'POST' })
        .then(function (content) { setState({ newsletterBusy: false, newsletterContent: content, newsletterPreview: null, newsletterAudioUrl: null }); })
        .catch(function (err) { setState({ newsletterBusy: false, errorMsg: err.message }); });
      break;
    case 'preview-newsletter':
      adminApi('/api/newsletter/preview', { method: 'POST', body: readNewsletterForm() })
        .then(function (res) { setState({ newsletterPreview: res.html, errorMsg: null }); })
        .catch(function (err) { setState({ errorMsg: err.message }); });
      break;
    case 'close-newsletter-preview': setState({ newsletterPreview: null }); break;
    case 'generate-newsletter-audio':
      setState({ newsletterAudioBusy: true, errorMsg: null });
      adminApiBlob('/api/newsletter/audio', { method: 'POST', body: readNewsletterForm() })
        .then(function (blob) {
          setState({ newsletterAudioBusy: false, newsletterAudioUrl: URL.createObjectURL(blob) });
        })
        .catch(function (err) { setState({ newsletterAudioBusy: false, errorMsg: err.message }); });
      break;
    case 'send-newsletter':
      if (!confirm('¿Enviar el newsletter a todos los suscriptores activos? Esta acción no se puede deshacer.')) break;
      setState({ newsletterSending: true, errorMsg: null });
      adminApi('/api/newsletter/send', { method: 'POST', body: readNewsletterForm() })
        .then(function () {
          setState({ newsletterSending: false, newsletterContent: null, newsletterPreview: null, newsletterAudioUrl: null, successMsg: 'Newsletter enviado a los suscriptores.' });
        })
        .catch(function (err) { setState({ newsletterSending: false, errorMsg: err.message }); });
      break;
    case 'detect-radar':
      setState({ radarBusy: true });
      adminApi('/api/listening/topics/detect', { method: 'POST' })
        .then(function () { return adminApi('/api/listening/topics'); })
        .then(function (topics) {
          setState({ radarBusy: false, data: Object.assign({}, state.data, { topics: topics }) });
        })
        .catch(function (err) { setState({ radarBusy: false, errorMsg: err.message }); });
      break;
    case 'generate-proposal-from-topic':
      var topicId = Number(el.getAttribute('data-id'));
      var format = document.getElementById('proposal-format-' + topicId);
      setState({ generatingProposal: true });
      adminApi('/api/content/generate-proposal', { method: 'POST', body: { topic_id: topicId, format: format ? format.value : 'nota' } })
        .then(function (proposal) {
          state.data.proposalsByKey = {};
          setState({ generatingProposal: false, selectedRadarId: null, successMsg: 'Propuesta creada: ' + proposal.title });
        })
        .catch(function (err) { setState({ generatingProposal: false, errorMsg: err.message }); });
      break;
    case 'open-social-form': setState({ socialFormOpen: true, socialFormError: null }); break;
    case 'close-social-form': setState({ socialFormOpen: false, socialFormError: null, socialBusy: false }); break;
    case 'toggle-social': submitToggleSocial(Number(el.getAttribute('data-id')), el.getAttribute('data-pub') === 'true'); break;
    case 'refetch-social': submitRefetchSocial(Number(el.getAttribute('data-id'))); break;
    case 'delete-social': submitDeleteSocial(Number(el.getAttribute('data-id'))); break;
    case 'delete-newsletter-event':
      var evId = Number(el.getAttribute('data-id'));
      adminApi('/api/newsletter/events/' + evId, { method: 'DELETE' })
        .then(function () { setData({ newsletterEvents: (state.data.newsletterEvents || []).filter(function (ev) { return ev.id !== evId; }) }); })
        .catch(function (err) { setState({ errorMsg: err.message }); });
      break;
    case 'save-sponsor-info':
      var spId = Number(el.getAttribute('data-id'));
      adminApi('/api/commercial/clients/' + spId, { method: 'PATCH', body: {
        website_url: document.getElementById('sponsor-link-' + spId).value.trim(),
        sponsor_copy: document.getElementById('sponsor-copy-' + spId).value.trim(),
      } })
        .then(function (updated) {
          setData({ clients: (state.data.clients || []).map(function (c) { return c.id === spId ? Object.assign({}, c, updated) : c; }) });
        })
        .catch(function (err) { setState({ errorMsg: err.message }); });
      break;
    default: break;
  }
}

// ---------- write actions ----------

export function submitApproveProposal(id) {
  adminApi('/api/editorial/proposals/' + id + '/approve', { method: 'PATCH' })
    .then(function () {
      var list = state.data.proposalsByKey.propuesta.filter(function (p) { return p.id !== id; });
      var byKey = Object.assign({}, state.data.proposalsByKey, { propuesta: list, borrador: null });
      setData({ proposalsByKey: byKey });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitRejectProposal(id) {
  var textarea = document.getElementById('reject-reason-' + id);
  var reason = textarea ? textarea.value.trim() : '';
  if (!reason) { textarea && textarea.focus(); setState({ errorMsg: 'Escribe un motivo antes de rechazar la propuesta.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/reject', { method: 'PATCH', body: { reason: reason } })
    .then(function () {
      var list = state.data.proposalsByKey.propuesta.filter(function (p) { return p.id !== id; });
      setState({ propuestaRejecting: null, successMsg: 'Propuesta rechazada.' });
      setProposalsKey('propuesta', list);
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDraft(id, thenSubmitReview) {
  var body = readEditorForm();
  adminApi('/api/editorial/proposals/' + id + '/draft', { method: 'PATCH', body: body })
    .then(function (updated) {
      if (!thenSubmitReview) {
        setState({ editorDraft: {
          title: updated.title || '', body: updated.body || '', section: updated.section || '', dek: updated.dek || '', slug: updated.slug || '',
          cover_image_url: updated.cover_image_url || '', author_name: updated.author_name || '',
          is_sponsored: Boolean(updated.is_sponsored), sponsor_name: updated.sponsor_name || ''
        }, successMsg: 'Borrador guardado.' });
        return;
      }
      return adminApi('/api/editorial/proposals/' + id + '/submit-review', { method: 'PATCH' }).then(function () {
        state.editorProposalId = null;
        state.editorDraft = null;
        state.data.proposalsByKey = {};
        goTo('dashboard');
        setState({ successMsg: 'Nota enviada a revisión.' });
      });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitPublish(id) {
  var origin = state.transparency[id];
  adminApi('/api/editorial/proposals/' + id + '/publish', { method: 'PATCH', body: { origin: origin } })
    .then(function () {
      var list = state.data.proposalsByKey.en_revision.filter(function (p) { return p.id !== id; });
      setProposalsKey('en_revision', list);
      setState({ successMsg: 'Nota publicada correctamente.' });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitReturn(id) {
  var comentarioText = (document.getElementById('comentario-text') || {}).value || '';
  if (!comentarioText.trim()) { setState({ errorMsg: 'Escribe un comentario antes de regresar la nota.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/return', { method: 'PATCH', body: { comment: comentarioText } })
    .then(function () {
      var list = state.data.proposalsByKey.en_revision.filter(function (p) { return p.id !== id; });
      setState({ comentarioPieceId: null, comentarioText: '', successMsg: 'Nota regresada a borrador.' });
      setProposalsKey('en_revision', list);
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitAdvanceClient(id, nextStage) {
  adminApi('/api/commercial/clients/' + id, { method: 'PATCH', body: { pipeline_stage: nextStage } })
    .then(function (updated) {
      var list = state.data.clients.map(function (c) { return c.id === id ? Object.assign({}, c, updated) : c; });
      setData({ clients: list });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteService(id) {
  if (!confirm('¿Eliminar este paquete? Desaparece de servicios.html de inmediato. No se puede deshacer.')) return;
  adminApi('/api/commercial/services/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ services: (state.data.services || []).filter(function (s) { return s.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteFbAccount(id) {
  if (!confirm('¿Eliminar esta cuenta de Facebook? Ya no se usará al escanear.')) return;
  adminApi('/api/listening/competitors/accounts/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ fbAccounts: (state.data.fbAccounts || []).filter(function (a) { return a.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitToggleUser(id, active) {
  adminApi('/api/auth/users/' + id, { method: 'PATCH', body: { active: active } })
    .then(function (updated) {
      var list = state.data.users.map(function (u) { return u.id === id ? updated : u; });
      setData({ users: list });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitToggleSocial(id, isPublished) {
  adminApi('/api/admin/social/' + id, { method: 'PATCH', body: { is_published: isPublished } })
    .then(function (updated) {
      var list = state.data.socialPosts.map(function (p) { return p.id === id ? Object.assign({}, p, updated) : p; });
      setData({ socialPosts: list });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitRefetchSocial(id) {
  adminApi('/api/admin/social/' + id, { method: 'PATCH', body: { refetch: true } })
    .then(function (updated) {
      var list = state.data.socialPosts.map(function (p) { return p.id === id ? Object.assign({}, p, updated) : p; });
      setData({ socialPosts: list });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteIdea(id) {
  if (!confirm('¿Eliminar esta idea? No se puede deshacer.')) return;
  adminApi('/api/editorial/ideas/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ ideas: (state.data.ideas || []).filter(function (i) { return i.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteClient(id) {
  if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
  adminApi('/api/commercial/clients/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ clients: (state.data.clients || []).filter(function (c) { return c.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDistribute(channel, proposalId) {
  setState({ distBusy: channel + ':' + proposalId });
  adminApi('/api/distribution/' + channel, { method: 'POST', body: { proposal_id: proposalId } })
    .then(function (r) {
      if (r && r.share_url) window.open(r.share_url, '_blank');
      setState({ distBusy: null, successMsg: 'Nota enviada a ' + channel + '.' });
    })
    .catch(function (err) { setState({ distBusy: null, errorMsg: err.message }); })
    .then(function () {
      return adminApi('/api/distribution/log?limit=30');
    })
    .then(function (log) { setData({ distLog: log }); })
    .catch(function () { /* best-effort */ });
}

export function submitMarkLead(id, status) {
  adminApi('/api/commercial/leads/' + id, { method: 'PATCH', body: { status: status } })
    .then(function (updated) {
      setData({ leads: (state.data.leads || []).map(function (l) { return l.id === id ? updated : l; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitConvertLead(id) {
  adminApi('/api/commercial/leads/' + id + '/convert', { method: 'POST' })
    .then(function (client) {
      state.data.clients = null;
      setData({ leads: (state.data.leads || []).map(function (l) { return l.id === id ? Object.assign({}, l, { status: 'contactado' }) : l; }) });
      setState({ successMsg: 'Cliente creado en el pipeline: ' + client.name });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteLead(id) {
  if (!confirm('¿Eliminar este lead? No se puede deshacer.')) return;
  adminApi('/api/commercial/leads/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ leads: (state.data.leads || []).filter(function (l) { return l.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitAnalyzeCompetitor(id) {
  adminApi('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } })
    .then(function (updated) {
      setData({ competitors: (state.data.competitors || []).map(function (p) { return p.id === id ? updated : p; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteCompetitor(id) {
  if (!confirm('¿Eliminar esta publicación de competencia? No se puede deshacer.')) return;
  adminApi('/api/listening/competitors/' + id, { method: 'DELETE' })
    .then(function () {
      setData({ competitors: (state.data.competitors || []).filter(function (p) { return p.id !== id; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitClearCompetitors() {
  var posts = state.data.competitors || [];
  if (!posts.length) return;
  if (!confirm('¿Eliminar las ' + posts.length + ' publicaciones de competencia? No se puede deshacer.')) return;
  Promise.all(posts.map(function (p) { return adminApi('/api/listening/competitors/' + p.id, { method: 'DELETE' }); }))
    .then(function () { setData({ competitors: [] }); })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitCompetitorToIdea(id) {
  var post = (state.data.competitors || []).filter(function (p) { return p.id === id; })[0];
  if (!post) return;
  var title = (post.source_account ? post.source_account + ': ' : '') + String(post.post_text || 'publicación de competencia').slice(0, 120);
  var description = (post.post_text || '') + (post.post_url ? '\n\nFuente: ' + post.post_url : '');
  adminApi('/api/editorial/ideas', { method: 'POST', body: { title: title, category: 'Local', description: description } })
    .then(function () {
      state.data.ideas = null;
      setState({ successMsg: 'Idea creada en la bandeja.' });
      return adminApi('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } });
    })
    .then(function (updated) {
      if (updated) setData({ competitors: (state.data.competitors || []).map(function (p) { return p.id === id ? updated : p; }) });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitApproveTopic(id) {
  adminApi('/api/listening/topics/' + id + '/approve', { method: 'PATCH' })
    .then(function () {
      var topics = (state.data.topics || []).map(function (t) { return t.id === id ? Object.assign({}, t, { status: 'Revisado' }) : t; });
      setData({ topics: topics });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteTopic(id) {
  if (!confirm('¿Eliminar este tema detectado? No se puede deshacer.')) return;
  adminApi('/api/listening/topics/' + id, { method: 'DELETE' })
    .then(function () {
      var topics = (state.data.topics || []).filter(function (t) { return t.id !== id; });
      setData({ topics: topics });
      if (state.selectedRadarId === id) setState({ selectedRadarId: null });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitClearTopics() {
  var topics = state.data.topics || [];
  if (!topics.length) return;
  if (!confirm('¿Eliminar los ' + topics.length + ' temas detectados? No se puede deshacer.')) return;
  Promise.all(topics.map(function (t) { return adminApi('/api/listening/topics/' + t.id, { method: 'DELETE' }); }))
    .then(function () { setData({ topics: [] }); setState({ selectedRadarId: null }); })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteBorrador(id) {
  if (!confirm('¿Eliminar este borrador? Se borra también su imagen generada. No se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(function () {
      setProposalsKey('borrador', (state.data.proposalsByKey.borrador || []).filter(function (p) { return p.id !== id; }));
      setState({ successMsg: 'Borrador eliminado.' });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitReopenPublished(id) {
  adminApi('/api/editorial/proposals/' + id + '/reopen', { method: 'PATCH' })
    .then(function () {
      state.data.proposalsByKey = {};
      goTo('editor', id);
      setState({ successMsg: 'Nota reabierta para edición.' });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeletePublished(id) {
  if (!confirm('¿Eliminar esta nota publicada? Se quita del sitio de forma permanente y no se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(function () {
      setProposalsKey('published', (state.data.proposalsByKey.published || []).filter(function (p) { return p.id !== id; }));
      setState({ successMsg: 'Nota publicada eliminada.' });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteProposal(id) {
  if (!confirm('¿Eliminar esta propuesta rechazada? No se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(function () {
      setProposalsKey('rechazada', (state.data.proposalsByKey.rechazada || []).filter(function (p) { return p.id !== id; }));
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function submitDeleteSocial(id) {
  if (!confirm('¿Borrar esta producción? No se puede deshacer.')) return;
  adminApi('/api/admin/social/' + id, { method: 'DELETE' })
    .then(function () {
      var list = state.data.socialPosts.filter(function (p) { return p.id !== id; });
      setData({ socialPosts: list });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

// ---------- forms ----------

export function handleSubmit(e) {
  var form = e.target.closest('[data-action]');
  if (!form) return;
  var action = form.getAttribute('data-action');
  if (action === 'submit-login') {
    e.preventDefault();
    login(form.querySelector('#pl-email').value.trim(), form.querySelector('#pl-pass').value);
  } else if (action === 'submit-idea') {
    e.preventDefault();
    var title = form.querySelector('#idea-title').value.trim();
    if (!title) return;
    adminApi('/api/editorial/ideas', { method: 'POST', body: {
      title: title, category: form.querySelector('#idea-cat').value, description: form.querySelector('#idea-desc').value.trim()
    } }).then(function (created) {
      form.reset();
      setState({ demoNote: 'idea' });
      setData({ ideas: (state.data.ideas || []).concat([Object.assign(created, { collaborator_name: state.user.name })]) });
    }).catch(function (err) { setState({ errorMsg: err.message }); });
  } else if (action === 'submit-new-user') {
    e.preventDefault();
    var nuPassword = form.querySelector('#nu-password').value;
    var nuId = state.editingUserId;
    var nuBody = {
      name: form.querySelector('#nu-name').value.trim(),
      email: form.querySelector('#nu-email').value.trim(),
      role: form.querySelector('#nu-role').value,
    };
    if (!nuId || nuPassword) nuBody.password = nuPassword;
    var nuReq = nuId
      ? adminApi('/api/auth/users/' + nuId, { method: 'PATCH', body: nuBody })
      : adminApi('/api/auth/users', { method: 'POST', body: nuBody });
    nuReq.then(function (saved) {
      setState({ newUserOpen: false, newUserError: null, editingUserId: null });
      var list = nuId
        ? (state.data.users || []).map(function (u) { return u.id === nuId ? saved : u; })
        : (state.data.users || []).concat([saved]);
      setData({ users: list });
    }).catch(function (err) {
      setState({ newUserError: (err.fields && Object.values(err.fields)[0]) || err.message });
    });
  } else if (action === 'submit-service') {
    e.preventDefault();
    var svBody = {
      name: form.querySelector('#sv-name').value.trim(),
      price_label: form.querySelector('#sv-price').value.trim(),
      description: form.querySelector('#sv-desc').value.trim(),
      cta_interest: form.querySelector('#sv-interest').value.trim() || 'Otro',
      features: form.querySelector('#sv-features').value.split('\n').map(function (f) { return f.trim(); }).filter(Boolean),
      sort_order: Number(form.querySelector('#sv-order').value) || 0,
      active: form.querySelector('#sv-active').checked,
    };
    var svId = state.editingServiceId;
    var req = svId
      ? adminApi('/api/commercial/services/' + svId, { method: 'PATCH', body: svBody })
      : adminApi('/api/commercial/services', { method: 'POST', body: svBody });
    req.then(function (saved) {
      setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null });
      var list = svId
        ? (state.data.services || []).map(function (s) { return s.id === svId ? saved : s; })
        : (state.data.services || []).concat([saved]);
      setData({ services: list });
    }).catch(function (err) {
      setState({ serviceFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
    });
  } else if (action === 'submit-fb-account') {
    e.preventDefault();
    var fbaBody = {
      label: form.querySelector('#fba-label').value.trim(),
      handle_or_url: form.querySelector('#fba-handle').value.trim(),
      active: form.querySelector('#fba-active').checked,
    };
    var fbaId = state.editingFbAccountId;
    var fbaReq = fbaId
      ? adminApi('/api/listening/competitors/accounts/' + fbaId, { method: 'PATCH', body: fbaBody })
      : adminApi('/api/listening/competitors/accounts', { method: 'POST', body: fbaBody });
    fbaReq.then(function (saved) {
      setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null });
      var list = fbaId
        ? (state.data.fbAccounts || []).map(function (a) { return a.id === fbaId ? saved : a; })
        : (state.data.fbAccounts || []).concat([saved]);
      setData({ fbAccounts: list });
    }).catch(function (err) {
      setState({ fbAccountFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
    });
  } else if (action === 'submit-newsletter-settings') {
    e.preventDefault();
    adminApi('/api/newsletter/settings', { method: 'PATCH', body: {
      enabled: form.querySelector('#nls-enabled').checked,
      send_hour: Number(form.querySelector('#nls-hour').value),
      send_minute: Number(form.querySelector('#nls-minute').value),
    } }).then(function (updated) {
      setState({ errorMsg: null });
      setData({ newsletterSettings: updated });
    }).catch(function (err) {
      setState({ errorMsg: err.message });
    });
  } else if (action === 'submit-site-metrics') {
    e.preventDefault();
    adminApi('/api/admin/site-metrics', { method: 'PATCH', body: {
      monthly_reach_label: form.querySelector('#sm-reach').value.trim(),
      municipalities_count: Number(form.querySelector('#sm-municipios').value),
      tercer_tiempo_listeners_label: form.querySelector('#sm-listeners').value.trim(),
      audience_age_18_24_pct: Number(form.querySelector('#sm-age-1').value),
      audience_age_25_44_pct: Number(form.querySelector('#sm-age-2').value),
      audience_age_45_plus_pct: Number(form.querySelector('#sm-age-3').value),
    } }).then(function (updated) {
      setState({ errorMsg: null, successMsg: 'Métricas actualizadas.' });
      setData({ siteMetrics: updated });
    }).catch(function (err) {
      setState({ errorMsg: err.message });
    });
  } else if (action === 'submit-newsletter-event') {
    e.preventDefault();
    var formEv = getNewsletterEventForm();
    if (!formEv.evDate || !formEv.evTitle) return;
    adminApi('/api/newsletter/events', { method: 'POST', body: { event_date: formEv.evDate, title: formEv.evTitle } })
      .then(function (created) {
        form.reset();
        setData({ newsletterEvents: (state.data.newsletterEvents || []).concat([created]) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  } else if (action === 'submit-new-client') {
    e.preventDefault();
    var name = form.querySelector('#nc-name').value.trim();
    if (!name) return;
    adminApi('/api/commercial/clients', { method: 'POST', body: {
      name: name,
      business_name: form.querySelector('#nc-business').value.trim(),
      package: form.querySelector('#nc-package').value,
      phone: form.querySelector('#nc-phone').value.trim(),
      email: form.querySelector('#nc-email').value.trim(),
    } }).then(function (created) {
      setState({ clientFormOpen: false, clientFormError: null });
      setData({ clients: (state.data.clients || []).concat([created]) });
    }).catch(function (err) {
      setState({ clientFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
    });
  } else if (action === 'submit-social') {
    e.preventDefault();
    var url = form.querySelector('#social-url').value.trim();
    var pos = parseInt(form.querySelector('#social-position').value, 10);
    if (!url) return;
    setState({ socialBusy: true, socialFormError: null });
    adminApi('/api/admin/social', { method: 'POST', body: {
      external_url: url,
      position: isNaN(pos) ? 0 : pos,
    } }).then(function (created) {
      setState({ socialFormOpen: false, socialBusy: false, socialFormError: null });
      setData({ socialPosts: (state.data.socialPosts || []).concat([created]) });
    }).catch(function (err) {
      setState({ socialBusy: false, socialFormError: (err.fields && err.fields.external_url) || err.message });
    });
  }
}

export function handleChange(e) {
  if (e.target.getAttribute && e.target.getAttribute('data-action') === 'move-idea') {
    var id = Number(e.target.getAttribute('data-id'));
    adminApi('/api/editorial/ideas/' + id, { method: 'PATCH', body: { column_status: e.target.value } })
      .then(function (updated) {
        var list = state.data.ideas.map(function (i) { return i.id === id ? Object.assign({}, i, updated) : i; });
        setData({ ideas: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }
}
