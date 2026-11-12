/* Ponto de integracao do acesso - La Melodia della Memoria (PWA).
   ACESSO_MOCK=true: qualquer e-mail valido libera a entrada (prototipo).
   Quando a flag estiver false, o fluxo real pede um codice di 6 cifre
   all'API (POST /acesso/codigo e POST /acesso/verificar) e guarda o
   token em lmdm_pwa_v1_token. GET /acesso/stato so roda online, devolve tambem verificato_il,
   e nao bloqueia o uso offline. O link do e-mail (#accesso=<token>
   ou #accesso=scaduto) e tratado no app.js. Um codice novo anula o anterior.

   Nenhum dado alem do e-mail (e do codice, no fluxo real) e coletado
   nesta tela. Os testes podem sobrescrever ACESSO_MOCK e API_BASE com
   window.LMDM_ACESSO_MOCK e window.LMDM_API_BASE.

   TODO (Checkout / Boss): desligar ACESSO_MOCK quando o backend
   (webhook Hotmart) estiver no ar.
*/

var ACESSO_MOCK = true;
var API_BASE = 'https://api.lamelodiadellamemoria.com';

function accessoConfig() {
  var mock = ACESSO_MOCK;
  var base = API_BASE;
  try {
    if (typeof window !== 'undefined') {
      if (window.LMDM_ACESSO_MOCK === true) mock = true;
      if (window.LMDM_ACESSO_MOCK === false) mock = false;
      if (typeof window.LMDM_API_BASE === 'string' && window.LMDM_API_BASE) {
        base = window.LMDM_API_BASE;
      }
    }
  } catch (e) {}
  return { mock: mock, apiBase: String(base || '').replace(/\/$/, '') };
}

function accessoCooldownMs() {
  try {
    if (typeof window !== 'undefined' && Number(window.LMDM_CODICE_COOLDOWN_MS) > 0) {
      return Number(window.LMDM_CODICE_COOLDOWN_MS);
    }
  } catch (e) {}
  return 60000;
}

function emailValida(valore) {
  var s = String(valore || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function accessoJson(path, opts) {
  var cfg = accessoConfig();
  var url = cfg.apiBase + path;
  var headers = { Accept: 'application/json' };
  opts = opts || {};
  if (opts.headers) {
    Object.keys(opts.headers).forEach(function (k) {
      headers[k] = opts.headers[k];
    });
  }
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(url, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (res) {
    return res.text().then(function (txt) {
      var data = {};
      if (txt) {
        try { data = JSON.parse(txt); } catch (e) { data = {}; }
      }
      return { status: res.status, data: data };
    });
  });
}

/* Mock: qualquer e-mail valido libera. Fluxo real: so valida o formato;
   o passo seguinte e pedirCodice. */
function verificarAcesso(email) {
  var normale = String(email || '').trim().toLowerCase();
  if (!emailValida(normale)) {
    return Promise.resolve({ ok: false, errore: 'email' });
  }
  if (accessoConfig().mock) {
    return Promise.resolve({ ok: true, email: normale, mock: true });
  }
  return pedirCodice(normale);
}

function pedirCodice(email) {
  var normale = String(email || '').trim().toLowerCase();
  if (!emailValida(normale)) {
    return Promise.resolve({ ok: false, errore: 'email' });
  }
  if (accessoConfig().mock) {
    return Promise.resolve({ ok: true, email: normale, mock: true });
  }
  return accessoJson('/acesso/codigo', { method: 'POST', body: { email: normale } })
    .then(function (r) {
      if (r.status === 200 && r.data && r.data.ok) {
        return { ok: true, email: normale };
      }
      return { ok: false, errore: 'rete' };
    })
    .catch(function () {
      return { ok: false, errore: 'rete' };
    });
}

function verificareCodice(email, codice) {
  var normale = String(email || '').trim().toLowerCase();
  var code = String(codice || '').replace(/\D/g, '');
  if (!emailValida(normale)) {
    return Promise.resolve({ ok: false, errore: 'email' });
  }
  if (!/^\d{6}$/.test(code)) {
    return Promise.resolve({ ok: false, errore: 'codice_formato' });
  }
  if (accessoConfig().mock) {
    return Promise.resolve({
      ok: true,
      email: normale,
      token: 'mock',
      scade_il: '',
      livelli: ['app']
    });
  }
  return accessoJson('/acesso/verificar', {
    method: 'POST',
    body: { email: normale, codice: code }
  }).then(function (r) {
    var d = r.data || {};
    if (r.status === 200 && d.ok && d.token) {
      return {
        ok: true,
        email: normale,
        token: d.token,
        scade_il: d.scade_il,
        livelli: d.livelli || []
      };
    }
    var err = d.errore;
    if (!err) {
      if (r.status === 401) err = 'codice_errato';
      else if (r.status === 403) err = 'nessun_acquisto';
      else if (r.status === 429) err = 'troppi_tentativi';
      else err = 'rete';
    }
    return { ok: false, errore: err, status: r.status };
  }).catch(function () {
    return { ok: false, errore: 'rete' };
  });
}

/* Online: confere se o token ainda vale (ex.: reembolso). Offline: nao bloqueia. */
function verificareStato(token) {
  if (!token) return Promise.resolve({ ok: false, errore: 'token' });
  if (accessoConfig().mock) {
    return Promise.resolve({ ok: true, livelli: ['app'], mock: true });
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.resolve({ ok: true, offline: true });
    }
  } catch (e) {}
  return accessoJson('/acesso/stato', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  }).then(function (r) {
    var d = r.data || {};
    if (r.status === 200 && d.ok) {
      return {
        ok: true,
        livelli: d.livelli || [],
        verificato_il: d.verificato_il || new Date().toISOString()
      };
    }
    if (r.status === 401) {
      return { ok: false, revoked: true, errore: 'revocato' };
    }
    return { ok: false, errore: 'rete' };
  }).catch(function () {
    return { ok: false, errore: 'rete' };
  });
}
