// CREA Panel Admin — acciones (submit/handle) y delegación de eventos por data-action.
import {
  state, setState, setData, adminApi, adminApiBlob, loadScreenData, mergeKey, setProposalsKey, isSoundMuted,
  type Screen, type ApiError, type EditorDraft, type Proposal, type Idea, type Client, type Lead, type Service,
  type AdminUser, type SocialPost, type FbAccount, type CompetitorPost, type Topic, type DistLogEntry, type RadarSource, type RadarStats,
  type NewsletterEvent, type NewsletterSettings, type NewsletterContent, type SiteMetrics, type QaResult,
} from './store';
import { readEditorForm, buildNotaPreviewDoc } from './screens/editor';
import { readNewsletterForm } from './screens/hermes';
import { goTo, login, logout } from './auth';

// ---------- lectura de formularios inline ----------

function getNewsletterEventForm() {
  const evDate = (document.getElementById('ne-date') as HTMLInputElement).value;
  const evTitle = (document.getElementById('ne-title') as HTMLInputElement).value.trim();
  return { evDate, evTitle };
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) || '';
}

function firstFieldError(err: ApiError): string {
  const fields = err.fields as Record<string, string> | undefined;
  return (fields && Object.values(fields)[0]) || err.message || 'Error';
}

// ---------- click delegation ----------

