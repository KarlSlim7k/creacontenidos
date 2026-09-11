// CREA Panel Admin — acciones (submit/handle) y delegación de eventos por data-action.
import {
  state, setState, setData, adminApi, adminApiBlob, loadScreenData, mergeKey, setProposalsKey, isSoundMuted,
  loadRadarTopics, loadRadarSummary, loadRadarStats, loadRadarAnalysis, loadNewsletterCandidates, refreshCurrentScreen,
  type Screen, type ApiError, type EditorDraft, type Proposal, type Idea, type Client, type Lead, type Service,
  type AdminUser, type SocialPost, type FbAccount, type CompetitorPost, type Topic, type DistLogEntry, type RadarSource,
  type NewsletterEvent, type NewsletterSettings, type NewsletterContent, type SiteMetrics, type QaResult, type TrustedDevice,
  type EditChatHunk, type MyProfile, type EditorialSettings, type TwoFaSetup, type EditorialAnalysis,
} from './store';
import { TABLE_PAGE_SIZE, safeHttpUrl } from './util';
import { readEditorForm, buildNotaPreviewDoc } from './screens/editor';
import { readNewsletterForm } from './screens/hermes';
import { goTo, login, logout, verify2fa, loadNotifBadge, completeLogin, forgotPassword, resetPassword } from './auth';
import { promptPwaInstall, enablePushNotifications, disablePushNotifications } from './pwa';

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

// Un solo estado de formulario (ver State.form): abrir siempre limpia el error del
// formulario anterior y cerrar siempre lo limpia todo — antes cada uno de los cinco
// repetía su propio trío de campos y alguno se olvidaba (socialBusy quedaba colgado).
function openForm(kind: 'user' | 'service' | 'fbAccount' | 'client' | 'social', editingId: number | null = null) {
  setState({ form: { kind, editingId }, formError: null, socialBusy: false });
}

function closeForm() {
  setState({ form: null, formError: null, socialBusy: false });
}

// ---------- click delegation ----------

export function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  // Click fuera del panel de notificaciones (otra sección, otro botón, el fondo)
  // lo cierra. Se resuelve DESPUÉS del handler: setState re-renderiza, y algunos
  // handlers leen valores que solo viven en el DOM (el prompt de imagen, los
  // campos del newsletter) — cerrarlo antes los borraría.
  const closeNotifs = state.showNotifications && !target.closest('.padmin-bell-wrap');
  const el = target.closest('[data-action]');
  if (el) {
    const action = el.getAttribute('data-action') || '';
    // hasOwn: sin él, data-action="toString"/"constructor" resolvería contra
    // Object.prototype y llamaría a una función que no es un handler.
    if (Object.hasOwn(clickHandlers, action)) clickHandlers[action](el);
  }
  if (closeNotifs) setState({ showNotifications: false });
}

// R2-31/R2-33: si hay temas marcados, se manda la selección explícita
// (topic_id/section/analysis_id); sin ninguno marcado, el body va sin
// `selection` — mismo comportamiento de siempre (RADAR ordena por
// confidence+mentions, como ya hacía antes de esta fase).
function buildNewsletterSelectionPayload(): { selection: { topic_id: number; section: string; analysis_id: number | null }[] } | Record<string, never> {
  const entries = Object.entries(state.newsletterSelection);
  if (!entries.length) return {};
  return {
    selection: entries.map(([topicId, item]) => ({
      topic_id: Number(topicId),
      section: item.section,
      analysis_id: item.analysisId,
    })),
  };
}

function generateNewsletter() {
  setState({ newsletterBusy: true, errorMsg: null });
  adminApi<NewsletterContent>('/api/newsletter/generate', { method: 'POST', body: buildNewsletterSelectionPayload() })
    .then((content) => { setState({ newsletterBusy: false, newsletterContent: content, newsletterPreview: null, newsletterAudioUrl: null }); })
    .catch((err: ApiError) => { setState({ newsletterBusy: false, errorMsg: err.message }); });
}

