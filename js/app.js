/* La Melodia della Memoria — PWA di ascolto (prototipo). */
(function () {
  'use strict';

  var TRACK_SRC = 'media/melodia_della_memoria_15min_192k.mp3';
  var TRACK_DURATION_SECONDS = 900;
  var STORAGE_CAL = 'lmdm_pwa_v1_calendario';
  var STORAGE_EMAIL = 'lmdm_pwa_v1_email';
  var STORAGE_TOKEN = 'lmdm_pwa_v1_token';
  var STORAGE_VERIFICATO = 'lmdm_pwa_v1_verificato_il';
  var ACCESSO_VALIDO_MS = 30 * 24 * 60 * 60 * 1000;
  var CALENDAR_DAYS = 28;
  var SETT_LABELS = [
    'Settimana 1',
    'Settimana 2',
    'Settimana 3',
    'Settimana 4'
  ];

  var audio = document.getElementById('traccia');
  var vistaAccesso = document.getElementById('vista-accesso');
  var vistaApp = document.getElementById('vista-app');
  var formAccesso = document.getElementById('form-accesso');
  var inputEmail = document.getElementById('campo-email');
  var erroreAccesso = document.getElementById('errore-accesso');
  var leadAccesso = document.querySelector('#vista-accesso .lead');
  var formCodice = document.getElementById('form-codice');
  var vistaCodice = document.getElementById('vista-codice');
  var inputCodice = document.getElementById('campo-codice');
  var erroreCodice = document.getElementById('errore-codice');
  var btnReinvia = document.getElementById('btn-reinvia');
  var timerReinvia = document.getElementById('timer-reinvia');
  var emailInCorso = '';
  var reinviaTimer = null;
  var btnPlay = document.getElementById('btn-play');
  var iconaPlay = document.getElementById('icona-play');
  var iconaPausa = document.getElementById('icona-pausa');
  var barra = document.getElementById('barra');
  var barraFill = document.getElementById('barra-fill');
  var barraThumb = document.getElementById('barra-thumb');
  var tempoCorrente = document.getElementById('tempo-corrente');
  var tempoRimanente = document.getElementById('tempo-rimanente');
  var durataEtichetta = document.getElementById('durata-etichetta');
  var calGriglia = document.getElementById('cal-griglia');
  var calConta = document.getElementById('cal-conta');
  var btnSegna = document.getElementById('btn-segna');
  var foglio = document.getElementById('foglio-oggi');
  var foglioTesto = document.getElementById('foglio-testo');
  var btnFoglioSegna = document.getElementById('btn-foglio-segna');
  var btnFoglioChiudi = document.getElementById('btn-foglio-chiudi');

  var durataReale = TRACK_DURATION_SECONDS;
  var seeking = false;
  var audioCached = false;
  var calStato = { segnati: {}, selezionato: 1 };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmt(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
  }
  function oggiISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + pad(m) + '-' + pad(day);
  }
  function durataAttuale() {
    var d = audio && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : durataReale;
    return d;
  }

  /* -------- Accesso -------- */
  /* Copywriter: rivedere i messaggi di errore e i testi del codice. */
  var MESSAGGI_ACCESSO = {
    email: "Inserisci un'email valida.",
    rete: "Non siamo riusciti a inviare il codice. Controlla la connessione e riprova.",
    codice_formato: "Inserisci le 6 cifre del codice.",
    codice_errato: "Il codice non è corretto. Prova di nuovo.",
    codice_scaduto: "Il codice è scaduto. Richiedine uno nuovo.",
    nessun_acquisto: "Non troviamo un acquisto con questa email.",
    troppi_tentativi: "Hai provato troppe volte, per sicurezza facciamo una pausa. Riprova tra un poco, o richiedi un codice nuovo.",
    link_scaduto: "Questo link è scaduto. Inserisci l'email usata per l'acquisto e ti inviamo un codice nuovo.",
    reinvia_attesa: "Puoi reinviare il codice tra {n} s.",
    lead_codice: "Ti abbiamo inviato un codice a 6 cifre all'email usata per l'acquisto.",
    lead_reale: "Ti inviamo un codice a 6 cifre all'email usata per l'acquisto."
  };

  function accessoErrore(chiave) {
    return MESSAGGI_ACCESSO[chiave] || MESSAGGI_ACCESSO.rete;
  }
  function cfgAccesso() {
    return (typeof accessoConfig === 'function') ? accessoConfig() : { mock: true };
  }
  function emailSalvata() {
    try { return localStorage.getItem(STORAGE_EMAIL) || ''; } catch (e) { return ''; }
  }
  function salvaEmail(email) {
    try { localStorage.setItem(STORAGE_EMAIL, email); } catch (e) {}
  }
  function tokenSalvato() {
    try { return localStorage.getItem(STORAGE_TOKEN) || ''; } catch (e) { return ''; }
  }
  function salvaToken(token) {
    try {
      if (token) localStorage.setItem(STORAGE_TOKEN, token);
      else localStorage.removeItem(STORAGE_TOKEN);
    } catch (e) {}
  }
  function pulisciSessione() {
    try {
      localStorage.removeItem(STORAGE_EMAIL);
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_VERIFICATO);
    } catch (e) {}
    emailInCorso = '';
  }
  function verificatoIlSalvato() {
    try { return localStorage.getItem(STORAGE_VERIFICATO) || ''; } catch (e) { return ''; }
  }
  function salvaVerificatoIl(iso) {
    try {
      if (iso) localStorage.setItem(STORAGE_VERIFICATO, String(iso));
      else localStorage.removeItem(STORAGE_VERIFICATO);
    } catch (e) {}
  }
  function dentroTrentaGiorni() {
    var raw = verificatoIlSalvato();
    if (!raw) return false;
    var t = Date.parse(raw);
    if (!Number.isFinite(t)) return false;
    return (Date.now() - t) <= ACCESSO_VALIDO_MS;
  }
  function limparHashAccesso() {
    try {
      var limpa = location.pathname + location.search;
      if (location.hash) history.replaceState(null, '', limpa);
    } catch (e) {}
  }
  function valorHashAccesso() {
    var hash = '';
    try { hash = String(location.hash || ''); } catch (e) {}
    if (hash.indexOf('#accesso=') !== 0) return null;
    var valor = hash.slice('#accesso='.length);
    try { valor = decodeURIComponent(valor); } catch (e) {}
    return valor;
  }
  function mostraAccesso() {
    vistaAccesso.classList.add('is-on');
    vistaApp.classList.remove('is-on');
  }
  function mostraApp() {
    vistaAccesso.classList.remove('is-on');
    vistaApp.classList.add('is-on');
  }
  function mostraFormEmail() {
    if (formAccesso) formAccesso.hidden = false;
    if (vistaCodice) vistaCodice.hidden = true;
    if (erroreAccesso) erroreAccesso.textContent = '';
  }
  function mostraFormCodice(email) {
    if (formAccesso) formAccesso.hidden = true;
    if (vistaCodice) vistaCodice.hidden = false;
    if (erroreCodice) erroreCodice.textContent = '';
    if (inputCodice) {
      inputCodice.value = '';
      inputCodice.focus();
    }
    avviaTimerReinvia();
  }
  function fermaTimerReinvia() {
    if (reinviaTimer) {
      clearInterval(reinviaTimer);
      reinviaTimer = null;
    }
  }
  function avviaTimerReinvia() {
    fermaTimerReinvia();
    var resto = Math.ceil((typeof accessoCooldownMs === 'function' ? accessoCooldownMs() : 60000) / 1000);
    if (btnReinvia) btnReinvia.disabled = true;
    function tick() {
      if (resto > 0) {
        if (timerReinvia) timerReinvia.textContent = MESSAGGI_ACCESSO.reinvia_attesa.replace('{n}', String(resto));
        resto -= 1;
      } else {
        fermaTimerReinvia();
        if (btnReinvia) btnReinvia.disabled = false;
        if (timerReinvia) timerReinvia.textContent = '';
      }
    }
    tick();
    reinviaTimer = setInterval(tick, 1000);
  }
  function entraNellApp(email, token) {
    fermaTimerReinvia();
    if (email) salvaEmail(email);
    if (token) salvaToken(token);
    if (!verificatoIlSalvato()) salvaVerificatoIl(new Date().toISOString());
    mostraApp();
    vaiTab('sessioni');
  }
  function sessioneValida() {
    if (cfgAccesso().mock) return !!emailSalvata();
    if (!tokenSalvato()) return false;
    return dentroTrentaGiorni();
  }
  function applicareStato(token) {
    if (typeof verificareStato !== 'function') {
      if (dentroTrentaGiorni()) mostraApp();
      else { mostraAccesso(); mostraFormEmail(); }
      return Promise.resolve();
    }
    return verificareStato(token).then(function (r) {
      if (r && r.revoked) {
        pulisciSessione();
        mostraAccesso();
        mostraFormEmail();
        return;
      }
      if (r && r.ok && !r.offline) {
        salvaVerificatoIl(r.verificato_il || new Date().toISOString());
        mostraApp();
        return;
      }
      /* Erro de rede ou offline: nunca derruba o acesso.
         Sem checagem recente (30 dias), volta so a tela de entrada, sem apagar o token. */
      if (dentroTrentaGiorni() || (r && r.offline && dentroTrentaGiorni())) {
        mostraApp();
        return;
      }
      if (r && (r.errore === 'rete' || r.offline) && tokenSalvato() && dentroTrentaGiorni()) {
        mostraApp();
        return;
      }
      if (r && r.errore === 'rete' && tokenSalvato() && !verificatoIlSalvato()) {
        /* Link magico recem-aberto, stato falhou a rede: nao derruba. */
        mostraApp();
        return;
      }
      mostraAccesso();
      mostraFormEmail();
    });
  }
  function avvioAccesso() {
    if (cfgAccesso().mock) {
      if (sessioneValida()) mostraApp();
      else { mostraAccesso(); mostraFormEmail(); }
      return;
    }
    var hashVal = valorHashAccesso();
    if (hashVal !== null) limparHashAccesso();
    if (hashVal === 'scaduto') {
      mostraAccesso();
      mostraFormEmail();
      if (erroreAccesso) erroreAccesso.textContent = accessoErrore('link_scaduto');
      return;
    }
    if (hashVal) {
      salvaToken(hashVal);
      var online = true;
      try { online = navigator.onLine !== false; } catch (e) {}
      if (!online) {
        if (dentroTrentaGiorni()) mostraApp();
        else mostraApp(); /* token recem-chegado do link; rede indisponivel nao derruba */
        return;
      }
      applicareStato(hashVal);
      return;
    }
    if (!tokenSalvato()) {
      mostraAccesso();
      mostraFormEmail();
      return;
    }
    var online2 = true;
    try { online2 = navigator.onLine !== false; } catch (e) {}
    if (!online2) {
      if (dentroTrentaGiorni()) mostraApp();
      else { mostraAccesso(); mostraFormEmail(); }
      return;
    }
    applicareStato(tokenSalvato());
  }

  if (!cfgAccesso().mock && leadAccesso) {
    leadAccesso.textContent = MESSAGGI_ACCESSO.lead_reale;
  }

  formAccesso.addEventListener('submit', function (ev) {
    ev.preventDefault();
    erroreAccesso.textContent = '';
    var valore = inputEmail.value;
    verificarAcesso(valore).then(function (r) {
      if (!r.ok) {
        erroreAccesso.textContent = accessoErrore(r.errore === 'email' ? 'email' : (r.errore || 'rete'));
        if (r.errore === 'email') inputEmail.focus();
        return;
      }
      if (cfgAccesso().mock || r.mock) {
        entraNellApp(r.email, '');
        return;
      }
      emailInCorso = r.email;
      mostraFormCodice(r.email);
    });
  });

  if (formCodice) {
    formCodice.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (erroreCodice) erroreCodice.textContent = '';
      verificareCodice(emailInCorso || inputEmail.value, inputCodice.value).then(function (r) {
        if (!r.ok) {
          if (erroreCodice) erroreCodice.textContent = accessoErrore(r.errore);
          if (inputCodice) inputCodice.focus();
          return;
        }
        entraNellApp(r.email, r.token);
      });
    });
    inputCodice.addEventListener('input', function () {
      var v = String(inputCodice.value || '').replace(/\D/g, '').slice(0, 6);
      if (inputCodice.value !== v) inputCodice.value = v;
    });
  }
  if (btnReinvia) {
    btnReinvia.addEventListener('click', function () {
      if (btnReinvia.disabled) return;
      if (erroreCodice) erroreCodice.textContent = '';
      pedirCodice(emailInCorso || inputEmail.value).then(function (r) {
        if (!r.ok) {
          if (erroreCodice) erroreCodice.textContent = accessoErrore(r.errore || 'rete');
          return;
        }
        avviaTimerReinvia();
      });
    });
  }

  /* -------- Tab -------- */
  function vaiTab(nome) {
    document.querySelectorAll('[data-schermo]').forEach(function (el) {
      el.hidden = el.getAttribute('data-schermo') !== nome;
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === nome;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      vaiTab(t.getAttribute('data-tab'));
    });
  });

  /* -------- Player -------- */
  function aggiornaPlayUi() {
    var playing = audio && !audio.paused && !audio.ended;
    btnPlay.setAttribute('aria-label', playing ? 'Pausa' : 'Riproduci');
    btnPlay.classList.toggle('is-playing', !!playing);
    iconaPlay.hidden = playing;
    iconaPausa.hidden = !playing;
  }

  function aggiornaBarra() {
    var dur = durataAttuale();
    var cur = (audio && Number.isFinite(audio.currentTime)) ? audio.currentTime : 0;
    var p = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
    barraFill.style.width = p + '%';
    barraThumb.style.left = p + '%';
    tempoCorrente.textContent = fmt(cur);
    tempoRimanente.textContent = '-' + fmt(Math.max(0, dur - cur));
  }

  function cercaA(clientX) {
    var rect = barra.getBoundingClientRect();
    var p = rect.width ? (clientX - rect.left) / rect.width : 0;
    p = Math.min(1, Math.max(0, p));
    var dur = durataAttuale();
    if (audio && dur > 0) audio.currentTime = p * dur;
    aggiornaBarra();
    aggiornaMediaSession();
  }

  function cacheAudioDopoPlay() {
    if (audioCached || !('caches' in window)) return;
    caches.open('lmdm-pwa-v1').then(function (c) {
      return c.add(new Request(TRACK_SRC, { cache: 'reload' }));
    }).then(function () {
      audioCached = true;
    }).catch(function () {});
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'La Melodia della Memoria',
        artist: 'Benessere Ogni Giorno',
        album: '15 minuti',
        artwork: [
          { src: new URL('img/artwork.webp', location.href).href, sizes: '512x512', type: 'image/webp' },
          { src: new URL('icons-marca/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.setActionHandler('play', function () { play(); });
      navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
      navigator.mediaSession.setActionHandler('seekto', function (d) {
        if (d && typeof d.seekTime === 'number' && audio) {
          audio.currentTime = d.seekTime;
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', function (d) {
        if (audio) audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', function (d) {
        if (audio) audio.currentTime = Math.min(durataAttuale(), audio.currentTime + ((d && d.seekOffset) || 10));
      });
    } catch (e) {}
    aggiornaMediaSession();
  }

  function aggiornaMediaSession() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      navigator.mediaSession.playbackState = (audio && !audio.paused) ? 'playing' : 'paused';
      navigator.mediaSession.setPositionState({
        duration: durataAttuale(),
        playbackRate: 1,
        position: audio ? audio.currentTime : 0
      });
    } catch (e) {}
  }

  function play() {
    if (!audio) return Promise.resolve();
    if (!audio.getAttribute('src')) {
      audio.src = TRACK_SRC;
    }
    var p = audio.play();
    cacheAudioDopoPlay();
    setupMediaSession();
    return p && p.catch ? p.catch(function () {}) : Promise.resolve();
  }

  btnPlay.addEventListener('click', function () {
    if (!audio) return;
    if (audio.paused || audio.ended) play();
    else audio.pause();
  });

  audio.addEventListener('play', function () { aggiornaPlayUi(); aggiornaMediaSession(); });
  audio.addEventListener('pause', function () { aggiornaPlayUi(); aggiornaMediaSession(); });
  audio.addEventListener('timeupdate', function () {
    if (!seeking) aggiornaBarra();
    aggiornaMediaSession();
  });
  audio.addEventListener('loadedmetadata', function () {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durataReale = audio.duration;
      durataEtichetta.textContent = fmt(audio.duration);
    }
    aggiornaBarra();
  });
  audio.addEventListener('ended', function () {
    aggiornaPlayUi();
    aggiornaBarra();
    proponiSegnoOggi();
  });

  barra.addEventListener('pointerdown', function (ev) {
    seeking = true;
    barra.setPointerCapture(ev.pointerId);
    cercaA(ev.clientX);
  });
  barra.addEventListener('pointermove', function (ev) {
    if (seeking) cercaA(ev.clientX);
  });
  function fineSeek(ev) {
    if (!seeking) return;
    seeking = false;
    try { barra.releasePointerCapture(ev.pointerId); } catch (e) {}
  }
  barra.addEventListener('pointerup', fineSeek);
  barra.addEventListener('pointercancel', fineSeek);
  barra.addEventListener('keydown', function (ev) {
    var step = ev.shiftKey ? 15 : 5;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      audio.currentTime = Math.min(durataAttuale(), (audio.currentTime || 0) + step);
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      audio.currentTime = Math.max(0, (audio.currentTime || 0) - step);
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      audio.currentTime = 0;
    } else if (ev.key === 'End') {
      ev.preventDefault();
      audio.currentTime = durataAttuale();
    } else if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      btnPlay.click();
    }
    aggiornaBarra();
  });

  /* -------- Calendario -------- */
  function caricaCal() {
    try {
      var raw = localStorage.getItem(STORAGE_CAL);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        calStato.segnati = d.segnati && typeof d.segnati === 'object' ? d.segnati : {};
        var sel = Number(d.selezionato);
        calStato.selezionato = (sel >= 1 && sel <= CALENDAR_DAYS) ? sel : primoLibero() || 1;
      }
    } catch (e) {}
  }
  function salvaCal() {
    try {
      localStorage.setItem(STORAGE_CAL, JSON.stringify({
        segnati: calStato.segnati,
        selezionato: calStato.selezionato
      }));
    } catch (e) {}
  }
  function contaSegnati() {
    return Object.keys(calStato.segnati).filter(function (k) {
      return calStato.segnati[k];
    }).length;
  }
  function primoLibero() {
    for (var i = 1; i <= CALENDAR_DAYS; i++) {
      if (!calStato.segnati[String(i)]) return i;
    }
    return null;
  }
  function giornoSegnatoOggi() {
    var oggi = oggiISO();
    return Object.keys(calStato.segnati).some(function (k) {
      return String(calStato.segnati[k]).slice(0, 10) === oggi;
    });
  }

  function renderCal() {
    calGriglia.textContent = '';
    for (var w = 0; w < 4; w++) {
      var wrap = document.createElement('div');
      wrap.className = 'settimana';
      var lab = document.createElement('p');
      lab.className = 'settimana-label';
      lab.textContent = SETT_LABELS[w];
      var grid = document.createElement('div');
      grid.className = 'giorni';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', SETT_LABELS[w]);
      for (var i = 1; i <= 7; i++) {
        var n = w * 7 + i;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'giorno';
        btn.textContent = String(n);
        btn.setAttribute('data-giorno', String(n));
        btn.setAttribute('aria-label', 'Giorno ' + n);
        var fatto = !!calStato.segnati[String(n)];
        var sel = calStato.selezionato === n;
        if (fatto) btn.classList.add('is-fatto');
        if (sel) btn.classList.add('is-sel');
        btn.setAttribute('aria-pressed', fatto ? 'true' : 'false');
        btn.addEventListener('click', (function (num) {
          return function () {
            calStato.selezionato = num;
            salvaCal();
            renderCal();
          };
        })(n));
        grid.appendChild(btn);
      }
      wrap.appendChild(lab);
      wrap.appendChild(grid);
      calGriglia.appendChild(wrap);
    }
    var nSeg = contaSegnati();
    calConta.textContent = nSeg + (nSeg === 1 ? ' giorno ascoltato' : ' giorni ascoltati');
    aggiornaBottoneSegna();
  }

  function aggiornaBottoneSegna() {
    var n = calStato.selezionato;
    var fatto = !!calStato.segnati[String(n)];
    btnSegna.textContent = fatto ? 'Togli il segno' : 'Segna come fatto';
    btnSegna.setAttribute('aria-label', fatto
      ? 'Togli il segno dal giorno ' + n
      : 'Segna il giorno ' + n + ' come fatto');
  }

  function toggleGiorno(n, forzaSegna) {
    var key = String(n);
    if (forzaSegna) {
      calStato.segnati[key] = oggiISO();
    } else if (calStato.segnati[key]) {
      delete calStato.segnati[key];
    } else {
      calStato.segnati[key] = oggiISO();
    }
    calStato.selezionato = n;
    salvaCal();
    renderCal();
  }

  btnSegna.addEventListener('click', function () {
    toggleGiorno(calStato.selezionato, false);
  });

  function proponiSegnoOggi() {
    if (giornoSegnatoOggi()) return;
    var prossimo = primoLibero();
    if (!prossimo) return;
    calStato.selezionato = prossimo;
    salvaCal();
    renderCal();
    foglioTesto.textContent = 'Hai finito i 15 minuti. Vuoi segnare il Giorno ' + prossimo + '?';
    foglio.hidden = false;
    btnFoglioSegna.focus();
  }
  btnFoglioSegna.addEventListener('click', function () {
    var n = calStato.selezionato || primoLibero();
    if (n) toggleGiorno(n, true);
    foglio.hidden = true;
    vaiTab('calendario');
  });
  btnFoglioChiudi.addEventListener('click', function () {
    foglio.hidden = true;
  });
  foglio.addEventListener('click', function (ev) {
    if (ev.target === foglio) foglio.hidden = true;
  });

  /* -------- Avvio -------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  caricaCal();
  if (!calStato.selezionato) calStato.selezionato = primoLibero() || 1;
  renderCal();
  aggiornaBarra();
  aggiornaPlayUi();
  durataEtichetta.textContent = fmt(TRACK_DURATION_SECONDS);

  avvioAccesso();
})();