export function handleClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  switch (action) {
    case 'logout': logout(); break;
    case 'goto': goTo(attr(el, 'data-id') as Screen, el.getAttribute('data-pid') ? Number(el.getAttribute('data-pid')) : null); break;
    case 'open-editor': goTo('editor', Number(attr(el, 'data-id'))); break;
    case 'close-editor': setState({ editorProposalId: null, editorDraft: null }); break;
    case 'toggle-notifications': {
      const opening = !state.showNotifications;
      setState({ showNotifications: opening });
      if (opening) {
        try { localStorage.setItem('crea-admin-last-notif-seen', new Date().toISOString()); } catch { /* modo privado */ }
      }
      break;
    }
    case 'toggle-sound': {
      const muted = !isSoundMuted();
      try { localStorage.setItem('crea-admin-sound-muted', muted ? '1' : '0'); } catch { /* modo privado */ }
      setState({ soundMuted: muted });
      break;
    }
    case 'dismiss-toast':
      if (el.getAttribute('data-kind') === 'error') setState({ errorMsg: null });
      else setState({ successMsg: null });
      break;
    case 'set-radar-source': setState({ radarSource: attr(el, 'data-value') }); break;
    case 'set-radar-status': setState({ radarStatus: attr(el, 'data-value') }); break;
    case 'set-radar-verification': setState({ radarVerification: attr(el, 'data-value') }); break;
    case 'set-radar-stats-days': {
      const days = Number(attr(el, 'data-value')) || 30;
      setState({ radarStatsDays: days });
      adminApi('/api/listening/radar-stats?days=' + days)
        .then((r) => { setData({ radarStats: r as RadarStats }); })
        .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      break;
    }
    case 'set-radar-tab': setState({ radarTab: attr(el, 'data-tab') as 'temas' | 'competencia' | 'fuentes' }); loadScreenData('radar'); break;
    case 'toggle-radar-source': {
      const id = Number(attr(el, 'data-id'));
      const active = attr(el, 'data-active') !== 'true';
      adminApi(`/api/listening/radar-sources/${id}`, { method: 'PATCH', body: { active } })
        .then(() => adminApi('/api/listening/radar-sources'))
        .then((rows) => { setData({ radarSources: rows as RadarSource[] }); })
        .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      break;
    }
    case 'detect-competitors':
      setState({ competitorsBusy: true });
      adminApi('/api/listening/competitors/detect', { method: 'POST' })
        .then(() => adminApi<CompetitorPost[]>('/api/listening/competitors'))
        .then((posts) => {
          state.data.competitors = posts;
          setState({ competitorsBusy: false, successMsg: 'Exploración de competencia completada.' });
        })
        .catch((err: ApiError) => { setState({ competitorsBusy: false, errorMsg: err.message }); });
      break;
    case 'detect-competitors-fb':
      setState({ competitorsBusy: true });
      adminApi('/api/listening/competitors/detect', { method: 'POST', body: { source: 'facebook' } })
        .then(() => Promise.all([adminApi<CompetitorPost[]>('/api/listening/competitors'), adminApi<Topic[]>('/api/listening/topics')]))
        .then((results) => {
          state.data.competitors = results[0];
          state.data.topics = results[1];
          setState({ competitorsBusy: false, successMsg: 'Escaneo de Facebook completado.' });
        })
        .catch((err: ApiError) => { setState({ competitorsBusy: false, errorMsg: err.message }); });
      break;
    case 'analyze-competitor': submitAnalyzeCompetitor(Number(attr(el, 'data-id'))); break;
    case 'delete-competitor': submitDeleteCompetitor(Number(attr(el, 'data-id'))); break;
    case 'clear-competitors': submitClearCompetitors(); break;
    case 'competitor-to-idea': submitCompetitorToIdea(Number(attr(el, 'data-id'))); break;
    case 'set-leads-status': setState({ leadsStatus: attr(el, 'data-value') }); break;
    case 'mark-lead': submitMarkLead(Number(attr(el, 'data-id')), attr(el, 'data-status')); break;
    case 'convert-lead': submitConvertLead(Number(attr(el, 'data-id'))); break;
    case 'delete-lead': submitDeleteLead(Number(attr(el, 'data-id'))); break;
    case 'open-radar': setState({ selectedRadarId: Number(attr(el, 'data-id')) }); break;
    case 'close-radar': setState({ selectedRadarId: null }); break;
    case 'approve-topic': submitApproveTopic(Number(attr(el, 'data-id'))); break;
    case 'delete-topic': submitDeleteTopic(Number(attr(el, 'data-id'))); break;
    case 'clear-topics': submitClearTopics(); break;
    case 'open-comentario': setState({ comentarioPieceId: Number(attr(el, 'data-id')), comentarioText: '' }); break;
    case 'close-comentario': setState({ comentarioPieceId: null, comentarioText: '' }); break;
    case 'confirm-comentario': submitReturn(Number(attr(el, 'data-id'))); break;
    case 'set-transparency': setState({ transparency: mergeKey(state.transparency, attr(el, 'data-piece'), attr(el, 'data-label')) }); break;
    case 'approve-piece': submitPublish(Number(attr(el, 'data-id'))); break;
    case 'distribute': submitDistribute(attr(el, 'data-channel'), Number(attr(el, 'data-id'))); break;
    case 'set-config-tab': setState({ configTab: attr(el, 'data-tab') }); loadScreenData('configuracion'); break;
    case 'approve-propuesta': submitApproveProposal(Number(attr(el, 'data-id'))); break;
    case 'start-reject-propuesta': setState({ propuestaRejecting: Number(attr(el, 'data-id')) }); break;
    case 'confirm-reject-propuesta': submitRejectProposal(Number(attr(el, 'data-id'))); break;
    case 'advance-client': submitAdvanceClient(Number(attr(el, 'data-id')), attr(el, 'data-stage')); break;
    case 'delete-idea': submitDeleteIdea(Number(attr(el, 'data-id'))); break;
    case 'open-client-form': setState({ clientFormOpen: true, clientFormError: null }); break;
    case 'close-client-form': setState({ clientFormOpen: false, clientFormError: null }); break;
    case 'delete-client': submitDeleteClient(Number(attr(el, 'data-id'))); break;
    case 'delete-propuesta': submitDeleteProposal(Number(attr(el, 'data-id'))); break;
    case 'save-draft': submitDraft(Number(attr(el, 'data-id')), false); break;
    case 'submit-review': submitDraft(Number(attr(el, 'data-id')), true); break;
    case 'open-new-user': setState({ newUserOpen: true, newUserError: null, editingUserId: null }); break;
    case 'open-edit-user': setState({ newUserOpen: true, newUserError: null, editingUserId: Number(attr(el, 'data-id')) }); break;
    case 'close-new-user': setState({ newUserOpen: false, newUserError: null, editingUserId: null }); break;
    case 'toggle-user-active': submitToggleUser(Number(attr(el, 'data-id')), attr(el, 'data-active') === 'true'); break;
    case 'open-new-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: null }); break;
    case 'edit-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: Number(attr(el, 'data-id')) }); break;
    case 'close-service-form': setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null }); break;
    case 'delete-service': submitDeleteService(Number(attr(el, 'data-id'))); break;
    case 'open-new-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: null }); break;
    case 'edit-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: Number(attr(el, 'data-id')) }); break;
    case 'close-fb-account-form': setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null }); break;
    case 'delete-fb-account': submitDeleteFbAccount(Number(attr(el, 'data-id'))); break;
    case 'generate-draft':
      if (!state.editorProposalId) break;
      state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
      setState({ generatingDraft: true });
      adminApi<{ body: string }>('/api/content/generate-draft', { method: 'POST', body: { proposal_id: state.editorProposalId } })
        .then((res) => {
          if (state.editorDraft) state.editorDraft.body = res.body;
          setState({ generatingDraft: false });
        })
        .catch((err: ApiError) => { setState({ generatingDraft: false, errorMsg: err.message }); });
      break;
    case 'preview-piece': {
      const ppid = Number(attr(el, 'data-id'));
      const ppLists = (state.data.proposalsByKey.borrador || []).concat(state.data.proposalsByKey.en_revision || []);
      const pp = ppLists.filter((p: Proposal) => p.id === ppid)[0];
      if (pp) setState({ pickerPreview: pp });
      break;
    }
    case 'close-picker-preview': setState({ pickerPreview: null }); break;
    case 'toggle-mobile-nav': setState({ mobileNavOpen: !state.mobileNavOpen }); break;
    case 'delete-borrador': submitDeleteBorrador(Number(attr(el, 'data-id'))); break;
    case 'reopen-published': submitReopenPublished(Number(attr(el, 'data-id'))); break;
    case 'delete-published': submitDeletePublished(Number(attr(el, 'data-id'))); break;
    case 'generate-image': {
      if (!state.editorProposalId) break;
      state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
      const imgPrompt = (document.getElementById('editor-image-prompt') as HTMLTextAreaElement).value;
      if (!imgPrompt.trim()) { setState({ errorMsg: 'Escribe un prompt para generar la imagen.' }); break; }
      setState({ generatingImage: true, editorImagePrompt: imgPrompt });
      adminApi<{ cover_image_url: string }>('/api/content/generate-image', { method: 'POST', body: { proposal_id: state.editorProposalId, prompt: imgPrompt } })
        .then((res) => {
          if (state.editorDraft) state.editorDraft.cover_image_url = res.cover_image_url;
          setState({ generatingImage: false, successMsg: 'Imagen de portada generada.' });
        })
        .catch((err: ApiError) => { setState({ generatingImage: false, errorMsg: err.message }); });
      break;
    }
    case 'run-qa':
      if (!state.editorProposalId) break;
      setState({ qaBusy: true, qaResult: null });
      adminApi<QaResult>('/api/content/qa-check', { method: 'POST', body: { proposal_id: state.editorProposalId } })
        .then((res) => { setState({ qaBusy: false, qaResult: res }); })
        .catch((err: ApiError) => { setState({ qaBusy: false, errorMsg: err.message }); });
      break;
    case 'close-qa': setState({ qaResult: null }); break;
    case 'preview-nota': {
      if (!state.editorDraft) break;
      const previewFields = readEditorForm();
      state.editorDraft = Object.assign({}, state.editorDraft, previewFields) as EditorDraft;
      setState({ notaPreviewHtml: buildNotaPreviewDoc(previewFields) });
      break;
    }
    case 'close-nota-preview': setState({ notaPreviewHtml: null }); break;
    case 'generate-newsletter':
    case 'regenerate-newsletter':
      setState({ newsletterBusy: true, errorMsg: null });
      adminApi<NewsletterContent>('/api/newsletter/generate', { method: 'POST' })
        .then((content) => { setState({ newsletterBusy: false, newsletterContent: content, newsletterPreview: null, newsletterAudioUrl: null }); })
        .catch((err: ApiError) => { setState({ newsletterBusy: false, errorMsg: err.message }); });
      break;
    case 'preview-newsletter':
      adminApi<{ html: string }>('/api/newsletter/preview', { method: 'POST', body: readNewsletterForm() })
        .then((res) => { setState({ newsletterPreview: res.html, errorMsg: null }); })
        .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      break;
    case 'close-newsletter-preview': setState({ newsletterPreview: null }); break;
    case 'generate-newsletter-audio':
      setState({ newsletterAudioBusy: true, errorMsg: null });
      adminApiBlob('/api/newsletter/audio', { method: 'POST', body: readNewsletterForm() })
        .then((blob) => {
          setState({ newsletterAudioBusy: false, newsletterAudioUrl: URL.createObjectURL(blob) });
        })
        .catch((err: ApiError) => { setState({ newsletterAudioBusy: false, errorMsg: err.message }); });
      break;
    case 'send-newsletter':
      if (!confirm('¿Enviar el newsletter a todos los suscriptores activos? Esta acción no se puede deshacer.')) break;
      setState({ newsletterSending: true, errorMsg: null });
      adminApi('/api/newsletter/send', { method: 'POST', body: readNewsletterForm() })
        .then(() => {
          setState({ newsletterSending: false, newsletterContent: null, newsletterPreview: null, newsletterAudioUrl: null, successMsg: 'Newsletter enviado a los suscriptores.' });
        })
        .catch((err: ApiError) => { setState({ newsletterSending: false, errorMsg: err.message }); });
      break;
    case 'detect-radar':
      setState({ radarBusy: true });
      adminApi('/api/listening/topics/detect', { method: 'POST' })
        .then(() => adminApi<Topic[]>('/api/listening/topics'))
        .then((topics) => {
          setState({ radarBusy: false, data: Object.assign({}, state.data, { topics }) });
        })
        .catch((err: ApiError) => { setState({ radarBusy: false, errorMsg: err.message }); });
      break;
    case 'generate-proposal-from-topic': {
      const topicId = Number(attr(el, 'data-id'));
      const forceRisk = attr(el, 'data-force-risk') === '1';
      if (forceRisk) {
        const ok = window.confirm(
          'Este tema está en riesgo editorial alto (rumor, clickbait o fuente débil).\n\n¿Forzar generación de propuesta de todas formas?'
        );
        if (!ok) break;
      }
      const format = document.getElementById('proposal-format-' + topicId) as HTMLSelectElement | null;
      setState({ generatingProposal: true });
      const body: { topic_id: number; format: string; force?: boolean } = {
        topic_id: topicId,
        format: format ? format.value : 'nota',
      };
      if (forceRisk) body.force = true;
      adminApi<Proposal & { warnings?: string[] }>('/api/content/generate-proposal', { method: 'POST', body })
        .then((proposal) => {
          state.data.proposalsByKey = {};
          const warn = Array.isArray(proposal.warnings) && proposal.warnings.length
            ? ' — ' + proposal.warnings.join(' ')
            : '';
          setState({
            generatingProposal: false,
            selectedRadarId: null,
            successMsg: 'Propuesta creada: ' + proposal.title + warn,
          });
        })
        .catch((err: ApiError) => { setState({ generatingProposal: false, errorMsg: err.message }); });
      break;
    }
    case 'open-social-form': setState({ socialFormOpen: true, socialFormError: null }); break;
    case 'close-social-form': setState({ socialFormOpen: false, socialFormError: null, socialBusy: false }); break;
    case 'toggle-social': submitToggleSocial(Number(attr(el, 'data-id')), attr(el, 'data-pub') === 'true'); break;
    case 'refetch-social': submitRefetchSocial(Number(attr(el, 'data-id'))); break;
    case 'delete-social': submitDeleteSocial(Number(attr(el, 'data-id'))); break;
    case 'delete-newsletter-event': {
      const evId = Number(attr(el, 'data-id'));
      adminApi('/api/newsletter/events/' + evId, { method: 'DELETE' })
        .then(() => { setData({ newsletterEvents: (state.data.newsletterEvents || []).filter((ev: NewsletterEvent) => ev.id !== evId) }); })
        .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      break;
    }
    case 'save-sponsor-info': {
      const spId = Number(attr(el, 'data-id'));
      adminApi<Client>('/api/commercial/clients/' + spId, { method: 'PATCH', body: {
        website_url: (document.getElementById('sponsor-link-' + spId) as HTMLInputElement).value.trim(),
        sponsor_copy: (document.getElementById('sponsor-copy-' + spId) as HTMLInputElement).value.trim(),
      } })
        .then((updated) => {
          setData({ clients: (state.data.clients || []).map((c) => c.id === spId ? Object.assign({}, c, updated) : c) });
        })
        .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      break;
    }
    default: break;
  }
}