// Mapa acción → handler: una acción nueva es una entrada aquí, no un case más.
// Las mutaciones con lógica propia viven en las funciones submit* de abajo.
const clickHandlers: Record<string, (el: Element) => void> = {
  'logout': () => logout(),
  'show-forgot-password': () => setState({ loginView: 'forgot', loginError: null }),
  'show-login': () => setState({ loginView: 'password', loginError: null }),
  // Manipulación de DOM directa, sin setState: ver el comentario sobre passwordField
  // en auth.ts — un re-render acá borraría lo que la persona ya tecleó.
  'toggle-password': (el) => {
    const targetId = attr(el, 'data-target');
    const input = document.getElementById(targetId) as HTMLInputElement | null;
    if (!input) return;
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    const showIcon = el.querySelector<HTMLElement>('[data-eye-show]');
    const hideIcon = el.querySelector<HTMLElement>('[data-eye-hide]');
    if (showIcon) showIcon.hidden = willShow;
    if (hideIcon) hideIcon.hidden = !willShow;
    el.setAttribute('aria-pressed', String(willShow));
    el.setAttribute('aria-label', willShow ? 'Ocultar contraseña' : 'Mostrar contraseña');
    el.setAttribute('title', willShow ? 'Ocultar contraseña' : 'Mostrar contraseña');
  },
  'install-pwa': () => promptPwaInstall(),
  'enable-push': () => {
    setState({ pushBusy: true, pushError: null });
    enablePushNotifications().then((result) => {
      if (result.ok) setState({ pushBusy: false, pushEnabled: true });
      else setState({ pushBusy: false, pushError: result.error || 'No se pudo activar.' });
    });
  },
  'disable-push': () => {
    setState({ pushBusy: true });
    disablePushNotifications().then(() => setState({ pushBusy: false, pushEnabled: false }));
  },
  'start-2fa-setup': () => {
    setState({ twoFaBusy: true, errorMsg: null });
    adminApi<TwoFaSetup>('/api/auth/2fa/setup', { method: 'POST' })
      .then((setup) => { setState({ twoFaBusy: false, twoFaSetup: setup }); })
      .catch((err: ApiError) => { setState({ twoFaBusy: false, errorMsg: err.message }); });
  },
  // Cancelar no pega al backend: el secret sin confirmar queda en DB pero no
  // autoriza nada (two_factor_enabled sigue false) — el próximo /2fa/setup lo pisa.
  'cancel-2fa-setup': () => setState({ twoFaSetup: null, errorMsg: null }),
  'dismiss-2fa-backup-codes': () => setState({ twoFaBackupCodes: null }),
  'goto': (el) => goTo(attr(el, 'data-id') as Screen, el.getAttribute('data-pid') ? Number(el.getAttribute('data-pid')) : null),
  'open-editor': (el) => goTo('editor', Number(attr(el, 'data-id'))),
  'close-editor': () => setState({
    editorProposalId: null, editorDraft: null,
    editChatMessages: [], editChatPending: [], editChatModel: null, editChatProvider: null,
    editChatUsesLeft: null, editChatError: null,
  }),
  'toggle-notifications': () => {
    const opening = !state.showNotifications;
    setState({ showNotifications: opening });
    if (opening) {
      try { localStorage.setItem('crea-admin-last-notif-seen', new Date().toISOString()); } catch { /* modo privado */ }
    }
  },
  'clear-notifications': () => {
    try { localStorage.setItem('crea-admin-last-notif-seen', new Date().toISOString()); } catch { /* modo privado */ }
    setData({ notifications: [] });
    setState({ successMsg: 'Notificaciones limpiadas.' });
  },
  'refresh-screen': () => {
    refreshCurrentScreen();
    loadNotifBadge(true);
  },
  'toggle-sound': () => {
    const muted = !isSoundMuted();
    try { localStorage.setItem('crea-admin-sound-muted', muted ? '1' : '0'); } catch { /* modo privado */ }
    setState({ soundMuted: muted });
  },
  'dismiss-toast': (el) => {
    if (el.getAttribute('data-kind') === 'error') setState({ errorMsg: null });
    else setState({ successMsg: null });
  },
  'set-radar-source': (el) => { setState({ radarSource: attr(el, 'data-value'), radarPage: 0 }); loadRadarTopics(true); },
  'set-radar-status': (el) => { setState({ radarStatus: attr(el, 'data-value'), radarPage: 0 }); loadRadarTopics(true); },
  'set-radar-verification': (el) => { setState({ radarVerification: attr(el, 'data-value'), radarPage: 0 }); loadRadarTopics(true); },
  'set-radar-confidence': (el) => { setState({ radarConfidenceFilter: attr(el, 'data-value'), radarPage: 0 }); },
  'clear-radar-search': () => { setState({ radarSearch: '', radarPage: 0 }); },
  'set-radar-competitor-sort': (el) => { setState({ radarCompetitorSort: attr(el, 'data-value') as 'fecha' | 'engagement', radarPage: 0 }); },
  'toggle-radar-select-all': (el) => {
    const checked = (el as HTMLInputElement).checked;
    const topics = state.data.topics || [];
    setState({ radarSelectedTopicIds: checked ? topics.map((t: Topic) => t.id) : [] });
  },
  'toggle-radar-topic-select': (el) => {
    const id = Number(attr(el, 'data-id'));
    if (!id) return;
    const current = state.radarSelectedTopicIds || [];
    const exists = current.includes(id);
    setState({ radarSelectedTopicIds: exists ? current.filter((x) => x !== id) : [...current, id] });
  },
  'batch-approve-topics': () => {
    const ids = state.radarSelectedTopicIds || [];
    if (!ids.length) return;
    adminApi<{ approved: number }>('/api/listening/topics/batch-approve', { method: 'POST', body: { ids } })
      .then((res) => {
        const topics = (state.data.topics || []).map((t: Topic) => ids.includes(t.id) ? Object.assign({}, t, { status: 'Revisado' }) : t);
        setData({ topics });
        setState({ radarSelectedTopicIds: [], successMsg: `${res.approved} tema(s) aprobados.` });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  // Motivo obligatorio (R2-07/R2-08): abre el modal en vez de eliminar directo.
  'batch-delete-topics': () => {
    const ids = state.radarSelectedTopicIds || [];
    if (!ids.length) return;
    setState({ discardTopicIds: ids });
  },
  'close-discard-topics': () => setState({ discardTopicIds: null }),
  'confirm-discard-topics': () => submitDiscardTopics(),
  // Paginación cliente (10 filas/página) sobre lo ya cargado. Si el tab activo
  // es temas y la página pedida cae fuera de lo cargado pero el servidor
  // puede tener más (radarTopicsHasMore), pide el siguiente lote de 50 antes
  // de avanzar — el render clampea la página mientras tanto.
  'set-radar-page': (el) => {
    const p = Math.max(0, Number(attr(el, 'data-value')) || 0);
    if (state.radarTab === 'temas' && state.radarTopicsHasMore) {
      const loaded = (state.data.topics || []).length;
      if ((p + 1) * TABLE_PAGE_SIZE > loaded) loadRadarTopics(false);
    }
    setState({ radarPage: p });
  },
  'refresh-radar': () => {
    loadRadarTopics(true);
    loadRadarSummary();
    loadRadarStats();
  },
  'retry-radar-stats': () => { setState({ radarStatsError: null }); loadRadarStats(); },
  'set-radar-stats-days': (el) => {
    const days = Number(attr(el, 'data-value')) || 30;
    setState({ radarStatsDays: days, radarStatsError: null });
    loadRadarStats();
  },
  'set-radar-tab': (el) => { setState({ radarTab: attr(el, 'data-tab') as 'temas' | 'manual' | 'competencia' | 'fuentes' }); loadScreenData('radar'); },
  'apply-radar-preset': (el) => {
    const topicInput = document.getElementById('rm-topic') as HTMLInputElement | null;
    const categorySelect = document.getElementById('rm-category') as HTMLSelectElement | null;
    if (topicInput) topicInput.value = attr(el, 'data-topic');
    if (categorySelect) categorySelect.value = attr(el, 'data-category');
  },
  'run-radar-manual': () => {
    const topic = (document.getElementById('rm-topic') as HTMLInputElement | null)?.value.trim() || '';
    if (!topic) {
      setState({ errorMsg: 'Por favor ingresa un tema o palabra clave para realizar el radar manual.' });
      return;
    }
    const zone = (document.getElementById('rm-zone') as HTMLSelectElement | null)?.value || 'Perote, Veracruz';
    const cat = (document.getElementById('rm-category') as HTMLSelectElement | null)?.value || 'general';
    const tf = (document.getElementById('rm-timeframe') as HTMLSelectElement | null)?.value || '24h';
    const specificSources = (document.getElementById('rm-sources') as HTMLInputElement | null)?.value.trim() || '';

    // Armar query contextualizado para Perplexity
    let queryParts = [`noticias, sucesos y novedades sobre "${topic}"`];

    if (cat !== 'general') {
      const catLabels: Record<string, string> = {
        seguridad: 'en materia de seguridad y protección civil',
        politica: 'en política local, cabildo y gobierno municipal',
        cultura: 'sobre eventos culturales, festivales y turismo',
        clima: 'sobre clima, medio ambiente y contingencias',
        economia: 'sobre comercio local, agricultura y economía',
      };
      queryParts.push(catLabels[cat] || `en el ámbito de ${cat}`);
    }

    queryParts.push(`en ${zone}, México`);

    const tfLabels: Record<string, string> = {
      '24h': 'ocurridas en las últimas 24 horas',
      '3d': 'ocurridas en los últimos 3 días',
      '7d': 'ocurridas en la última semana',
    };
    queryParts.push(tfLabels[tf] || '');

    if (specificSources) {
      queryParts.push(`consultando fuentes como: ${specificSources}`);
    }

    const fullQuery = queryParts.filter(Boolean).join(' ');

    setState({ radarBusy: true, errorMsg: null, radarManualResult: null });
    adminApi<{ detected: number; topics: Topic[] }>('/api/listening/topics/detect', {
      method: 'POST',
      body: { query: fullQuery },
    })
      .then((res) => {
        const foundTopics = Array.isArray(res.topics) ? res.topics : [];
        setState({
          radarBusy: false,
          radarManualResult: { detected: res.detected, count: foundTopics.length, topics: foundTopics },
          successMsg: res.detected > 0
            ? `Radar manual completado: ${res.detected} tema(s) nuevo(s) detectado(s).`
            : 'Radar manual completado: no se encontraron temas nuevos o ya estaban registrados.',
        });
        loadRadarTopics(true);
        loadRadarSummary();
        loadRadarStats();
      })
      .catch((err: ApiError) => {
        setState({ radarBusy: false, errorMsg: err.message });
      });
  },
  'set-pipeline-tab': (el) => { setState({ pipelineTab: attr(el, 'data-tab') as 'edicion' | 'programacion' | 'agenda' }); },
  'toggle-radar-source': (el) => {
    const id = Number(attr(el, 'data-id'));
    const active = attr(el, 'data-active') !== 'true';
    adminApi(`/api/listening/radar-sources/${id}`, { method: 'PATCH', body: { active } })
      .then(() => adminApi('/api/listening/radar-sources'))
      .then((rows) => { setData({ radarSources: rows as RadarSource[] }); })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'detect-competitors': () => {
    setState({ competitorsBusy: true });
    adminApi('/api/listening/competitors/detect', { method: 'POST' })
      .then(() => adminApi<CompetitorPost[]>('/api/listening/competitors'))
      .then((posts) => {
        state.data.competitors = posts;
        setState({ competitorsBusy: false, successMsg: 'Exploración de competencia completada.' });
      })
      .catch((err: ApiError) => { setState({ competitorsBusy: false, errorMsg: err.message }); });
  },
  'detect-competitors-fb': () => {
    setState({ competitorsBusy: true });
    adminApi('/api/listening/competitors/detect', { method: 'POST', body: { source: 'facebook' } })
      .then(() => adminApi<CompetitorPost[]>('/api/listening/competitors'))
      .then((posts) => {
        setState({ competitorsBusy: false, successMsg: 'Escaneo de Facebook completado.' });
        setData({ competitors: posts });
        loadRadarTopics(true);
        loadRadarSummary();
      })
      .catch((err: ApiError) => { setState({ competitorsBusy: false, errorMsg: err.message }); });
  },
  'analyze-competitor': (el) => submitAnalyzeCompetitor(Number(attr(el, 'data-id'))),
  'delete-competitor': (el) => submitDeleteCompetitor(Number(attr(el, 'data-id'))),
  'clear-competitors': () => {
    const n = (state.data.competitors || []).length;
    if (!n) return;
    setState({
      dangerConfirmError: null,
      dangerConfirm: {
        action: 'clear-competitors',
        title: 'Eliminar todas las publicaciones de competencia',
        body: `Se borran las ${n} publicaciones escaneadas. No se puede deshacer.`,
        phrase: 'ELIMINAR TODO',
      },
    });
  },
  'competitor-to-idea': (el) => submitCompetitorToIdea(Number(attr(el, 'data-id'))),
  'set-leads-status': (el) => setState({ leadsStatus: attr(el, 'data-value'), leadsPage: 0 }),
  'set-leads-page': (el) => setState({ leadsPage: Math.max(0, Number(attr(el, 'data-value')) || 0) }),
  'set-producciones-page': (el) => setState({ produccionesPage: Math.max(0, Number(attr(el, 'data-value')) || 0) }),
  'set-producciones-network': (el) => setState({ produccionesNetwork: attr(el, 'data-value'), produccionesPage: 0 }),
  'set-producciones-status': (el) => setState({ produccionesStatus: attr(el, 'data-value'), produccionesPage: 0 }),
  'clear-producciones-search': () => setState({ produccionesSearch: '', produccionesPage: 0 }),
  'move-produccion-pos': (el) => {
    const id = Number(attr(el, 'data-id'));
    const dir = attr(el, 'data-dir');
    const post = (state.data.socialPosts || []).find((p) => p.id === id);
    if (!post) return;
    const newPos = dir === 'up' ? Math.max(0, post.position - 1) : post.position + 1;
    adminApi<SocialPost>('/api/admin/social/' + id, { method: 'PATCH', body: { position: newPos } })
      .then((updated) => {
        const list = (state.data.socialPosts || []).map((p) => p.id === id ? Object.assign({}, p, updated) : p)
          .sort((a, b) => (b.is_published ? 1 : 0) - (a.is_published ? 1 : 0) || a.position - b.position || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        setData({ socialPosts: list });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'open-preview-social': (el) => {
    const id = Number(attr(el, 'data-id'));
    setState({ previewSocialId: id, previewSocialLoading: true, previewSocialEmbedHtml: null });
    adminApi<{ embed_html: string | null; fallback?: { thumbnail_url?: string; external_url?: string } }>('/api/public/social/' + id + '/embed')
      .then((res) => {
        setState({ previewSocialLoading: false, previewSocialEmbedHtml: res.embed_html || '' });
      })
      .catch((err: ApiError) => {
        setState({ previewSocialLoading: false, errorMsg: 'No se pudo cargar el reproductor: ' + err.message });
      });
  },
  'close-preview-social': () => setState({ previewSocialId: null, previewSocialEmbedHtml: null, previewSocialLoading: false }),
  'mark-lead': (el) => submitMarkLead(Number(attr(el, 'data-id')), attr(el, 'data-status')),
  'convert-lead': (el) => submitConvertLead(Number(attr(el, 'data-id'))),
  'delete-lead': (el) => submitDeleteLead(Number(attr(el, 'data-id'))),
  'open-radar': (el) => {
    const id = Number(attr(el, 'data-id'));
    setState({ selectedRadarId: id });
    loadRadarAnalysis(id);
  },
  'analyze-topic': (el) => submitAnalyzeTopic(Number(attr(el, 'data-id')), Number(attr(el, 'data-level')) as 1 | 2 | 3),
  'close-radar': () => setState({ selectedRadarId: null }),
  'approve-topic': (el) => submitApproveTopic(Number(attr(el, 'data-id'))),
  // Motivo obligatorio (R2-07/R2-08): abre el modal en vez de eliminar directo.
  'delete-topic': (el) => setState({ discardTopicIds: [Number(attr(el, 'data-id'))] }),
  'clear-topics': () => {
    const n = (state.data.topicSummary && state.data.topicSummary.total) || (state.data.topics || []).length;
    if (!n) return;
    setState({
      dangerConfirmError: null,
      dangerConfirm: {
        action: 'clear-topics',
        title: 'Eliminar todos los temas de RADAR',
        body: `Se borran los ${n} temas detectados, con su ficha de verificación y evidencia. No se puede deshacer.`,
        phrase: 'ELIMINAR TODO',
      },
    });
  },
  'close-danger-confirm': () => setState({ dangerConfirm: null, dangerConfirmError: null }),
  'confirm-danger': () => {
    const d = state.dangerConfirm;
    if (!d) return;
    const typed = ((document.getElementById('danger-confirm-input') as HTMLInputElement | null)?.value || '').trim();
    if (typed.toUpperCase() !== d.phrase.toUpperCase()) {
      setState({ dangerConfirmError: `El texto no coincide. Escribe exactamente «${d.phrase}».` });
      return;
    }
    setState({ dangerConfirm: null, dangerConfirmError: null });
    if (d.action === 'clear-topics') submitClearTopics();
    else if (d.action === 'clear-competitors') submitClearCompetitors();
  },
  'open-comentario': (el) => setState({ comentarioPieceId: Number(attr(el, 'data-id')), comentarioText: '' }),
  'close-comentario': () => setState({ comentarioPieceId: null, comentarioText: '' }),
  'confirm-comentario': (el) => submitReturn(Number(attr(el, 'data-id'))),
  'set-transparency': (el) => setState({ transparency: mergeKey(state.transparency, attr(el, 'data-piece'), attr(el, 'data-label')) }),
  'approve-piece': (el) => submitPublish(Number(attr(el, 'data-id'))),
  'distribute': (el) => submitDistribute(attr(el, 'data-channel'), Number(attr(el, 'data-id'))),
  'set-config-tab': (el) => { setState({ configTab: attr(el, 'data-tab') }); loadScreenData('configuracion'); },
  'approve-propuesta': (el) => submitApproveProposal(Number(attr(el, 'data-id'))),
  'start-reject-propuesta': (el) => setState({ propuestaRejecting: Number(attr(el, 'data-id')) }),
  'confirm-reject-propuesta': (el) => submitRejectProposal(Number(attr(el, 'data-id'))),
  'advance-client': (el) => submitAdvanceClient(Number(attr(el, 'data-id')), attr(el, 'data-stage')),
  'set-client-stage': (el) => {
    const id = Number(attr(el, 'data-id'));
    const stage = attr(el, 'data-stage');
    if (id && stage) submitAdvanceClient(id, stage);
  },
  'touch-client-contact': (el) => {
    const id = Number(attr(el, 'data-id'));
    if (!id) return;
    adminApi<Client>('/api/commercial/clients/' + id, { method: 'PATCH', body: {} })
      .then((updated) => {
        const list = (state.data.clients || []).map((c) => c.id === id ? Object.assign({}, c, updated) : c);
        setData({ clients: list });
        setState({ successMsg: 'Seguimiento registrado hoy.' });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'clear-comercial-search': () => setState({ comercialSearch: '' }),
  'copy-podcast-script': (el) => {
    const textarea = document.getElementById('nl-guion') as HTMLTextAreaElement | null;
    const text = textarea ? textarea.value : (state.newsletterContent?.guionPodcast || '');
    if (!text.trim()) { setState({ errorMsg: 'No hay guion de podcast para copiar.' }); return; }
    copyToClipboard(text, el as HTMLButtonElement);
    setState({ successMsg: 'Guion del podcast copiado al portapapeles.' });
  },
  'set-newsletter-preview-device': (el) => {
    setState({ newsletterPreviewDevice: attr(el, 'data-device') === 'mobile' ? 'mobile' : 'desktop' });
  },
  'delete-idea': (el) => submitDeleteIdea(Number(attr(el, 'data-id'))),
  'open-client-form': () => openForm('client'),
  'close-client-form': () => closeForm(),
  'delete-client': (el) => submitDeleteClient(Number(attr(el, 'data-id'))),
  'delete-propuesta': (el) => submitDeleteProposal(Number(attr(el, 'data-id'))),
  'save-draft': (el) => submitDraft(Number(attr(el, 'data-id')), false),
  'submit-review': (el) => submitDraft(Number(attr(el, 'data-id')), true),
  'open-new-user': () => openForm('user'),
  'open-edit-user': (el) => openForm('user', Number(attr(el, 'data-id'))),
  'close-new-user': () => closeForm(),
  'toggle-user-active': (el) => submitToggleUser(Number(attr(el, 'data-id')), attr(el, 'data-active') === 'true'),
  'open-new-service': () => openForm('service'),
  'edit-service': (el) => openForm('service', Number(attr(el, 'data-id'))),
  'close-service-form': () => closeForm(),
  'delete-service': (el) => submitDeleteService(Number(attr(el, 'data-id'))),
  'open-new-fb-account': () => openForm('fbAccount'),
  'edit-fb-account': (el) => openForm('fbAccount', Number(attr(el, 'data-id'))),
  'close-fb-account-form': () => closeForm(),
  'delete-fb-account': (el) => submitDeleteFbAccount(Number(attr(el, 'data-id'))),
  'generate-draft': () => {
    if (!state.editorProposalId) return;
    state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
    setState({ generatingDraft: true });
    adminApi<{ body: string }>('/api/content/generate-draft', { method: 'POST', body: { proposal_id: state.editorProposalId, editorial_directive: state.editorDraft.editorial_directive } })
      .then((res) => {
        if (state.editorDraft) state.editorDraft.body = res.body;
        setState({ generatingDraft: false });
      })
      .catch((err: ApiError) => { setState({ generatingDraft: false, errorMsg: err.message }); });
  },
  'preview-piece': (el) => {
    const ppid = Number(attr(el, 'data-id'));
    const ppLists = (state.data.proposalsByKey.borrador || []).concat(state.data.proposalsByKey.en_revision || []);
    const pp = ppLists.filter((p: Proposal) => p.id === ppid)[0];
    if (pp) setState({ pickerPreview: pp });
  },
  'close-picker-preview': () => setState({ pickerPreview: null }),
  'toggle-mobile-nav': () => setState({ mobileNavOpen: !state.mobileNavOpen }),
  'delete-borrador': (el) => submitDeleteBorrador(Number(attr(el, 'data-id'))),
  'reopen-published': (el) => submitReopenPublished(Number(attr(el, 'data-id'))),
  'open-delete-published': (el) => setState({ deletePublishedId: Number(attr(el, 'data-id')), deletePublishedError: null }),
  'close-delete-published': () => setState({ deletePublishedId: null, deletePublishedError: null }),
  'confirm-delete-published': (el) => submitDeletePublished(Number(attr(el, 'data-id'))),
  'copy-delete-title': (el) => copyToClipboard(attr(el, 'data-text'), el as HTMLButtonElement),
  'generate-image': () => {
    if (!state.editorProposalId) return;
    state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
    const imgPrompt = (document.getElementById('editor-image-prompt') as HTMLTextAreaElement).value;
    if (!imgPrompt.trim()) { setState({ errorMsg: 'Escribe un prompt para generar la imagen.' }); return; }
    setState({ generatingImage: true, editorImagePrompt: imgPrompt });
    adminApi<{ cover_image_url: string }>('/api/content/generate-image', { method: 'POST', body: { proposal_id: state.editorProposalId, prompt: imgPrompt } })
      .then((res) => {
        if (state.editorDraft) state.editorDraft.cover_image_url = res.cover_image_url;
        setState({ generatingImage: false, successMsg: 'Imagen de portada generada.' });
      })
      .catch((err: ApiError) => { setState({ generatingImage: false, errorMsg: err.message }); });
  },
  'suggest-slug': () => {
    if (!state.editorProposalId) return;
    const form = readEditorForm();
    state.editorDraft = Object.assign({}, state.editorDraft, form) as EditorDraft;
    setState({ suggestingSlug: true });
    adminApi<Proposal>('/api/editorial/proposals/' + state.editorProposalId + '/draft', { method: 'PATCH', body: Object.assign({}, form, { slug: '' }) })
      .then((updated) => {
        if (state.editorDraft) state.editorDraft.slug = updated.slug || '';
        setState({ suggestingSlug: false, successMsg: 'Slug recomendado generado.' });
      })
      .catch((err: ApiError) => { setState({ suggestingSlug: false, errorMsg: err.message }); });
  },
  'run-qa': () => {
    if (!state.editorProposalId) return;
    setState({ qaBusy: true, qaResult: null });
    adminApi<QaResult>('/api/content/qa-check', { method: 'POST', body: { proposal_id: state.editorProposalId } })
      .then((res) => { setState({ qaBusy: false, qaResult: res }); })
      .catch((err: ApiError) => { setState({ qaBusy: false, errorMsg: err.message }); });
  },
  'close-qa': () => setState({ qaResult: null }),
  'send-edit-chat': () => {
    if (!state.editorProposalId || !state.editorDraft) return;
    const input = document.getElementById('edit-chat-input') as HTMLTextAreaElement;
    const instruction = input.value.trim();
    if (!instruction) return;
    // Sincroniza el form antes de tocar setState: si no, el re-render de abajo pisa
    // cualquier campo que el encargado haya tocado a mano (mismo patrón que generate-image).
    state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
    const paragraphs = state.editorDraft.body.split(/\n\s*\n/).filter(Boolean);
    const history = state.editChatMessages.slice(-6);
    state.editChatMessages = state.editChatMessages.concat([{ role: 'user', content: instruction }]);
    setState({ editChatBusy: true, editChatError: null });
    adminApi<{ changes: { index: number; text: string }[]; note: string; model: string; provider: string; uses_left: number }>(
      '/api/content/edit-note',
      { method: 'POST', body: { proposal_id: state.editorProposalId, instruction, body: state.editorDraft.body, history } }
    ).then((res) => {
      const hunks: EditChatHunk[] = res.changes
        .filter((c) => c.index >= 0 && c.index < paragraphs.length)
        .map((c) => ({ index: c.index, original: paragraphs[c.index], suggested: c.text }));
      state.editChatMessages = state.editChatMessages.concat([{ role: 'assistant', content: res.note || `${hunks.length} párrafo(s) propuesto(s).` }]);
      setState({
        editChatBusy: false, editChatPending: hunks,
        editChatModel: res.model, editChatProvider: res.provider, editChatUsesLeft: res.uses_left,
      });
    }).catch((err: ApiError) => { setState({ editChatBusy: false, editChatError: err.message }); });
  },
  'accept-edit-hunk': (el) => {
    if (!state.editorDraft) return;
    const idx = Number(attr(el, 'data-index'));
    const hunk = state.editChatPending.find((h) => h.index === idx);
    state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
    if (hunk) {
      const paragraphs = state.editorDraft.body.split(/\n\s*\n/).filter(Boolean);
      if (idx < paragraphs.length) {
        paragraphs[idx] = hunk.suggested;
        state.editorDraft.body = paragraphs.join('\n\n');
      }
    }
    setState({ editChatPending: state.editChatPending.filter((h) => h.index !== idx) });
  },
  'reject-edit-hunk': (el) => {
    if (!state.editorDraft) return;
    state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
    const idx = Number(attr(el, 'data-index'));
    setState({ editChatPending: state.editChatPending.filter((h) => h.index !== idx) });
  },
  'preview-nota': () => {
    if (!state.editorDraft) return;
    const previewFields = readEditorForm();
    state.editorDraft = Object.assign({}, state.editorDraft, previewFields) as EditorDraft;
    setState({ notaPreviewHtml: buildNotaPreviewDoc(previewFields) });
  },
  'close-nota-preview': () => setState({ notaPreviewHtml: null }),
  'generate-newsletter': () => generateNewsletter(),
  'regenerate-newsletter': () => generateNewsletter(),
  'load-newsletter-candidates': () => loadNewsletterCandidates(),
  // R2-33: marcar/desmarcar un tema candidato. Al marcar, resuelve solo el
  // análisis nivel 3 más reciente del tema (si existe) — el editor lo ve
  // (hasLevel3), no escribe ningún id a mano.
  'toggle-newsletter-topic': (el) => {
    const id = Number(attr(el, 'data-id'));
    if (!id) return;
    const current = state.newsletterSelection[id];
    if (current) {
      const next = { ...state.newsletterSelection };
      delete next[id];
      setState({ newsletterSelection: next });
      return;
    }
    setState({ newsletterSelection: { ...state.newsletterSelection, [id]: { section: 'PEROTE', analysisId: null, hasLevel3: false } } });
    adminApi<EditorialAnalysis[]>(`/api/listening/topics/${id}/analysis`)
      .then((rows) => {
        const level3 = rows.find((a) => a.analysis_level === 3);
        const stillChecked = state.newsletterSelection[id];
        if (!level3 || !stillChecked) return; // se desmarcó mientras cargaba, o no hay nivel 3
        setState({ newsletterSelection: { ...state.newsletterSelection, [id]: { ...stillChecked, analysisId: level3.id, hasLevel3: true } } });
      })
      .catch(() => { /* sin análisis disponible: la selección sigue funcionando sin PARA ENTENDER */ });
  },
  'revert-newsletter': () => {
    if (!confirm('¿Descartar los cambios no guardados y restaurar la última versión guardada?')) return;
    setState({ newsletterBusy: true, errorMsg: null });
    adminApi<NewsletterContent | null>('/api/newsletter/pending')
      .then((content) => {
        setState({ newsletterBusy: false, newsletterContent: content, newsletterPreview: null, successMsg: 'Borrador restaurado.' });
      })
      .catch((err: ApiError) => { setState({ newsletterBusy: false, errorMsg: err.message }); });
  },
  'preview-newsletter': () => {
    adminApi<{ html: string }>('/api/newsletter/preview', { method: 'POST', body: readNewsletterForm() })
      .then((res) => { setState({ newsletterPreview: res.html, errorMsg: null }); })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'close-newsletter-preview': () => setState({ newsletterPreview: null }),
  // Leer el form ANTES de cualquier setState: setState repinta #app entero desde
  // state.newsletterContent, y ese repintado reemplaza los inputs (con sus valores
  // tecleados aún sin guardar) por otros nuevos con el valor viejo del state.
  // Leer después del setState captura ese valor viejo, no lo que el usuario escribió.
  'save-newsletter': () => {
    const body = readNewsletterForm();
    setState({ newsletterSaving: true, errorMsg: null });
    adminApi<NewsletterContent>('/api/newsletter/pending', { method: 'PATCH', body })
      .then((content) => { setState({ newsletterSaving: false, newsletterContent: content, successMsg: 'Cambios guardados.' }); })
      .catch((err: ApiError) => { setState({ newsletterSaving: false, errorMsg: err.message }); });
  },
  'generate-newsletter-audio': () => {
    const body = readNewsletterForm();
    setState({ newsletterAudioBusy: true, errorMsg: null });
    adminApiBlob('/api/newsletter/audio', { method: 'POST', body })
      .then((blob) => {
        setState({ newsletterAudioBusy: false, newsletterAudioUrl: URL.createObjectURL(blob) });
      })
      .catch((err: ApiError) => { setState({ newsletterAudioBusy: false, errorMsg: err.message }); });
  },
  'send-newsletter': () => {
    if (!confirm('¿Enviar el newsletter a todos los suscriptores activos? Esta acción no se puede deshacer.')) return;
    const body = readNewsletterForm();
    setState({ newsletterSending: true, errorMsg: null });
    adminApi('/api/newsletter/send', { method: 'POST', body })
      .then(() => {
        setState({ newsletterSending: false, newsletterContent: null, newsletterPreview: null, newsletterAudioUrl: null, successMsg: 'Newsletter enviado a los suscriptores.' });
      })
      .catch((err: ApiError) => { setState({ newsletterSending: false, errorMsg: err.message }); });
  },
  'detect-radar': () => {
    setState({ radarBusy: true });
    adminApi('/api/listening/topics/detect', { method: 'POST' })
      .then(() => {
        setState({ radarBusy: false, successMsg: 'Detección completada.' });
        loadRadarTopics(true);
        loadRadarSummary();
        loadRadarStats();
      })
      .catch((err: ApiError) => { setState({ radarBusy: false, errorMsg: err.message }); });
  },
  'generate-proposal-from-topic': (el) => {
    const topicId = Number(attr(el, 'data-id'));
    const forceRisk = attr(el, 'data-force-risk') === '1';
    if (forceRisk) {
      const ok = window.confirm(
        'Este tema está en riesgo editorial alto (rumor, clickbait o fuente débil).\n\n¿Forzar generación de propuesta de todas formas?'
      );
      if (!ok) return;
    }
    const format = document.getElementById('proposal-format-' + topicId) as HTMLSelectElement | null;
    const directive = document.getElementById('proposal-directive-' + topicId) as HTMLTextAreaElement | null;
    setState({ generatingProposal: true });
    const body: { topic_id: number; format: string; force?: boolean; editorial_directive?: string } = {
      topic_id: topicId,
      format: format ? format.value : 'nota',
    };
    if (forceRisk) body.force = true;
    if (directive && directive.value.trim()) body.editorial_directive = directive.value.trim();
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
  },
  'open-social-form': () => openForm('social'),
  'close-social-form': () => closeForm(),
  'toggle-social': (el) => submitToggleSocial(Number(attr(el, 'data-id')), attr(el, 'data-pub') === 'true'),
  'refetch-social': (el) => submitRefetchSocial(Number(attr(el, 'data-id'))),
  'delete-social': (el) => submitDeleteSocial(Number(attr(el, 'data-id'))),
  'sync-facebook-social': () => {
    setState({ socialSyncBusy: true, errorMsg: null });
    adminApi<{ inserted: number; skipped: number; posts: SocialPost[] }>('/api/admin/social/sync-facebook', { method: 'POST', body: { limit: 15 } })
      .then((res) => {
        setData({ socialPosts: res.posts || state.data.socialPosts });
        setState({
          socialSyncBusy: false,
          successMsg: res.inserted > 0
            ? `Sincronización completada: ${res.inserted} video(s) nuevo(s) importado(s).`
            : 'Sincronización completada: sin videos nuevos pendientes.',
        });
      })
      .catch((err: ApiError) => {
        setState({ socialSyncBusy: false, errorMsg: err.message });
      });
  },
  'delete-newsletter-event': (el) => {
    const evId = Number(attr(el, 'data-id'));
    adminApi('/api/newsletter/events/' + evId, { method: 'DELETE' })
      .then(() => { setData({ newsletterEvents: (state.data.newsletterEvents || []).filter((ev: NewsletterEvent) => ev.id !== evId) }); })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'revoke-trusted-device': (el) => {
    const devId = Number(attr(el, 'data-id'));
    adminApi('/api/auth/devices/' + devId, { method: 'DELETE' })
      .then(() => {
        setData({ trustedDevices: (state.data.trustedDevices || []).filter((d: TrustedDevice) => d.id !== devId) });
        setState({ successMsg: 'Dispositivo revocado.' });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'revoke-all-trusted-devices': () => {
    if (!confirm('¿Revocar todos los dispositivos confiables? Todos pedirán el código 2FA de nuevo en su próximo inicio de sesión.')) return;
    adminApi('/api/auth/devices', { method: 'DELETE' })
      .then(() => {
        setData({ trustedDevices: [] });
        setState({ successMsg: 'Todos los dispositivos fueron revocados.' });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
  'save-sponsor-info': (el) => {
    const spId = Number(attr(el, 'data-id'));
    adminApi<Client>('/api/commercial/clients/' + spId, { method: 'PATCH', body: {
      website_url: (document.getElementById('sponsor-link-' + spId) as HTMLInputElement).value.trim(),
      sponsor_copy: (document.getElementById('sponsor-copy-' + spId) as HTMLInputElement).value.trim(),
    } })
      .then((updated) => {
        setData({ clients: (state.data.clients || []).map((c) => c.id === spId ? Object.assign({}, c, updated) : c) });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  },
};

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
  const select = document.getElementById('reject-code-' + id) as HTMLSelectElement | null;
  const reason_code = select ? select.value : '';
  if (!reason_code) { if (select) select.focus(); setState({ errorMsg: 'Elige un motivo antes de rechazar la propuesta.' }); return; }
  const textarea = document.getElementById('reject-reason-' + id) as HTMLTextAreaElement | null;
  const reason = textarea ? textarea.value.trim() : '';
  if (!reason) { if (textarea) textarea.focus(); setState({ errorMsg: 'Escribe un motivo antes de rechazar la propuesta.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/reject', { method: 'PATCH', body: { reason, reason_code } })
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
          sensibilidad: updated.sensibilidad || null, editorial_directive: updated.editorial_directive || '',
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
  const reason_code = (document.getElementById('comentario-code') as HTMLSelectElement | null)?.value || '';
  if (!reason_code) { setState({ errorMsg: 'Elige un motivo antes de regresar la nota.' }); return; }
  const comentarioText = (document.getElementById('comentario-text') as HTMLTextAreaElement | null)?.value || '';
  if (!comentarioText.trim()) { setState({ errorMsg: 'Escribe un comentario antes de regresar la nota.' }); return; }
  adminApi('/api/editorial/proposals/' + id + '/return', { method: 'PATCH', body: { comment: comentarioText, reason_code } })
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
  const code = prompt('Ingresa tu código 2FA para confirmar este cambio:');
  if (!code) return;
  adminApi<AdminUser>('/api/auth/users/' + id, { method: 'PATCH', body: { active, code: code.trim() } })
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
      const shareUrl = safeHttpUrl(r && r.share_url);
      if (shareUrl) window.open(shareUrl, '_blank', 'noopener');
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

// La guarda vive en el modal de confirmación por frase (clickHandlers 'confirm-danger'),
// no aquí: un confirm() nativo era demasiado fácil de despachar sin leer.
export function submitClearCompetitors() {
  const posts = state.data.competitors || [];
  if (!posts.length) return;
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
  adminApi<Topic>('/api/listening/topics/' + id + '/approve', { method: 'PATCH' })
    .then((updated) => {
      const topics = (state.data.topics || []).map((t) => t.id === id ? updated : t);
      setData({ topics });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

// Motor Editorial CREA (R2-19…R2-21): dispara un análisis de nivel N. Siempre
// un clic humano explícito — docs/ia/motor-editorial-crea.md. Un nivel a la
// vez (radarAnalysisBusy) para no mandar dos clics del mismo botón en fila.
export function submitAnalyzeTopic(topicId: number, level: 1 | 2 | 3) {
  if (state.radarAnalysisBusy) return;
  setState({ radarAnalysisBusy: level });
  adminApi<EditorialAnalysis>(`/api/listening/topics/${topicId}/analyze`, { method: 'POST', body: { level } })
    .then(() => {
      setState({ radarAnalysisBusy: null, successMsg: `Análisis nivel ${level} generado.` });
      loadRadarAnalysis(topicId, true);
    })
    .catch((err: ApiError) => { setState({ radarAnalysisBusy: null, errorMsg: err.message }); });
}

// Descarte de tema(s) de RADAR con motivo obligatorio (R2-07/R2-08). Un solo
// id = DELETE individual; varios = POST batch-delete. Lee el <select> del
// modal directamente, como ya hace submitReturn/submitRejectProposal con sus
// textareas — el estado del formulario no vive en `state`.
export function submitDiscardTopics() {
  const ids = state.discardTopicIds || [];
  if (!ids.length) return;
  const reasonCode = (document.getElementById('discard-reason-code') as HTMLSelectElement | null)?.value || '';
  if (!reasonCode) { setState({ errorMsg: 'Elige un motivo antes de descartar.' }); return; }
  const request = ids.length === 1
    ? adminApi<null>('/api/listening/topics/' + ids[0], { method: 'DELETE', body: { reason_code: reasonCode } })
    : adminApi<{ deleted: number }>('/api/listening/topics/batch-delete', { method: 'POST', body: { ids, reason_code: reasonCode } });
  request
    .then(() => {
      const topics = (state.data.topics || []).filter((t) => !ids.includes(t.id));
      setData({ topics });
      setState({
        discardTopicIds: null,
        successMsg: ids.length === 1 ? 'Tema descartado.' : `${ids.length} tema(s) descartados.`,
        selectedRadarId: (state.selectedRadarId != null && ids.includes(state.selectedRadarId)) ? null : state.selectedRadarId,
        radarSelectedTopicIds: ids.length > 1 ? [] : state.radarSelectedTopicIds,
      });
      loadRadarSummary();
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function submitClearTopics() {
  const total = (state.data.topicSummary && state.data.topicSummary.total) || (state.data.topics || []).length;
  if (!total) return;
  adminApi('/api/listening/topics', { method: 'DELETE' })
    .then(() => {
      setState({ data: Object.assign({}, state.data, { topics: [] }), selectedRadarId: null, radarTopicsHasMore: false });
      loadRadarSummary();
      loadRadarStats();
    })
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

function copyToClipboard(text: string, btn: HTMLButtonElement) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copiado';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

export function submitDeletePublished(id: number) {
  const piece = (state.data.proposalsByKey.published || []).filter((p) => p.id === id)[0];
  if (!piece) return;
  const typed = (document.getElementById('delete-published-input') as HTMLInputElement | null)?.value || '';
  if (typed !== piece.title) {
    setState({ deletePublishedError: 'El título no coincide. Revísalo o usa el botón de copiar.' });
    return;
  }
  adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
    .then(() => {
      setProposalsKey('published', (state.data.proposalsByKey.published || []).filter((p) => p.id !== id));
      setState({ deletePublishedId: null, deletePublishedError: null, successMsg: 'Nota publicada eliminada.' });
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
  } else if (action === 'submit-2fa-verify') {
    e.preventDefault();
    verify2fa(q('#pl-2fa-code').value.trim(), q('#pl-2fa-remember').checked);
  } else if (action === 'submit-forgot-password') {
    e.preventDefault();
    forgotPassword(q('#pl-forgot-email').value.trim());
  } else if (action === 'submit-reset-password') {
    e.preventDefault();
    const password = q('#pl-reset-pass').value;
    const confirmation = q('#pl-reset-confirm');
    confirmation.setCustomValidity('');
    if (password !== confirmation.value) {
      confirmation.setCustomValidity('Las contraseñas no coinciden.');
      confirmation.reportValidity();
      return;
    }
    resetPassword(password);
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
    const nuId = state.form?.kind === 'user' ? state.form.editingId : null;
    const nuBody: { name: string; email: string; role: string; password?: string; code: string } = {
      name: q('#nu-name').value.trim(),
      email: q('#nu-email').value.trim(),
      role: q<HTMLSelectElement>('#nu-role').value,
      code: q('#nu-2fa-code').value.trim(),
    };
    if (!nuId || nuPassword) nuBody.password = nuPassword;
    const nuReq = nuId
      ? adminApi<AdminUser>('/api/auth/users/' + nuId, { method: 'PATCH', body: nuBody })
      : adminApi<AdminUser>('/api/auth/users', { method: 'POST', body: nuBody });
    nuReq.then((saved) => {
      closeForm();
      const list = nuId
        ? (state.data.users || []).map((u) => u.id === nuId ? saved : u)
        : (state.data.users || []).concat([saved]);
      setData({ users: list });
    }).catch((err: ApiError) => {
      setState({ formError: firstFieldError(err) });
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
    const svId = state.form?.kind === 'service' ? state.form.editingId : null;
    const req = svId
      ? adminApi<Service>('/api/commercial/services/' + svId, { method: 'PATCH', body: svBody })
      : adminApi<Service>('/api/commercial/services', { method: 'POST', body: svBody });
    req.then((saved) => {
      closeForm();
      const list = svId
        ? (state.data.services || []).map((s) => s.id === svId ? saved : s)
        : (state.data.services || []).concat([saved]);
      setData({ services: list });
    }).catch((err: ApiError) => {
      setState({ formError: firstFieldError(err) });
    });
  } else if (action === 'submit-fb-account') {
    e.preventDefault();
    const fbaBody = {
      label: q('#fba-label').value.trim(),
      handle_or_url: q('#fba-handle').value.trim(),
      active: q('#fba-active').checked,
    };
    const fbaId = state.form?.kind === 'fbAccount' ? state.form.editingId : null;
    const fbaReq = fbaId
      ? adminApi<FbAccount>('/api/listening/competitors/accounts/' + fbaId, { method: 'PATCH', body: fbaBody })
      : adminApi<FbAccount>('/api/listening/competitors/accounts', { method: 'POST', body: fbaBody });
    fbaReq.then((saved) => {
      closeForm();
      const list = fbaId
        ? (state.data.fbAccounts || []).map((a) => a.id === fbaId ? saved : a)
        : (state.data.fbAccounts || []).concat([saved]);
      setData({ fbAccounts: list });
    }).catch((err: ApiError) => {
      setState({ formError: firstFieldError(err) });
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
  } else if (action === 'submit-my-profile') {
    e.preventDefault();
    const pw = q('#me-password').value;
    const confirmation = q('#me-password-confirm');
    confirmation.setCustomValidity('');
    if (pw && pw !== confirmation.value) {
      confirmation.setCustomValidity('Las contraseñas nuevas no coinciden.');
      confirmation.reportValidity();
      return;
    }
    const me = state.data.myProfile!;
    const email = q('#me-email').value.trim();
    const credentialsChange = Boolean(pw) || email.toLowerCase() !== me.email.toLowerCase();
    adminApi<MyProfile>('/api/auth/me', { method: 'PATCH', body: {
      name: q('#me-name').value.trim(),
      ...(email.toLowerCase() !== me.email.toLowerCase() ? { email } : {}),
      ...(pw ? { password: pw } : {}),
      ...(credentialsChange ? {
        current_password: q('#me-current-password').value,
        code: (form.querySelector('#me-2fa-code') as HTMLInputElement | null)?.value.trim() || undefined,
      } : {}),
    } }).then((updated) => {
      setState({ errorMsg: null, successMsg: 'Perfil actualizado.' });
      // Cambiar la contraseña revoca los dispositivos confiables en el servidor
      // (ver PATCH /api/auth/me) — reflejarlo acá sin esperar a otro fetch.
      setData({ myProfile: updated, ...(pw ? { trustedDevices: [] } : {}) });
    }).catch((err: ApiError) => {
      setState({ errorMsg: err.message });
    });
  } else if (action === 'submit-2fa-enable') {
    e.preventDefault();
    setState({ twoFaBusy: true, errorMsg: null });
    adminApi<{ backup_codes: string[] }>('/api/auth/2fa/enable', { method: 'POST', body: { code: q('#tfa-enable-code').value.trim() } })
      .then((res) => {
        setState({ twoFaBusy: false, twoFaSetup: null, twoFaBackupCodes: res.backup_codes, errorMsg: null });
        setData({ myProfile: state.data.myProfile ? Object.assign({}, state.data.myProfile, { two_factor_enabled: true }) : null });
        if (state.requiresTwoFaSetup) completeLogin();
      })
      .catch((err: ApiError) => { setState({ twoFaBusy: false, errorMsg: err.message }); });
  } else if (action === 'submit-2fa-disable') {
    e.preventDefault();
    setState({ twoFaBusy: true, errorMsg: null });
    adminApi<{ ok: boolean }>('/api/auth/2fa/disable', { method: 'POST', body: { code: q('#tfa-disable-code').value.trim() } })
      .then(() => {
        setState({ twoFaBusy: false, errorMsg: null, successMsg: 'Verificación en dos pasos desactivada.' });
        // El servidor ya revocó todos los dispositivos confiables al desactivar (ver
        // POST /api/auth/2fa/disable) — reflejarlo acá sin esperar a otro fetch.
        setData({ myProfile: state.data.myProfile ? Object.assign({}, state.data.myProfile, { two_factor_enabled: false }) : null, trustedDevices: [] });
      })
      .catch((err: ApiError) => { setState({ twoFaBusy: false, errorMsg: err.message }); });
  } else if (action === 'submit-editorial-settings') {
    e.preventDefault();
    adminApi<EditorialSettings>('/api/admin/editorial-settings', { method: 'PATCH', body: {
      default_directive: q<HTMLTextAreaElement>('#es-directive').value.trim(),
    } }).then((updated) => {
      setState({ errorMsg: null, successMsg: 'Directriz editorial actualizada.' });
      setData({ editorialSettings: updated });
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
      closeForm();
      setData({ clients: (state.data.clients || []).concat([created]) });
    }).catch((err: ApiError) => {
      setState({ formError: firstFieldError(err) });
    });
  } else if (action === 'run-radar-manual') {
    // El submit real (botón data-action="run-radar-manual" es type="button") solo
    // dispara al presionar Enter en un input del form — evita el reload de página.
    e.preventDefault();
  } else if (action === 'submit-social') {
    e.preventDefault();
    const url = q('#social-url').value.trim();
    const pos = parseInt(q('#social-position').value, 10);
    if (!url) return;
    setState({ socialBusy: true, formError: null });
    adminApi<SocialPost>('/api/admin/social', { method: 'POST', body: {
      external_url: url,
      position: isNaN(pos) ? 0 : pos,
    } }).then((created) => {
      closeForm();
      setData({ socialPosts: (state.data.socialPosts || []).concat([created]) });
    }).catch((err: ApiError) => {
      setState({ socialBusy: false, formError: (err.fields as Record<string, string> | undefined)?.external_url || err.message });
    });
  }
}

// El título/cuerpo/metadatos de la nota vivían SOLO en el DOM hasta que algo llamaba
// readEditorForm() (guardar, generar borrador, chat IA). Cualquier re-render intermedio
// los repintaba desde el último editorDraft sincronizado — y se perdía lo escrito.
// Sincroniza en cada tecla y SIN setState: el DOM ya tiene el valor bueno, repintar sobra.
export function handleInput(e: Event) {
  const t = e.target as HTMLElement;
  if (t && t.id === 'radar-search-input') {
    state.radarSearch = (t as HTMLInputElement).value;
    setState({ radarSearch: state.radarSearch, radarPage: 0 });
    return;
  }
  if (t && t.id === 'comercial-search-input') {
    state.comercialSearch = (t as HTMLInputElement).value;
    setState({ comercialSearch: state.comercialSearch });
    return;
  }
  if (t && t.id === 'producciones-search-input') {
    state.produccionesSearch = (t as HTMLInputElement).value;
    setState({ produccionesSearch: state.produccionesSearch, produccionesPage: 0 });
    return;
  }
  if (t && t.id === 'social-url') {
    const val = (t as HTMLInputElement).value.trim();
    const badgeEl = document.getElementById('social-detected-network');
    if (badgeEl) {
      let net = '';
      if (/tiktok\.com/i.test(val)) net = 'TikTok';
      else if (/youtu(\.be|be\.com)/i.test(val)) net = 'YouTube';
      else if (/facebook\.com|fb\.watch/i.test(val)) net = 'Facebook';
      else if (/instagram\.com/i.test(val)) net = 'Instagram';
      badgeEl.textContent = net ? `Red detectada: ${net}` : '';
      badgeEl.style.display = net ? 'inline-block' : 'none';
    }
    return;
  }
  if (!state.editorDraft || !t.id || t.id.indexOf('editor-') !== 0) return;
  if (t.id === 'editor-image-prompt') { state.editorImagePrompt = (t as HTMLTextAreaElement).value; return; }
  state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm()) as EditorDraft;
}

export function handleChange(e: Event) {
  const target = e.target as HTMLElement;
  if (target.id === 'radar-source-select') {
    const val = (target as HTMLSelectElement).value;
    setState({ radarSource: val, radarPage: 0 });
    loadRadarTopics(true);
    return;
  }
  if (target.id === 'editor-cover') {
    const img = document.getElementById('editor-cover-thumb') as HTMLImageElement | null;
    const url = safeHttpUrl((target as HTMLInputElement).value);
    if (img) { img.src = url; img.style.display = url ? 'block' : 'none'; }
  } else if (target.id === 'editor-skip-image') {
    const block = document.getElementById('editor-ia-image-block');
    if (block) block.style.display = (target as HTMLInputElement).checked ? 'none' : '';
  } else if (target.id === 'editor-sponsored') {
    const field = document.getElementById('editor-sponsor-name-field');
    if (field) field.style.display = (target as HTMLInputElement).checked ? '' : 'none';
  } else if (target.getAttribute && target.getAttribute('data-action') === 'set-newsletter-section') {
    const id = Number(target.getAttribute('data-id'));
    const current = state.newsletterSelection[id];
    if (!current) return;
    setState({ newsletterSelection: { ...state.newsletterSelection, [id]: { ...current, section: (target as HTMLSelectElement).value } } });
  } else if (target.getAttribute && target.getAttribute('data-action') === 'move-idea') {
    const id = Number(target.getAttribute('data-id'));
    adminApi<Idea>('/api/editorial/ideas/' + id, { method: 'PATCH', body: { column_status: (target as HTMLSelectElement).value } })
      .then((updated) => {
        const list = state.data.ideas!.map((i) => i.id === id ? Object.assign({}, i, updated) : i);
        setData({ ideas: list });
      })
      .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  }
}

export function handleMediaError(e: Event) {
  const target = e.target as HTMLElement;
  if (target.getAttribute('data-image-error') === 'invisible') target.style.visibility = 'hidden';
  else if (target.getAttribute('data-image-error') === 'hide') target.style.display = 'none';
}
