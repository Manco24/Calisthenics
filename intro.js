/**
 * Animazione d'entrata "Kalós · Sthénos" di CaliTrack.
 * - Mostrata automaticamente alla prima apertura della sessione (sessionStorage).
 * - Si può riprodurre in qualsiasi momento premendo "Tracker allenamenti" in cima alla Home
 *   oppure chiamando window.returnHomeWithIntro().
 * - Un tocco/click o i tasti Invio/Esc/Spazio la saltano istantaneamente.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'calitrack_intro_seen_v1';
  var DURATION_MS = 2650; // 2.15s animazione + 0.5s di tenuta a schermo completo prima dell'uscita
  var REDUCED_DURATION_MS = 1200;
  var EXIT_MS = 650;
  var CASCADE_MS = 1000;

  var overlayTemplate = null;

  function safeSetSeen() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* storage non disponibile */ }
  }

  // Cattura il template dell'overlay prima che venga rimosso dal DOM
  function captureTemplate() {
    if (overlayTemplate) return;
    var el = document.getElementById('cali-intro-overlay');
    if (el) {
      overlayTemplate = el.cloneNode(true);
      overlayTemplate.classList.remove('is-exiting');
    }
  }

  /**
   * Esegue l'animazione d'entrata su un elemento overlay (esistente o clonato).
   */
  function runIntro(overlay) {
    if (!overlay) return;
    var root = document.documentElement;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var closed = false;
    var autoTimer = null;

    root.classList.remove('cali-intro-seen');
    root.classList.add('cali-intro-playing');
    document.body.classList.remove('cali-intro-cascade');

    function onKey(event) {
      if (event.key === 'Enter' || event.key === 'Escape' || event.key === ' ') finishIntro();
    }

    function finishIntro() {
      if (closed) return;
      closed = true;
      clearTimeout(autoTimer);
      document.removeEventListener('keydown', onKey);
      safeSetSeen();

      overlay.classList.add('is-exiting');
      root.classList.remove('cali-intro-playing');
      document.body.classList.add('cali-intro-cascade');

      try {
        window.dispatchEvent(new CustomEvent('calitrack:intro-done'));
      } catch (e) {}

      setTimeout(function () {
        overlay.remove();
        root.classList.add('cali-intro-seen');
      }, EXIT_MS);

      // Rimuove la classe a cascata conclusa
      setTimeout(function () {
        document.body.classList.remove('cali-intro-cascade');
      }, EXIT_MS + CASCADE_MS);
    }

    overlay.addEventListener('pointerdown', finishIntro, { once: true });
    document.addEventListener('keydown', onKey);
    autoTimer = setTimeout(finishIntro, reduced ? REDUCED_DURATION_MS : DURATION_MS);
  }

  /**
   * Avvia l'intro al primo caricamento della pagina (se non ancora vista).
   */
  function initFirstLoad() {
    captureTemplate();
    var root = document.documentElement;
    var overlay = document.getElementById('cali-intro-overlay');
    if (!overlay) return;

    var forceSkip = false;
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('intro') === '0') forceSkip = true;
    } catch (e) {}

    if (forceSkip || root.classList.contains('cali-intro-seen') || sessionStorage.getItem(SESSION_KEY) === '1') {
      root.classList.add('cali-intro-seen');
      overlay.remove();
      try {
        window.dispatchEvent(new CustomEvent('calitrack:intro-done'));
      } catch (e) {}
      return;
    }

    runIntro(overlay);
  }

  /**
   * Torna alla Home e riproduce l'animazione di entrata "Kalós · Sthénos"
   * senza ricaricare la pagina (in-memory DOM reset pulito e fluido).
   */
  window.returnHomeWithIntro = function () {
    var root = document.documentElement;
    if (root.classList.contains('cali-intro-playing')) return;

    // Porta l'utente sulla schermata "menu" (Home) se era su una scheda o sottomenu
    if (typeof window.showScreen === 'function') {
      try { window.showScreen('menu'); } catch (e) {}
    } else if (typeof window.activateScreen === 'function') {
      try { window.activateScreen('menu'); } catch (e) {}
    } else {
      var menu = document.getElementById('menu');
      if (menu) {
        document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
        menu.classList.add('active');
      }
    }

    // Scroll in cima
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }

    // Rimuove eventuali overlay orfani
    var existing = document.getElementById('cali-intro-overlay');
    if (existing) existing.remove();

    captureTemplate();
    if (!overlayTemplate) return;

    var newOverlay = overlayTemplate.cloneNode(true);
    newOverlay.classList.remove('is-exiting');
    document.body.insertBefore(newOverlay, document.body.firstChild);

    // Feedback aptico se disponibile
    if ('vibrate' in navigator) {
      try { navigator.vibrate(12); } catch (e) {}
    }

    runIntro(newOverlay);
  };

  window.playCaliTrackIntro = window.returnHomeWithIntro;

  window.replayCaliTrackIntro = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    window.returnHomeWithIntro();
  };

  // Collega l'evento click e tastiera sul titolo "Tracker allenamenti"
  function attachTitleListener() {
    var titleEl = document.querySelector('.app-title');
    if (!titleEl) return;
    titleEl.setAttribute('role', 'button');
    titleEl.setAttribute('tabindex', '0');
    titleEl.setAttribute('aria-label', 'Tracker allenamenti - Torna alla Home con animazione');
    titleEl.setAttribute('title', 'Tocca per tornare alla Home con l\'animazione');

    function onTrigger(e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      window.returnHomeWithIntro();
    }

    titleEl.removeEventListener('click', onTrigger);
    titleEl.addEventListener('click', onTrigger);
    titleEl.removeEventListener('keydown', onTrigger);
    titleEl.addEventListener('keydown', onTrigger);
  }

  // Esecuzione immediata template capture & first load
  captureTemplate();
  if (document.getElementById('cali-intro-overlay') || document.readyState !== 'loading') {
    initFirstLoad();
  } else {
    document.addEventListener('DOMContentLoaded', initFirstLoad);
  }

  // Collega il trigger sul titolo al caricamento DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachTitleListener);
  } else {
    attachTitleListener();
  }
  window.addEventListener('load', attachTitleListener);
})();