// ---------- write actions ----------

export function submitApproveProposal(id: number) {
  adminApi('/api/editorial/proposals/' + id + '/approve', { method: 'PATCH' })
    .then(() => {
      const list = state.data.proposalsByKey.propuesta.filter((p) => p.id !== id);
      const byKey = Object.assign({}, state.data.proposalsByKey, { propuesta: list, borrador: null });
      setData({ proposalsByKey: byKey });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitRejectProposal(id: number) {
  const textarea = document.getElementById('reject-reason-' + id) as HTMLTextAreaElement | null;
  const reason = textarea ? textarea.value.trim() : '';
  if (!reason) { if (textarea) textarea.focus(); setState({ errorMsg: 'Escribe un motivo antes de rechazar la propuesta.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/reject', { method: 'PATCH', body: { reason } })
    .then(() => {
      const list = state.data.proposalsByKey.propuesta.filter((p) => p.id !== id);
      setState({ propuestaRejecting: null, successMsg: 'Propuesta rechazada.' });
      setProposalsKey('propuesta', list);
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDraft(id: number, thenSubmitReview: boolean) {
  const body = readEditorForm();
  adminApi<Proposal>('/api/editorial/proposals/' + id + '/draft', { method: 'PATCH', body })
    .then((updated) => {
      if (!thenSubmitReview) {
        setState({ editorDraft: {
          title: updated.title || '', body: updated.body || '', section: updated.section || '', dek: updated.dek || '', slug: updated.slug || '',
          cover_image_url: updated.cover_image_url || '', author_name: updated.author_name || '',
          is_sponsored: Boolean(updated.is_sponsored), sponsor_name: updated.sponsor_name || '', image_prompt: updated.image_prompt || '',
        }, successMsg: 'Borrador guardado.' });
        return;
      }
      return adminApi('/api/editorial/proposals/' + id + '/submit-review', { method: 'PATCH' }).then(() => {
        state.editorProposalId = null;
        state.editorDraft = null;
        state.data.proposalsByKey = {};
        goTo('dashboard');
        setState({ successMsg: 'Nota enviada a revisión.' });
      });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitPublish(id: number) {
  const origin = state.transparency[id];
  adminApi('/api/editorial/proposals/' + id + '/publish', { method: 'PATCH', body: { origin } })
    .then(() => {
      const list = state.data.proposalsByKey.en_revision.filter((p) => p.id !== id);
      setProposalsKey('en_revision', list);
      setState({ successMsg: 'Nota publicada correctamente.' });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitReturn(id: number) {
  const comentarioText = (document.getElementById('comentario-text') as HTMLTextAreaElement | null)?.value || '';
  if (!comentarioText.trim()) { setState({ errorMsg: 'Escribe un comentario antes de regresar la nota.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/return', { method: 'PATCH', body: { comment: comentarioText } })
    .then(() => {
      const list = state.data.proposalsByKey.en_revision.filter((p) => p.id !== id);
      setState({ comentarioPieceId: null, comentarioText: '', successMsg: 'Nota regresada a borrador.' });
      setProposalsKey('en_revision', list);
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitAdvanceClient(id: number, nextStage: string) {
  adminApi<Client>('/api/commercial/clients/' + id, { method: 'PATCH', body: { pipeline_stage: nextStage } })
    .then((updated) => {
      const list = state.data.clients!.map((c) => c.id === id ? Object.assign({}, c, updated) : c);
      setData({ clients: list });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteService(id: number) {
  if (!confirm('¿Eliminar este paquete? Desaparece de servicios.html de inmediato. No se puede deshacer.')) return;
  adminApi('/api/commercial/services/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ services: (state.data.services || []).filter((s) => s.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteFbAccount(id: number) {
  if (!confirm('¿Eliminar esta cuenta de Facebook? Ya no se usará al escanear.')) return;
  adminApi('/api/listening/competitors/accounts/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ fbAccounts: (state.data.fbAccounts || []).filter((a) => a.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitToggleUser(id: number, active: boolean) {
  adminApi<AdminUser>('/api/auth/users/' + id, { method: 'PATCH', body: { active } })
    .then((updated) => {
      const list = state.data.users!.map((u) => u.id === id ? updated : u);
      setData({ users: list });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitToggleSocial(id: number, isPublished: boolean) {
  adminApi<SocialPost>('/api/admin/social/' + id, { method: 'PATCH', body: { is_published: isPublished } })
    .then((updated) => {
      const list = state.data.socialPosts!.map((p) => p.id === id ? Object.assign({}, p, updated) : p);
      setData({ socialPosts: list });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitRefetchSocial(id: number) {
  adminApi<SocialPost>('/api/admin/social/' + id, { method: 'PATCH', body: { refetch: true } })
    .then((updated) => {
      const list = state.data.socialPosts!.map((p) => p.id === id ? Object.assign({}, p, updated) : p);
      setData({ socialPosts: list });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteIdea(id: number) {
  if (!confirm('¿Eliminar esta idea? No se puede deshacer.')) return;
  adminApi('/api/editorial/ideas/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ ideas: (state.data.ideas || []).filter((i) => i.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteClient(id: number) {
  if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
  adminApi('/api/commercial/clients/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ clients: (state.data.clients || []).filter((c) => c.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDistribute(channel: string, proposalId: number) {
  setState({ distBusy: channel + ':' + proposalId });
  adminApi<{ share_url?: string }>('/api/distribution/' + channel, { method: 'POST', body: { proposal_id: proposalId } })
    .then((r) => {
      if (r && r.share_url) window.open(r.share_url, '_blank');
      setState({ distBusy: null, successMsg: 'Nota enviada a ' + channel + '.' });
    })
    .catch((err: ApiError) => { setState({ distBusy: null, errorMsg: err.message }); })
    .then(() => adminApi<DistLogEntry[]>('/api/distribution/log?limit=30'))
    .then((log) => { setData({ distLog: log }); })
    .catch(() => { /* best-effort */ });
}

export function submitMarkLead(id: number, status: string) {
  adminApi<Lead>('/api/commercial/leads/' + id, { method: 'PATCH', body: { status } })
    .then((updated) => {
      setData({ leads: (state.data.leads || []).map((l) => l.id === id ? updated : l) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitConvertLead(id: number) {
  adminApi<Client>('/api/commercial/leads/' + id + '/convert', { method: 'POST' })
    .then((client) => {
      state.data.clients = null;
      setData({ leads: (state.data.leads || []).map((l) => l.id === id ? Object.assign({}, l, { status: 'contactado' }) : l) });
      setState({ successMsg: 'Cliente creado en el pipeline: ' + client.name });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteLead(id: number) {
  if (!confirm('¿Eliminar este lead? No se puede deshacer.')) return;
  adminApi('/api/commercial/leads/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ leads: (state.data.leads || []).filter((l) => l.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitAnalyzeCompetitor(id: number) {
  adminApi<CompetitorPost>('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } })
    .then((updated) => {
      setData({ competitors: (state.data.competitors || []).map((p) => p.id === id ? updated : p) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteCompetitor(id: number) {
  if (!confirm('¿Eliminar esta publicación de competencia? No se puede deshacer.')) return;
  adminApi('/api/listening/competitors/' + id, { method: 'DELETE' })
    .then(() => {
      setData({ competitors: (state.data.competitors || []).filter((p) => p.id !== id) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitClearCompetitors() {
  const posts = state.data.competitors || [];
  if (!posts.length) return;
  if (!confirm('¿Eliminar las ' + posts.length + ' publicaciones de competencia? No se puede deshacer.')) return;
  Promise.all(posts.map((p: CompetitorPost) => adminApi('/api/listening/competitors/' + p.id, { method: 'DELETE' })))
    .then(() => { setData({ competitors: [] }); })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitCompetitorToIdea(id: number) {
  const post = (state.data.competitors || []).filter((p) => p.id === id)[0];
  if (!post) return;
  const title = (post.source_account ? post.source_account + ': ' : '') + String(post.post_text || 'publicación de competencia').slice(0, 120);
  const description = (post.post_text || '') + (post.post_url ? '\n\nFuente: ' + post.post_url : '');
  adminApi('/api/editorial/ideas', { method: 'POST', body: { title, category: 'Local', description } })
    .then(() => {
      state.data.ideas = null;
      setState({ successMsg: 'Idea creada en la bandeja.' });
      return adminApi<CompetitorPost>('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } });
    })
    .then((updated) => {
      if (updated) setData({ competitors: (state.data.competitors || []).map((p) => p.id === id ? updated : p) });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitApproveTopic(id: number) {
  adminApi('/api/listening/topics/' + id + '/approve', { method: 'PATCH' })
    .then(() => {
      const topics = (state.data.topics || []).map((t) => t.id === id ? Object.assign({}, t, { status: 'Revisado' }) : t);
      setData({ topics });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteTopic(id: number) {
  if (!confirm('¿Eliminar este tema detectado? No se puede deshacer.')) return;
  adminApi('/api/listening/topics/' + id, { method: 'DELETE' })
    .then(() => {
      const topics = (state.data.topics || []).filter((t) => t.id !== id);
      setData({ topics });
      if (state.selectedRadarId === id) setState({ selectedRadarId: null });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitClearTopics() {
  const topics = state.data.topics || [];
  if (!topics.length) return;
  if (!confirm('¿Eliminar los ' + topics.length + ' temas detectados? No se puede deshacer.')) return;
  Promise.all(topics.map((t: Topic) => adminApi('/api/listening/topics/' + t.id, { method: 'DELETE' })))
    .then(() => { setData({ topics: [] }); setState({ selectedRadarId: null }); })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteBorrador(id: number) {
  if (!confirm('¿Eliminar este borrador? Se borra también su imagen generada. No se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(() => {
      setProposalsKey('borrador', (state.data.proposalsByKey.borrador || []).filter((p) => p.id !== id));
      setState({ successMsg: 'Borrador eliminado.' });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitReopenPublished(id: number) {
  adminApi('/api/editorial/proposals/' + id + '/reopen', { method: 'PATCH' })
    .then(() => {
      state.data.proposalsByKey = {};
      goTo('editor', id);
      setState({ successMsg: 'Nota reabierta para edición.' });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeletePublished(id: number) {
  if (!confirm('¿Eliminar esta nota publicada? Se quita del sitio de forma permanente y no se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(() => {
      setProposalsKey('published', (state.data.proposalsByKey.published || []).filter((p) => p.id !== id));
      setState({ successMsg: 'Nota publicada eliminada.' });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteProposal(id: number) {
  if (!confirm('¿Eliminar esta propuesta rechazada? No se puede deshacer.')) return;
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(() => {
      setProposalsKey('rechazada', (state.data.proposalsByKey.rechazada || []).filter((p) => p.id !== id));
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitDeleteSocial(id: number) {
  if (!confirm('¿Borrar esta producción? No se puede deshacer.')) return;
  adminApi('/api/admin/social/' + id, { method: 'DELETE' })
    .then(() => {
      const list = state.data.socialPosts!.filter((p) => p.id !== id);
      setData({ socialPosts: list });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

// ---------- forms ----------

export function handleSubmit(e: SubmitEvent) {
  const form = (e.target as HTMLElement).closest('[data-action]') as HTMLFormElement | null;
  if (!form) return;
  const action = form.getAttribute('data-action');
  const q = <T extends HTMLElement = HTMLInputElement>(sel: string) => form.querySelector(sel) as T;

  if (action === 'submit-login') {
    e.preventDefault();
    login(q('#pl-email').value.trim(), q('#pl-pass').value);
  } else if (action === 'submit-idea') {
    e.preventDefault();
    const title = q('#idea-title').value.trim();
    if (!title) return;
    adminApi<Idea>('/api/editorial/ideas', { method: 'POST', body: {
      title, category: q<HTMLSelectElement>('#idea-cat').value, description: q<HTMLTextAreaElement>('#idea-desc').value.trim(),
    } }).then((created) => {
      form.reset();
      setState({ demoNote: 'idea' });
      setData({ ideas: (state.data.ideas || []).concat([Object.assign(created, { collaborator_name: state.user!.name })]) });
    }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (action === 'submit-new-user') {
    e.preventDefault();
    const nuPassword = q('#nu-password').value;
    const nuId = state.editingUserId;
    const nuBody: { name: string; email: string; role: string; password?: string } = {
      name: q('#nu-name').value.trim(),
      email: q('#nu-email').value.trim(),
      role: q<HTMLSelectElement>('#nu-role').value,
    };
    if (!nuId || nuPassword) nuBody.password = nuPassword;
    const nuReq = nuId
      ? adminApi<AdminUser>('/api/auth/users/' + nuId, { method: 'PATCH', body: nuBody })
      : adminApi<AdminUser>('/api/auth/users', { method: 'POST', body: nuBody });
    nuReq.then((saved) => {
      setState({ newUserOpen: false, newUserError: null, editingUserId: null });
      const list = nuId
        ? (state.data.users || []).map((u) => u.id === nuId ? saved : u)
        : (state.data.users || []).concat([saved]);
      setData({ users: list });
    }).catch((err: ApiError) => {
      setState({ newUserError: firstFieldError(err) });
    });
  } else if (action === 'submit-service') {
    e.preventDefault();
    const svBody = {
      name: q('#sv-name').value.trim(),
      price_label: q('#sv-price').value.trim(),
      description: q<HTMLTextAreaElement>('#sv-desc').value.trim(),
      cta_interest: q('#sv-interest').value.trim() || 'Otro',
      features: q<HTMLTextAreaElement>('#sv-features').value.split('\n').map((f) => f.trim()).filter(Boolean),
      sort_order: Number(q('#sv-order').value) || 0,
      active: q('#sv-active').checked,
    };
    const svId = state.editingServiceId;
    const req = svId
      ? adminApi<Service>('/api/commercial/services/' + svId, { method: 'PATCH', body: svBody })
      : adminApi<Service>('/api/commercial/services', { method: 'POST', body: svBody });
    req.then((saved) => {
      setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null });
      const list = svId
        ? (state.data.services || []).map((s) => s.id === svId ? saved : s)
        : (state.data.services || []).concat([saved]);
      setData({ services: list });
    }).catch((err: ApiError) => {
      setState({ serviceFormError: firstFieldError(err) });
    });
  } else if (action === 'submit-fb-account') {
    e.preventDefault();
    const fbaBody = {
      label: q('#fba-label').value.trim(),
      handle_or_url: q('#fba-handle').value.trim(),
      active: q('#fba-active').checked,
    };
    const fbaId = state.editingFbAccountId;
    const fbaReq = fbaId
      ? adminApi<FbAccount>('/api/listening/competitors/accounts/' + fbaId, { method: 'PATCH', body: fbaBody })
      : adminApi<FbAccount>('/api/listening/competitors/accounts', { method: 'POST', body: fbaBody });
    fbaReq.then((saved) => {
      setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null });
      const list = fbaId
        ? (state.data.fbAccounts || []).map((a) => a.id === fbaId ? saved : a)
        : (state.data.fbAccounts || []).concat([saved]);
      setData({ fbAccounts: list });
    }).catch((err: ApiError) => {
      setState({ fbAccountFormError: firstFieldError(err) });
    });
  } else if (action === 'submit-newsletter-settings') {
    e.preventDefault();
    adminApi<NewsletterSettings>('/api/newsletter/settings', { method: 'PATCH', body: {
      enabled: q('#nls-enabled').checked,
      send_hour: Number(q<HTMLSelectElement>('#nls-hour').value),
      send_minute: Number(q<HTMLSelectElement>('#nls-minute').value),
    } }).then((updated) => {
      setState({ errorMsg: null });
      setData({ newsletterSettings: updated });
    }).catch((err: ApiError) => {
      setState({ errorMsg: err.message });
    });
  } else if (action === 'submit-site-metrics') {
    e.preventDefault();
    adminApi<SiteMetrics>('/api/admin/site-metrics', { method: 'PATCH', body: {
      monthly_reach_label: q('#sm-reach').value.trim(),
      municipalities_count: Number(q('#sm-municipios').value),
      tercer_tiempo_listeners_label: q('#sm-listeners').value.trim(),
      audience_age_18_24_pct: Number(q('#sm-age-1').value),
      audience_age_25_44_pct: Number(q('#sm-age-2').value),
      audience_age_45_plus_pct: Number(q('#sm-age-3').value),
    } }).then((updated) => {
      setState({ errorMsg: null, successMsg: 'Métricas actualizadas.' });
      setData({ siteMetrics: updated });
    }).catch((err: ApiError) => {
      setState({ errorMsg: err.message });
    });
  } else if (action === 'submit-newsletter-event') {
    e.preventDefault();
    const formEv = getNewsletterEventForm();
    if (!formEv.evDate || !formEv.evTitle) return;
    adminApi<NewsletterEvent>('/api/newsletter/events', { method: 'POST', body: { event_date: formEv.evDate, title: formEv.evTitle } })
      .then((created) => {
        form.reset();
        setData({ newsletterEvents: (state.data.newsletterEvents || []).concat([created]) });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (action === 'submit-new-client') {
    e.preventDefault();
    const name = q('#nc-name').value.trim();
    if (!name) return;
    adminApi<Client>('/api/commercial/clients', { method: 'POST', body: {
      name,
      business_name: q('#nc-business').value.trim(),
      package: q<HTMLSelectElement>('#nc-package').value,
      phone: q('#nc-phone').value.trim(),
      email: q('#nc-email').value.trim(),
    } }).then((created) => {
      setState({ clientFormOpen: false, clientFormError: null });
      setData({ clients: (state.data.clients || []).concat([created]) });
    }).catch((err: ApiError) => {
      setState({ clientFormError: firstFieldError(err) });
    });
  } else if (action === 'submit-social') {
    e.preventDefault();
    const url = q('#social-url').value.trim();
    const pos = parseInt(q('#social-position').value, 10);
    if (!url) return;
    setState({ socialBusy: true, socialFormError: null });
    adminApi<SocialPost>('/api/admin/social', { method: 'POST', body: {
      external_url: url,
      position: isNaN(pos) ? 0 : pos,
    } }).then((created) => {
      setState({ socialFormOpen: false, socialBusy: false, socialFormError: null });
      setData({ socialPosts: (state.data.socialPosts || []).concat([created]) });
    }).catch((err: ApiError) => {
      setState({ socialBusy: false, socialFormError: (err.fields as Record<string, string> | undefined)?.external_url || err.message });
    });
  }
}

export function handleChange(e: Event) {
  const target = e.target as HTMLElement;
  if (target.getAttribute && target.getAttribute('data-action') === 'move-idea') {
    const id = Number(target.getAttribute('data-id'));
    adminApi<Idea>('/api/editorial/ideas/' + id, { method: 'PATCH', body: { column_status: (target as HTMLSelectElement).value } })
      .then((updated) => {
        const list = state.data.ideas!.map((i) => i.id === id ? Object.assign({}, i, updated) : i);
        setData({ ideas: list });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  }
}
