const Sentry = require('@sentry/node');

const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 3,
};

function cleanUrl(value) {
  const raw = String(value || '');
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
    const url = new URL(raw, 'http://sentry.local');
    return absolute ? `${url.protocol}//${url.host}${url.pathname}` : url.pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0];
  }
}

function cleanText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s<>"']+/gi, cleanUrl)
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function sanitizeEvent(event) {
  delete event.user;
  delete event.extra;
  delete event.tags;
  delete event.contexts;
  delete event.breadcrumbs;
  delete event.fingerprint;

  if (event.request) {
    event.request = {
      method: event.request.method,
      url: cleanUrl(event.request.url),
    };
  }
  if (event.message) event.message = cleanText(event.message);
  if (event.transaction) event.transaction = String(event.transaction).split(/[?#]/, 1)[0].slice(0, 200);
  if (event.logentry) {
    if (event.logentry.message) event.logentry.message = cleanText(event.logentry.message);
    if (event.logentry.formatted) event.logentry.formatted = cleanText(event.logentry.formatted);
    delete event.logentry.params;
  }
  for (const exception of (event.exception && event.exception.values) || []) {
    if (exception.value) exception.value = cleanText(exception.value);
    if (exception.mechanism) delete exception.mechanism.data;
  }
  return event;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV || 'development',
  dataCollection: DATA_COLLECTION,
  tracesSampleRate: 0,
  enableLogs: false,
  maxBreadcrumbs: 0,
  beforeSend: sanitizeEvent,
});

module.exports = { Sentry, DATA_COLLECTION, cleanText, cleanUrl, sanitizeEvent };
