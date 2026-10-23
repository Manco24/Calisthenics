// ═══════════════════════════════════════════════════════════════════════
// APP SCHEDE ALLENAMENTO CALISTHENICS
// ═══════════════════════════════════════════════════════════════════════

// ─── 1. Navigazione tra le schermate (History API & Slide) ───────────
const NAV_PARENTS = {
  'workout-editor': 'menu',
  'sub-programma': 'menu',
  'sub-spinta': 'sub-programma',
  'sub-tirata': 'sub-programma',
  'sub-mie-schede': 'sub-programma',
  'spinta-1': 'sub-spinta',
  'spinta-2': 'sub-spinta',
  'tirata-1': 'sub-tirata',
  'tirata-2': 'sub-tirata',
  'tirata-3': 'sub-tirata',
  'tirata-4': 'sub-tirata',
  'custom-workout': 'sub-mie-schede'
};

const SCREEN_LEVELS = {
  'menu': 0,
  'workout-editor': 1,
  'sub-programma': 1,
  'sub-spinta': 1,
  'sub-tirata': 1,
  'sub-mie-schede': 1,
  'spinta-1': 2,
  'spinta-2': 2,
  'tirata-1': 2,
  'tirata-2': 2,
  'tirata-3': 2,
  'tirata-4': 2,
  'custom-workout': 2
};

let activeCustomSheetId = null;
let globalTimerOverlay = null;

function getActiveScreenId() {
  const active = document.querySelector('.screen.active');
  return active ? active.id : 'menu';
}

function syncScreenForActiveDate(screen) {
  if (!screen) return;
  const activeDate = getActiveTrainingDateKey();
  if (screen.dataset.syncedTrainingDate === activeDate) {
    return;
  }
  screen.dataset.syncedTrainingDate = activeDate;

  const overlay = globalTimerOverlay;
  screen.querySelectorAll('.exercise').forEach(exercise => {
    if (isIncrementExercise(exercise)) {
      const widget = exercise.querySelector('.dip-increment-widget');
      if (widget) widget.remove();
      setupDipIncrement(exercise, overlay);
      return;
    }

    if (isTotalRepsExercise(exercise)) {
      const widget = exercise.querySelector('.ex-totalreps-widget');
      if (widget) widget.remove();
      setupTotalRepsWidget(exercise);
      return;
    }

    const totalSets = getSetCount(exercise);
    if (totalSets !== null) {
      const completed = Math.min(loadSetProgress(exercise), totalSets);
      const progress = exercise.querySelector('.set-progress');
      if (progress) {
        progress.dataset.completed = String(completed);
        progress.textContent = `${completed}/${totalSets}`;
        progress.setAttribute('aria-label', `Serie completate: ${completed} di ${totalSets}`);
        if (completed >= totalSets && totalSets > 0) {
          progress.classList.add('completed');
          exercise.classList.add('exercise-done');
        } else {
          progress.classList.remove('completed');
          exercise.classList.remove('exercise-done');
        }
      }
    }

    const maxInputs = [...exercise.querySelectorAll('.ex-max-input')];
    if (maxInputs.length > 0) {
      const seriesVals = loadMaxSeriesProgress(exercise, maxInputs.length);
      maxInputs.forEach((inp, idx) => {
        inp.value = seriesVals[idx] !== null && seriesVals[idx] !== undefined ? String(seriesVals[idx]) : '';
      });
    }
  });

  updateMaxHalfDependencies(screen);
  updateAthleteSessionPanel(screen);
  updateScreenProgress(screen, false);
}
window.syncScreenForActiveDate = syncScreenForActiveDate;

function activateScreen(id) {
  const previous = document.querySelector('.screen.active');
  const target = document.getElementById(id);
  if (!target) return;

  const prevId = previous ? previous.id : 'menu';
  const prevLevel = SCREEN_LEVELS[prevId] ?? 0;
  const targetLevel = SCREEN_LEVELS[id] ?? 0;
  const isBack = targetLevel < prevLevel || id === 'menu' || id === NAV_PARENTS[prevId];

  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('active', 'slide-in-right', 'slide-in-left');
  });

  if (isBack) {
    target.classList.add('slide-in-left');
  } else {
    target.classList.add('slide-in-right');
  }
  target.classList.add('active');

  window.scrollTo(0, 0);

  if (id === 'workout-editor') {
    ensureEditorIframeLoaded();
  }

  if (id === 'sub-mie-schede') {
    renderCustomSheetsList();
  }

  if (target.querySelector('.exercise-list') || target.dataset.sheetId || id === 'custom-workout') {
    hydrateWorkoutScreen(target);
    requestWakeLock();
    syncScreenForActiveDate(target);
  } else if (!activeTimer) {
    releaseWakeLock();
  }

  // Haptic feedback tattile
  if ('vibrate' in navigator) navigator.vibrate(8);
}

function showScreen(id) {
  const currentId = getActiveScreenId();
  if (currentId === id) return;

  history.pushState({ screen: id }, '', '#' + id);
  activateScreen(id);
}

// Gestione pulsante "Indietro" del browser e del telefono
window.addEventListener('popstate', function (event) {
  if (event.state && event.state.screen) {
    activateScreen(event.state.screen);
  } else {
    activateScreen('menu');
  }
});

window.addEventListener('message', function (event) {
  const editorFrame = document.querySelector('#workout-editor iframe');
  if (event.source !== editorFrame?.contentWindow) return;

  if (event.data?.type === 'workout-editor:close') {
    const prev = NAV_PARENTS['workout-editor'] || 'menu';
    showScreen(prev);
  } else if (event.data?.type === 'workout-editor:saved') {
    renderCustomSheetsList();
    const savedSheetId = event.data.sheetId;
    if (savedSheetId && globalTimerOverlay) {
      const presetScreen = document.getElementById(savedSheetId);
      if (presetScreen && presetScreen.classList.contains('screen')) {
        renderWorkoutScreenFromJson(presetScreen, savedSheetId, globalTimerOverlay);
      }
      if (savedSheetId === activeCustomSheetId) {
        const customScreen = document.getElementById('custom-workout');
        if (customScreen) {
          renderWorkoutScreenFromJson(customScreen, savedSheetId, globalTimerOverlay);
        }
      }
    }
    if (typeof window.refreshCalendar === 'function') {
      window.refreshCalendar();
    }
  } else if (event.data?.type === 'workout-editor:progress-updated') {
    if (typeof window.refreshCalendar === 'function') {
      window.refreshCalendar();
    }
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function renderCustomSheetsList() {
  const container = document.getElementById('pwa-custom-sheets-list');
  if (!container) return;

  if (typeof WorkoutStorage === 'undefined') {
    container.innerHTML = '<p class="empty-custom-sheets">Modulo archivio schede non caricato.</p>';
    return;
  }

  const sheets = typeof WorkoutStorage.listCustomSheets === 'function'
    ? WorkoutStorage.listCustomSheets()
    : WorkoutStorage.listSheets();
  if (sheets.length === 0) {
    container.innerHTML = `
      <div class="empty-custom-sheets-card">
        <p>Non hai ancora creato schede personalizzate nell'archivio.</p>
        <button type="button" class="btn-create-sheet" onclick="openNewSheetEditor()">+ Crea o importa una scheda</button>
      </div>
    `;
    return;
  }

  container.innerHTML = sheets.map((sheet, index) => {
    const dateFormatted = sheet.updatedAt
      ? new Date(sheet.updatedAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      : '';
    const safeTitle = escapeHtml(sheet.titolo || 'Senza titolo');
    return `
      <button class="workout-sheet-btn route-custom" type="button" onclick="openCustomWorkout('${sheet.id}')">
        <span class="sheet-icon icon-custom">${index + 1}</span>
        <span class="sheet-info">
          <span class="sheet-label">${safeTitle}</span>
          <span class="sheet-description">${sheet.exerciseCount} eserciz${sheet.exerciseCount === 1 ? 'io' : 'i'}${dateFormatted ? ` • ${dateFormatted}` : ''}</span>
        </span>
        <span class="chevron">›</span>
      </button>
    `;
  }).join('');
}

function ensureEditorIframeLoaded(callback) {
  const iframe = document.querySelector('#workout-editor iframe');
  if (!iframe) return null;
  const targetSrc = iframe.dataset.src || './workout-editor/index.html';
  const currentSrc = iframe.getAttribute('src');

  if (!currentSrc && targetSrc) {
    if (typeof callback === 'function') {
      const onLoad = () => {
        iframe.removeEventListener('load', onLoad);
        try { callback(iframe); } catch (e) {}
      };
      iframe.addEventListener('load', onLoad);
    }
    iframe.setAttribute('src', targetSrc);
    return iframe;
  }

  if (typeof callback === 'function') {
    try { callback(iframe); } catch (e) {}
  }
  return iframe;
}
window.ensureEditorIframeLoaded = ensureEditorIframeLoaded;

function openCustomWorkout(sheetId, callerScreenId = null) {
  if (!sheetId) return;
  activeCustomSheetId = sheetId;

  if (typeof WorkoutStorage !== 'undefined') {
    WorkoutStorage.setActiveSheetId(sheetId);
  }

  if (typeof window.openWorkoutFromCalendar === 'function') {
    window.openWorkoutFromCalendar(sheetId);
  }

  ensureEditorIframeLoaded(frame => {
    frame.contentWindow?.postMessage({ type: 'workout-editor:open-sheet', sheetId, mode: 'player' }, '*');
  });

  const customScreen = document.getElementById('custom-workout');
  if (customScreen && globalTimerOverlay) {
    const currentScreen = callerScreenId || getActiveScreenId();
    NAV_PARENTS['custom-workout'] = (currentScreen === 'menu' || currentScreen === 'sub-mie-schede')
      ? currentScreen
      : 'sub-mie-schede';
    renderWorkoutScreenFromJson(customScreen, sheetId, globalTimerOverlay);
    showScreen('custom-workout');
    return;
  }

  NAV_PARENTS['workout-editor'] = 'sub-mie-schede';
  showScreen('workout-editor');
}

function openEditorHome() {
  NAV_PARENTS['workout-editor'] = 'menu';
  ensureEditorIframeLoaded(frame => {
    frame.contentWindow?.postMessage({ type: 'workout-editor:set-mode', mode: 'editor' }, '*');
  });
  showScreen('workout-editor');
}

function openSheetInEditor(sheetId) {
  const targetSheetId = sheetId || activeCustomSheetId || 'spinta-1';
  const callerScreen = getActiveScreenId();
  NAV_PARENTS['workout-editor'] = callerScreen !== 'workout-editor' ? callerScreen : 'menu';

  if (typeof WorkoutStorage !== 'undefined') {
    WorkoutStorage.setActiveSheetId(targetSheetId);
  }

  ensureEditorIframeLoaded(frame => {
    frame.contentWindow?.postMessage({
      type: 'workout-editor:open-sheet',
      sheetId: targetSheetId,
      mode: 'editor'
    }, '*');
  });

  showScreen('workout-editor');
}

function openNewSheetEditor() {
  const callerScreen = getActiveScreenId();
  NAV_PARENTS['workout-editor'] = callerScreen !== 'workout-editor' ? callerScreen : 'sub-mie-schede';
  ensureEditorIframeLoaded(frame => {
    frame.contentWindow?.postMessage({ type: 'workout-editor:new-sheet', mode: 'editor' }, '*');
  });
  showScreen('workout-editor');
}

function openWizardForSheet(sheetId) {
  openSheetInEditor(sheetId);
}
window.openWizardForSheet = openWizardForSheet;

// Gestione stato iniziale (menu o schermata diretta da hash URL)
const initialHash = window.location.hash.replace(/^#/, '');
const initialScreen = initialHash && document.getElementById(initialHash) ? initialHash : 'menu';
if (initialScreen !== 'menu') {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const targetScreen = document.getElementById(initialScreen);
  if (targetScreen) targetScreen.classList.add('active');
}
history.replaceState({ screen: initialScreen }, '', window.location.pathname + window.location.search + (initialScreen !== 'menu' ? '#' + initialScreen : ''));


// ─── 2. Ingrandimento immagine scheda (Zoom & Modale) ─────────────────
function zoomImage(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');

  if (modal && modalImg) {
    modalImg.src = src;
    modal.classList.add('active');
  }
}

function closeZoom() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Chiusura zoom con tasto Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeZoom();
});


// ─── 3. Parser Tempi di Riposo & Formattazione ────────────────────────
function parseRestTimes(text) {
  const times = [];
  const pattern = /(\d+)\s*'\s*(\d+)?\s*(?:"|″|"|&quot;)?|(\d+)\s*(?:"|″|"|&quot;)?/g;
  let match;
  let previousEnd = 0;

  // Normalizza le entità HTML delle virgolette
  const cleanText = text.replace(/&quot;/g, '"');

  while ((match = pattern.exec(cleanText)) !== null) {
    const minutes = match[1] ? Number(match[1]) : 0;
    const seconds = match[1] ? Number(match[2] || 0) : Number(match[3] || 0);
    if (minutes === 0 && seconds === 0) continue;

    const rawPrefix = cleanText.slice(previousEnd, match.index);
    const cleanPrefix = rawPrefix
      .replace(/["″']/g, '')
      .replace(/^[\s:|/]+|[\s:|/]+$/g, '')
      .trim();

    times.push({
      seconds: minutes * 60 + seconds,
      prefix: cleanPrefix
    });
    previousEnd = pattern.lastIndex;
  }

  return times.filter(time => time.seconds > 0);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}


// ─── 4. Audio & Notifiche Background (PWA & Mobile) ───────────────────
let activeTimer = null;
let timerInterval = null;
let timerWorker = null;
let wakeLock = null;
let audioContext = null;
let silentAudio = null;
let alarmAudio = null;

// Traccia audio silenziosa (1 secondo WAV PCM mono) per preservare il ciclo di vita in background
const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Genera dinamicamente un buffer audio WAV reale per riproduzione allarme anche ad AudioContext congelato
function createAlarmAudioUrl() {
  const sampleRate = 22050;
  const beeps = [
    { freq: 660, dur: 0.28, pause: 0.1 },
    { freq: 880, dur: 0.28, pause: 0.1 },
    { freq: 1047, dur: 0.42, pause: 0.16 },
    { freq: 880, dur: 0.28, pause: 0.1 },
    { freq: 1047, dur: 0.55, pause: 0 }
  ];
  let totalDuration = 0;
  beeps.forEach(b => { totalDuration += b.dur + b.pause; });
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  let sampleOffset = 0;
  beeps.forEach(({ freq, dur, pause }) => {
    const beepSamples = Math.floor(sampleRate * dur);
    const pauseSamples = Math.floor(sampleRate * pause);
    for (let i = 0; i < beepSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, Math.min(i / 80, (beepSamples - i) / 80));
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.9;
      view.setInt16(44 + (sampleOffset + i) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    sampleOffset += beepSamples + pauseSamples;
  });

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function initAudioElements() {
  if (!silentAudio) {
    try {
      silentAudio = new Audio(SILENT_AUDIO_URI);
      silentAudio.loop = true;
    } catch (e) {
      console.warn('Silent audio non supportato:', e);
    }
  }
  if (!alarmAudio) {
    try {
      alarmAudio = new Audio(createAlarmAudioUrl());
      alarmAudio.volume = 1;
      alarmAudio.preload = 'auto';
    } catch (e) {
      console.warn('Alarm audio fallback non supportato:', e);
    }
  }
}

// Timer basato su Web Worker per non subire throttling a scheda nascosta
function initTimerWorker() {
  if (timerWorker) return;
  try {
    const workerBlob = new Blob([`
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(function() {
            self.postMessage('tick');
          }, 250);
        } else if (e.data === 'stop') {
          if (intervalId) clearInterval(intervalId);
          intervalId = null;
        }
      };
    `], { type: 'application/javascript' });
    timerWorker = new Worker(URL.createObjectURL(workerBlob));
    timerWorker.onmessage = function() {
      updateTimerDisplay();
    };
  } catch (e) {
    console.warn('Web Worker non disponibile, fallback a setInterval standard', e);
  }
}

function sendTimerNotification(label) {
  const title = '⏰ Tempo di riposo terminato!';
  const options = {
    body: `${label || 'Riposo'} completato! È ora di fare la serie 💪`,
    icon: './icon-192.svg',
    badge: './icon-192.svg',
    vibrate: [300, 150, 300, 150, 400],
    tag: 'rest-timer-finished',
    renotify: true,
    requireInteraction: true
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, options);
    }).catch(() => {
      fallbackNotification(title, options);
    });
  } else {
    fallbackNotification(title, options);
  }
}

function fallbackNotification(title, options) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, options);
    } catch (e) {
      // Ignora restrizioni se le notifiche non sono permesse
    }
  }
}

const SOUND_MUTE_KEY = 'calisthenics_sound_mute';

function isSoundMuted() {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function toggleSoundMute() {
  try {
    const next = !isSoundMuted();
    localStorage.setItem(SOUND_MUTE_KEY, String(next));
    return next;
  } catch (e) {
    return false;
  }
}

function showToast(message) {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message);
  }
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2200);
}
window.showToast = showToast;

async function playWarningBeep(pitch = 750) {
  if (isSoundMuted()) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!audioContext) audioContext = new AudioContext();
  const context = audioContext;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch (e) {
      return;
    }
  }
  const startTime = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = pitch;
  gain.gain.setValueAtTime(0.35, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.08);
}

async function beep() {
  if (isSoundMuted()) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  if (!audioContext) audioContext = new AudioContext();
  const context = audioContext;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch (error) {
      console.error('Impossibile riprodurre il suono del timer:', error);
      return;
    }
  }

  const startTime = context.currentTime;
  [660, 880, 1047, 880, 1047].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startTime + index * 0.35;
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.55, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.32);
  });
}

function prepareAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(error => {
        console.error("Impossibile attivare l'audio del timer:", error);
      });
    }
  }
}

function isWorkoutScreenActive() {
  const current = document.querySelector('.screen.active');
  return Boolean(current && (current.querySelector('.exercise-list') || current.dataset.sheetId || current.id === 'custom-workout'));
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (!activeTimer && !isWorkoutScreenActive()) return;
  try {
    if (!wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch (error) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {}).finally(() => {
      wakeLock = null;
    });
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && (activeTimer || isWorkoutScreenActive())) {
    await requestWakeLock();
  }
});


// ─── 5. Gestione Interfaccia Timer di Riposo ──────────────────────────
function createTimerOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'restTimer';
  overlay.className = 'rest-timer';
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="rest-timer-top-bar">
      <div class="rest-timer-label"></div>
      <button type="button" class="timer-mute-btn" title="Attiva/disattiva audio timer" aria-label="Attiva o disattiva audio">
        <span class="mute-icon">${isSoundMuted() ? '🔇' : '🔊'}</span>
      </button>
    </div>
    <div class="rest-timer-ring-wrap">
      <svg class="rest-timer-ring" viewBox="0 0 120 120">
        <circle class="ring-bg" cx="60" cy="60" r="54" />
        <circle class="ring-fg" cx="60" cy="60" r="54" />
      </svg>
      <div class="rest-timer-countdown">0:00</div>
    </div>
    <div class="rest-timer-actions">
      <button type="button" class="timer-sub" title="Riduci timer di 15 secondi">-15s</button>
      <button type="button" class="timer-add" title="Aumenta timer di 30 secondi">+30s</button>
      <button type="button" class="timer-pause" aria-pressed="false">Pausa</button>
      <button type="button" class="timer-skip">Salta</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const muteBtn = overlay.querySelector('.timer-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const isMuted = toggleSoundMute();
      muteBtn.querySelector('.mute-icon').textContent = isMuted ? '🔇' : '🔊';
      muteBtn.classList.toggle('is-muted', isMuted);
      showToast(isMuted ? 'Audio timer disattivato (solo vibrazione)' : 'Audio timer attivato');
      if ('vibrate' in navigator) navigator.vibrate(8);
    });
  }

  overlay.querySelector('.timer-sub').addEventListener('click', () => {
    if (activeTimer) {
      const remainingMs = activeTimer.paused ? activeTimer.remainingMs : (activeTimer.endTime - Date.now());
      if (remainingMs > 15000) {
        if (!activeTimer.paused) activeTimer.endTime -= 15000;
        else activeTimer.remainingMs -= 15000;
        activeTimer.totalSeconds = Math.max(15, activeTimer.totalSeconds - 15);
      } else {
        if (!activeTimer.paused) activeTimer.endTime = Date.now() + 3000;
        else activeTimer.remainingMs = 3000;
      }
      updateTimerDisplay();
      if ('vibrate' in navigator) navigator.vibrate(8);
    }
  });

  overlay.querySelector('.timer-add').addEventListener('click', () => {
    if (activeTimer) {
      activeTimer.endTime += 30000;
      activeTimer.totalSeconds += 30;
      if (activeTimer.paused) activeTimer.remainingMs += 30000;
      updateTimerDisplay();
      if ('vibrate' in navigator) navigator.vibrate(8);
    }
  });

  overlay.querySelector('.timer-pause').addEventListener('click', toggleTimerPause);
  overlay.querySelector('.timer-skip').addEventListener('click', stopTimer);
  return overlay;
}

function updateTimerDisplay() {
  if (!activeTimer) return;
  if (activeTimer.paused) return;
  const remaining = Math.max(0, Math.ceil((activeTimer.endTime - Date.now()) / 1000));
  const countdownEl = activeTimer.overlay.querySelector('.rest-timer-countdown');
  countdownEl.textContent = formatTime(remaining);

  // Animazione anello SVG circolare
  const ringFg = activeTimer.overlay.querySelector('.ring-fg');
  if (ringFg && activeTimer.totalSeconds > 0) {
    const circumference = 2 * Math.PI * 54;
    const progress = remaining / activeTimer.totalSeconds;
    ringFg.style.strokeDashoffset = circumference * (1 - progress);
  }

  // Pre-avviso sonoro e tattile negli ultimi 3 secondi (3, 2, 1)
  if (remaining >= 1 && remaining <= 3 && activeTimer.lastWarningSecond !== remaining) {
    activeTimer.lastWarningSecond = remaining;
    void playWarningBeep(700 + (3 - remaining) * 120);
    if ('vibrate' in navigator) navigator.vibrate(18);
  }

  // Effetto pulse visivo negli ultimi 5 secondi
  if (remaining <= 5 && remaining > 0) {
    countdownEl.classList.add('pulse');
  } else {
    countdownEl.classList.remove('pulse');
  }

  if (remaining === 0) {
    const completedLabel = activeTimer.label || 'Riposo';
    countdownEl.textContent = 'GO! 💪';
    countdownEl.classList.add('ready-go');

    // Suono via Web Audio API + fallback tramite elemento Audio bufferizzato
    void beep();
    if (alarmAudio && !isSoundMuted()) {
      try {
        alarmAudio.currentTime = 0;
        alarmAudio.play().catch(() => {});
      } catch (e) {}
    }

    // Vibrazione tattile
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 150, 400]);

    // Notifica di sistema push
    sendTimerNotification(completedLabel);

    setTimeout(() => {
      stopTimer();
      countdownEl.classList.remove('ready-go');
    }, 850);
  }
}

function startTimer(seconds, label, overlay) {
  if (activeTimer) stopTimer();

  // Richiesta permessi notifiche sul tocco utente
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  initAudioElements();
  initTimerWorker();
  prepareAudio();

  // Mantenimento sessione attiva per il background
  if (silentAudio) {
    silentAudio.play().catch(() => {});
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Riposo in corso (${formatTime(seconds)})`,
      artist: 'Calisthenics',
      album: label || 'Allenamento'
    });
    navigator.mediaSession.playbackState = 'playing';
  }

  activeTimer = {
    endTime: Date.now() + seconds * 1000,
    overlay,
    totalSeconds: seconds,
    label: label || 'Riposo',
    paused: false,
    remainingMs: seconds * 1000,
    lastWarningSecond: null
  };
  overlay.querySelector('.rest-timer-label').textContent = label;

  const muteBtn = overlay.querySelector('.timer-mute-btn');
  if (muteBtn) {
    const isMuted = isSoundMuted();
    muteBtn.querySelector('.mute-icon').textContent = isMuted ? '🔇' : '🔊';
    muteBtn.classList.toggle('is-muted', isMuted);
  }

  // Reset anello SVG
  const ringFg = overlay.querySelector('.ring-fg');
  if (ringFg) {
    const circumference = 2 * Math.PI * 54;
    ringFg.style.strokeDasharray = circumference;
    ringFg.style.strokeDashoffset = '0';
  }

  overlay.classList.add('visible');
  updateTimerDisplay();

  if (timerWorker) {
    timerWorker.postMessage('start');
  } else {
    timerInterval = setInterval(updateTimerDisplay, 250);
  }

  requestWakeLock();
}

function toggleTimerPause() {
  if (!activeTimer) return;
  if (activeTimer.paused) {
    activeTimer.paused = false;
    activeTimer.endTime = Date.now() + activeTimer.remainingMs;
    activeTimer.overlay.querySelector('.timer-pause').textContent = 'Pausa';
    activeTimer.overlay.querySelector('.timer-pause').setAttribute('aria-pressed', 'false');
    if (timerWorker) timerWorker.postMessage('start');
    else timerInterval = setInterval(updateTimerDisplay, 250);
    if (silentAudio) silentAudio.play().catch(() => {});
    requestWakeLock();
    updateTimerDisplay();
    return;
  }
  activeTimer.remainingMs = Math.max(0, activeTimer.endTime - Date.now());
  activeTimer.paused = true;
  activeTimer.overlay.querySelector('.timer-pause').textContent = 'Riprendi';
  activeTimer.overlay.querySelector('.timer-pause').setAttribute('aria-pressed', 'true');
  if (timerWorker) timerWorker.postMessage('stop');
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (silentAudio) {
    silentAudio.pause();
    silentAudio.currentTime = 0;
  }
  releaseWakeLock();
  updateTimerDisplay();
}

function stopTimer() {
  if (!activeTimer) return;
  activeTimer.overlay.classList.remove('visible');
  activeTimer = null;

  if (timerWorker) {
    timerWorker.postMessage('stop');
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (silentAudio) {
    silentAudio.pause();
    silentAudio.currentTime = 0;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }

  if (!isWorkoutScreenActive()) {
    releaseWakeLock();
  }
}


// ─── 6. Contatore Serie, Max, Reps Totali & Ladder con localStorage ───
function getScreenSheetId(screen) {
  if (!screen) return '';
  return screen.dataset.sheetId || screen.id || '';
}

function getExerciseId(exercise, screenId) {
  const explicitId = exercise.dataset.exerciseId;
  if (explicitId) return explicitId;

  const number = exercise.querySelector('.ex-num')?.textContent.trim();
  return number ? `${screenId}-${number}` : 'unknown';
}

function getActiveTrainingDateKey() {
  if (typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.getActiveTrainingDate === 'function') {
    return WorkoutStorage.getActiveTrainingDate();
  }
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function getLegacyStorageKey(exercise, screenId, prefix) {
  const name = exercise.querySelector('.name');
  return `${prefix}${screenId}_${name ? name.textContent.trim() : ''}`;
}

function getStorageKey(exercise, screenId, dateKey = null) {
  const d = dateKey || getActiveTrainingDateKey();
  return `calisthenics_sets_${d}_${getExerciseId(exercise, screenId)}`;
}

function getMaxStorageKey(exercise, screenId, dateKey = null) {
  const d = dateKey || getActiveTrainingDateKey();
  return `calisthenics_max_${d}_${getExerciseId(exercise, screenId)}`;
}

function getTotalRepsStorageKey(exercise, screenId, dateKey = null) {
  const d = dateKey || getActiveTrainingDateKey();
  return `calisthenics_totalreps_${d}_${getExerciseId(exercise, screenId)}`;
}

function loadMaxSeriesProgress(exercise, expectedCount = 1) {
  const screen = exercise.closest('.screen');
  const count = Math.max(1, Number(expectedCount) || 1);
  const empty = Array(count).fill(null);
  if (!screen) return empty;
  const sheetId = getScreenSheetId(screen);
  try {
    const raw = localStorage.getItem(getMaxStorageKey(exercise, sheetId));
    if (raw === null || raw === '') return empty;
    if (raw.trim().startsWith('[')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from({ length: count }, (_, i) => {
          const n = Number(parsed[i]);
          return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        });
      }
    }
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      const res = Array(count).fill(null);
      res[0] = Math.round(num);
      return res;
    }
    return empty;
  } catch (e) {
    return empty;
  }
}

function saveMaxSeriesProgress(exercise, valuesArray) {
  const screen = exercise.closest('.screen');
  if (!screen) return;
  const sheetId = getScreenSheetId(screen);
  const key = getMaxStorageKey(exercise, sheetId);
  try {
    const cleaned = (Array.isArray(valuesArray) ? valuesArray : [valuesArray]).map(v => {
      if (v === null || v === '' || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    });
    const hasAny = cleaned.some(v => v !== null);
    if (!hasAny) {
      localStorage.removeItem(key);
    } else if (cleaned.length === 1) {
      localStorage.setItem(key, String(cleaned[0]));
    } else {
      localStorage.setItem(key, JSON.stringify(cleaned));
    }
  } catch (error) {
    console.error('Impossibile salvare i massimali per serie:', error);
  }
}

function loadMaxProgress(exercise) {
  const series = loadMaxSeriesProgress(exercise, getSetCount(exercise) || 1);
  const valid = series.filter(v => v !== null && v > 0);
  if (valid.length === 0) return null;
  return valid[0];
}

function saveMaxProgress(exercise, value) {
  saveMaxSeriesProgress(exercise, [value]);
}

function loadTotalRepsProgress(exercise) {
  const screen = exercise.closest('.screen');
  if (!screen) return 0;
  const sheetId = getScreenSheetId(screen);
  try {
    const raw = localStorage.getItem(getTotalRepsStorageKey(exercise, sheetId));
    if (raw === null) return 0;
    const num = Number(raw || 0);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch (e) {
    return 0;
  }
}

function saveTotalRepsProgress(exercise, value) {
  const screen = exercise.closest('.screen');
  if (!screen) return;
  const sheetId = getScreenSheetId(screen);
  try {
    localStorage.setItem(getTotalRepsStorageKey(exercise, sheetId), String(Math.max(0, Math.round(Number(value) || 0))));
  } catch (error) {
    console.error('Impossibile salvare le ripetizioni totali:', error);
  }
}

function saveSetProgress(exercise, completed) {
  const screen = exercise.closest('.screen');
  if (!screen) return;
  const sheetId = getScreenSheetId(screen);
  const key = getStorageKey(exercise, sheetId);
  try {
    localStorage.setItem(key, String(completed));
  } catch (error) {
    console.error('Impossibile salvare il progresso esercizio:', error);
  }
}

const DIP_PROGRESS_SUFFIX = '_dip_progress_v2';
const LEGACY_DIP_PROGRESS_SUFFIX = '_dip_progress';

function getDipProgressKey(exercise, dateKey = null) {
  const screen = exercise.closest('.screen');
  if (!screen) return '';
  const sheetId = getScreenSheetId(screen);
  return `${getStorageKey(exercise, sheetId, dateKey)}${DIP_PROGRESS_SUFFIX}`;
}

function isIncrementExercise(exercise) {
  return Boolean(exercise.dataset.dipIncrement || exercise.dataset.incrementLadder);
}

function isTotalRepsExercise(exercise) {
  if (!exercise) return false;
  if (exercise.dataset && exercise.dataset.exerciseType === 'reps_totali') return true;
  const badge = exercise.dataset?.baseBadge || exercise.querySelector?.('.badge')?.textContent || '';
  if (/reps?\s+totali/i.test(badge)) return true;
  if (/^\s*\d+\s+reps?\s*$/i.test(badge)) return true;
  const name = exercise.querySelector?.('.name')?.textContent || '';
  if (/diamante/i.test(name) && /\d+\s*reps?/i.test(badge)) return true;
  return false;
}

function isGroupExercise(exercise) {
  if (!exercise) return false;
  if (exercise.dataset?.hasGroups === 'true') return true;
  const badge = exercise.dataset?.baseBadge || exercise.querySelector?.('.badge')?.textContent || '';
  if (/\b\d+\s*[xX]\s*\(/i.test(badge)) return true;
  const meta = exercise.querySelector?.('.ex-meta')?.textContent || '';
  if (/tra\s+(?:i\s+)?gruppi/i.test(meta)) return true;
  return false;
}

function loadDipProgress(exercise) {
  try {
    const screen = exercise.closest('.screen');
    const sheetId = getScreenSheetId(screen);
    const storageKey = getDipProgressKey(exercise);
    const savedValue = localStorage.getItem(storageKey);
    if (!savedValue) {
      return { current: 1, max: 0, previousReps: 0, reachedThree: false, phase: 'up', completedReps: 0, stoppedReps: 0, restReps: 0, finished: false };
    }
    const saved = JSON.parse(savedValue);
    let current = Math.max(Number(saved.current) || 1, 1);
    let max = Math.max(Number(saved.max) || 0, 0);
    let previousReps = Math.max(Number(saved.previousReps ?? saved.lastCompletedReps ?? 0) || 0, 0);
    let finished = saved.finished === true;
    const phase = saved.phase === 'down' ? 'down' : 'up';
    const reachedThree = Boolean(saved.reachedThree || (Number(saved.max) >= 3) || (Number(saved.previousReps) >= 3) || (Number(saved.current) > 3));

    return {
      current,
      max,
      previousReps,
      reachedThree,
      phase,
      completedReps: Math.max(Number(saved.completedReps) || 0, 0),
      stoppedReps: Math.max(Number(saved.stoppedReps) || 0, 0),
      restReps: Math.max(Number(saved.restReps) || 0, 0),
      finished
    };
  } catch (error) {
    console.warn('Progresso ladder non leggibile:', error);
    return { current: 1, max: 0, previousReps: 0, reachedThree: false, phase: 'up', completedReps: 0, stoppedReps: 0, restReps: 0, finished: false };
  }
}

function saveDipProgress(exercise, progress) {
  try {
    localStorage.setItem(getDipProgressKey(exercise), JSON.stringify(progress));
  } catch (error) {
    console.error('Impossibile salvare il progresso della ladder:', error);
  }
}

function getDipRestSeconds(reps, exercise, state) {
  const customRestFixed = Number(exercise.dataset.ladderRestFixed);
  if (Number.isFinite(customRestFixed) && customRestFixed > 0) {
    return customRestFixed;
  }
  const customRestPerRep = Number(exercise.dataset.ladderRestPerRep) || 30;
  const customRestMax = Number(exercise.dataset.ladderRestMax) || 90;

  // Regola timer:
  // Serie 1 (1 rep): 30s
  // Serie 2 (2 rep): 60s
  // Serie 3 (3 rep): 90s
  // Da 3 rep in poi (salita oltre le 3 o discesa fino a 1 rep): timer bloccato fisso a 90s (1' 30")
  const isLockedAtCap = Boolean(
    (state && (state.reachedThree || state.phase === 'down' || state.max >= 3)) ||
    reps >= 3
  );

  if (isLockedAtCap) {
    return customRestMax;
  }

  const raw = Math.max(1, reps) * customRestPerRep;
  return Math.min(raw, customRestMax);
}

function startDipRest(reps, overlay, exercise, state) {
  const restSecs = getDipRestSeconds(reps, exercise, state);
  startTimer(
    restSecs,
    `Recupero dopo ${reps} rep (${formatTime(restSecs)})`,
    overlay
  );
  if ('vibrate' in navigator) navigator.vibrate(12);
}

function setupDipIncrement(exercise, overlay) {
  const state = loadDipProgress(exercise);
  const stepIncrement = Math.max(1, Number(exercise.dataset.ladderStep) || 1);
  const hasDescent = exercise.dataset.ladderDescent !== 'false';
  const widget = document.createElement('div');
  widget.className = 'dip-increment-widget';
  widget.dataset.completed = state.finished ? '1' : '0';
  widget.dataset.total = '1';
  widget.innerHTML = `
    <div class="dip-counters" aria-live="polite">
      <div class="dip-counter-card">
        <span class="dip-counter-label">Reps da fare</span>
        <strong class="dip-target-counter"></strong>
      </div>
      <div class="dip-counter-card">
        <span class="dip-counter-label">Serie prec.</span>
        <strong class="dip-previous-counter">—</strong>
      </div>
      <div class="dip-counter-card">
        <span class="dip-counter-label">Reps totali</span>
        <strong class="dip-total-counter"></strong>
      </div>
    </div>
    <div class="dip-current"></div>
    <button class="dip-max-button" type="button">${hasDescent ? 'Questo è il massimo: inizia la discesa' : 'Termina ladder (massimo raggiunto)'}</button>
    <div class="dip-actions">
      <button class="dip-complete-button" type="button"></button>
      <button class="dip-finish-button" type="button" hidden></button>
    </div>
    <p class="dip-status" aria-live="polite"></p>
  `;

  const targetCounter = widget.querySelector('.dip-target-counter');
  const previousCounter = widget.querySelector('.dip-previous-counter');
  const totalCounter = widget.querySelector('.dip-total-counter');
  const current = widget.querySelector('.dip-current');
  const maxButton = widget.querySelector('.dip-max-button');
  const completeButton = widget.querySelector('.dip-complete-button');
  const finishButton = widget.querySelector('.dip-finish-button');
  const status = widget.querySelector('.dip-status');

  const render = () => {
    const finished = state.finished;
    const target = finished ? 0 : state.current;
    widget.dataset.completed = finished ? '1' : '0';
    targetCounter.textContent = finished ? '0' : String(target);
    if (previousCounter) {
      previousCounter.textContent = state.previousReps > 0 ? `${state.previousReps} rep` : '—';
    }
    totalCounter.textContent = String(state.completedReps);
    if (finished) {
      current.textContent = `Piramide completata! (Picco: ${state.max || state.previousReps || 1} rep • Totale: ${state.completedReps} rep)`;
    } else if (state.phase === 'up') {
      current.textContent = `Salita: obiettivo ${target} rep`;
    } else {
      current.textContent = `Discesa: obiettivo ${target} rep (Picco raggiunto: ${state.max} rep)`;
    }
    completeButton.textContent = finished ? 'Piramide completata' : `Registra serie (${target} rep)`;
    completeButton.disabled = finished;

    const currentPeakCandidate = state.previousReps > 0 ? state.previousReps : Math.max(state.current - stepIncrement, 1);
    maxButton.textContent = hasDescent
      ? `Questo è il massimo (${currentPeakCandidate} rep): inizia la discesa`
      : `Termina ladder (massimo raggiunto: ${currentPeakCandidate} rep)`;
    maxButton.hidden = finished || state.phase === 'down' || state.previousReps < 1;
    maxButton.disabled = state.previousReps < 1;
    finishButton.hidden = !state.stoppedReps || finished;
    finishButton.textContent = `Completa serie (restano ${target - state.stoppedReps} rep)`;
    if (finished) {
      exercise.classList.add('exercise-done');
      widget.classList.add('completed');
    } else {
      exercise.classList.remove('exercise-done');
      widget.classList.remove('completed');
    }
  };

  completeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const target = state.current;
    state.previousReps = target;
    state.restReps = target;
    state.completedReps += target;
    state.stoppedReps = 0;
    if (target >= 3) {
      state.reachedThree = true;
    }
    if (state.phase === 'up') {
      state.current += stepIncrement;
    } else if (state.current <= stepIncrement) {
      state.finished = true;
    } else {
      state.current = Math.max(1, state.current - stepIncrement);
    }
    saveDipProgress(exercise, state);
    render();
    updateScreenProgress(exercise.closest('.screen'), true);
    if (!state.finished) startDipRest(target, overlay, exercise, state);
  });

  maxButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const peak = state.previousReps > 0 ? state.previousReps : Math.max(state.current - stepIncrement, 1);
    if (peak >= 3) {
      state.reachedThree = true;
    }
    if (!hasDescent) {
      state.max = peak;
      state.finished = true;
      saveDipProgress(exercise, state);
      render();
      updateScreenProgress(exercise.closest('.screen'), true);
      return;
    }
    state.max = peak;
    state.phase = 'down';
    state.current = state.max - stepIncrement;
    state.finished = state.current <= 0;
    if (state.current < 1) state.current = 1;
    saveDipProgress(exercise, state);
    render();
    updateScreenProgress(exercise.closest('.screen'), true);
    if (!state.finished) startDipRest(state.max, overlay, exercise, state);
  });

  finishButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const target = state.current;
    state.previousReps = target;
    state.restReps = target;
    state.completedReps += state.stoppedReps;
    state.stoppedReps = 0;
    if (target >= 3) {
      state.reachedThree = true;
    }
    if (state.phase === 'up') {
      state.current += stepIncrement;
    } else if (state.current <= stepIncrement) {
      state.finished = true;
    } else {
      state.current = Math.max(1, state.current - stepIncrement);
    }
    saveDipProgress(exercise, state);
    status.textContent = '';
    render();
    updateScreenProgress(exercise.closest('.screen'), true);
    if (!state.finished) startDipRest(target, overlay, exercise, state);
  });

  exercise.appendChild(widget);
  render();
}

function updateMaxHalfDependencies(screen) {
  if (!screen) return;
  const exercises = [...screen.querySelectorAll('.exercise')];
  exercises.forEach((exercise, idx) => {
    const isMaxMetaPrec = exercise.dataset.exerciseType === 'max_meta_prec'
      || /max\s*\/\s*2\s*prec/i.test(exercise.dataset.baseBadge || exercise.querySelector('.badge')?.textContent || '');
    const hasInlineMaxHalf = /max\s*\/\s*2(?!\s*prec)/i.test(exercise.dataset.baseBadge || '')
      || /max\s*\/\s*2/i.test(exercise.querySelector('.ex-note')?.textContent || '');

    if (hasInlineMaxHalf) {
      const ownMax = loadMaxProgress(exercise);
      const hintEl = exercise.querySelector('.ex-max-half-hint');
      if (hintEl) {
        if (ownMax && ownMax > 0) {
          const half = Math.max(1, Math.floor(ownMax / 2));
          hintEl.textContent = `→ Max/2 = ${half} rep`;
          hintEl.hidden = false;
        } else {
          hintEl.textContent = '';
          hintEl.hidden = true;
        }
      }
    }

    if (isMaxMetaPrec && idx > 0) {
      const prevExercise = exercises[idx - 1];
      const prevTotalSets = Math.max(1, getSetCount(prevExercise) || 1);
      const curTotalSets = Math.max(1, getSetCount(exercise) || 1);
      const prevSeries = loadMaxSeriesProgress(prevExercise, prevTotalSets);
      const validPrev = prevSeries.filter(v => v !== null && v > 0);
      const badgeEl = exercise.querySelector('.badge');
      const baseBadge = exercise.dataset.baseBadge || badgeEl?.textContent || 'Max/2 Prec';

      // Calcola i target dimezzati per ciascuna serie
      const halfTargets = Array.from({ length: curTotalSets }, (_, sIdx) => {
        const refVal = prevSeries[sIdx] ?? (validPrev.length > 0 ? validPrev[0] : null);
        return refVal && refVal > 0 ? Math.max(1, Math.floor(refVal / 2)) : null;
      });

      // Aggiorna i placeholder e le etichette delle 4 caselle di Max/2 Prec
      const curInputs = [...exercise.querySelectorAll('.ex-max-input')];
      curInputs.forEach((inp, sIdx) => {
        const targetHalf = halfTargets[sIdx];
        const tagEl = inp.closest('.ex-max-series-item')?.querySelector('.ex-max-series-tag');
        if (targetHalf !== null) {
          inp.placeholder = `${targetHalf}`;
          if (tagEl) tagEl.textContent = `S${sIdx + 1} (→${targetHalf})`;
        } else {
          inp.placeholder = `S${sIdx + 1}`;
          if (tagEl) tagEl.textContent = `S${sIdx + 1}`;
        }
      });

      if (badgeEl) {
        const validHalves = halfTargets.filter(v => v !== null);
        if (validHalves.length > 0) {
          const allSame = validHalves.every(v => v === validHalves[0]);
          const summaryText = (allSame || validPrev.length === 1)
            ? `${validHalves[0]} reps`
            : `${halfTargets.map(v => v !== null ? v : '…').join('-')} reps`;
          if (/max\s*\/\s*2\s*prec/i.test(baseBadge)) {
            badgeEl.textContent = baseBadge.replace(/max\s*\/\s*2\s*prec/i, `${summaryText} (Max/2 Prec)`);
          } else {
            badgeEl.textContent = `${baseBadge} (${summaryText})`;
          }
        } else {
          badgeEl.textContent = baseBadge;
        }
      }
    }
  });
}

function setupMaxInputWidget(exercise) {
  const screen = exercise.closest('.screen');
  const type = exercise.dataset.exerciseType || '';
  const badgeText = exercise.dataset.baseBadge || exercise.querySelector('.badge')?.textContent || '';
  const noteText = exercise.querySelector('.ex-note')?.textContent || '';
  const nextExercise = exercise.nextElementSibling;
  const nextNeedsPrevMax = nextExercise && (
    nextExercise.dataset.exerciseType === 'max_meta_prec' ||
    /max\s*\/\s*2\s*prec/i.test(nextExercise.dataset.baseBadge || nextExercise.querySelector('.badge')?.textContent || '')
  );

  const isMaxMetaPrec = type === 'max_meta_prec' || /max\s*\/\s*2\s*prec/i.test(badgeText);
  const hasInlineMaxSingle = /1\s*x\s*max/i.test(badgeText) || /1\s*x\s*max/i.test(noteText);

  const supportsMaxInput = (
    type === 'max' ||
    type === 'max_range' ||
    isMaxMetaPrec ||
    /\bmax\b/i.test(badgeText) ||
    hasInlineMaxSingle ||
    nextNeedsPrevMax
  );

  if (!supportsMaxInput) return;

  const isSec = !isMaxMetaPrec && (exercise.dataset.maxUnit === 'secondi' || isIsometricHoldName(exercise.querySelector('.name')?.textContent));
  const unitLabel = isSec ? 'sec' : 'reps';
  const totalSets = hasInlineMaxSingle ? 1 : Math.max(1, getSetCount(exercise) || 1);
  const seriesValues = loadMaxSeriesProgress(exercise, totalSets);

  const wrap = document.createElement('div');
  wrap.className = 'ex-max-widget';

  if (totalSets > 1) {
    const titleText = isMaxMetaPrec
      ? `🎯 Ripetizioni per serie (Max/2 — ${unitLabel}):`
      : `🎯 I tuoi Max per serie (${unitLabel}):`;

    const itemsHtml = Array.from({ length: totalSets }, (_, idx) => {
      const val = seriesValues[idx] !== null && seriesValues[idx] !== undefined ? seriesValues[idx] : '';
      return `
        <label class="ex-max-series-item">
          <span class="ex-max-series-tag">S${idx + 1}</span>
          <input type="number" inputmode="numeric" min="1" step="1" class="ex-max-input" data-series-index="${idx}" placeholder="S${idx + 1}" value="${val}" />
        </label>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="ex-max-header-row">
        <span class="ex-max-label">${titleText}</span>
        <span class="ex-max-half-hint" hidden></span>
      </div>
      <div class="ex-max-series-grid" data-series-count="${totalSets}">
        ${itemsHtml}
      </div>
    `;
  } else {
    const placeholder = isSec ? 'Es. 15' : 'Es. 12';
    const savedMax = seriesValues[0];
    wrap.innerHTML = `
      <label class="ex-max-label">
        <span>🎯 Il tuo Max (${unitLabel}):</span>
        <input type="number" inputmode="numeric" min="1" step="1" class="ex-max-input" data-series-index="0" placeholder="${placeholder}" value="${savedMax !== null ? savedMax : ''}" />
      </label>
      <span class="ex-max-half-hint" hidden></span>
    `;
  }

  const inputs = [...wrap.querySelectorAll('.ex-max-input')];
  inputs.forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', (e) => {
      e.stopPropagation();
      const currentValues = inputs.map(inp => {
        const v = inp.value.trim();
        return v ? Number(v) : null;
      });
      saveMaxSeriesProgress(exercise, currentValues);
      updateMaxHalfDependencies(screen);
      syncScreenToCalendarHistory(screen);
    });
  });

  const head = exercise.querySelector('.ex-head');
  if (head) {
    head.after(wrap);
  } else {
    exercise.appendChild(wrap);
  }
}

function setupTotalRepsWidget(exercise) {
  if (!isTotalRepsExercise(exercise)) return;
  const screen = exercise.closest('.screen');
  let parsedTarget = Number(exercise.dataset.targetTotalReps);
  if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
    const badgeText = exercise.dataset.baseBadge || exercise.querySelector('.badge')?.textContent || '';
    const match = badgeText.match(/(\d+)\s*reps?/i);
    parsedTarget = match ? Number(match[1]) : 60;
  }
  const targetTotal = Math.max(1, parsedTarget);
  let currentReps = loadTotalRepsProgress(exercise);

  const widget = document.createElement('div');
  widget.className = 'ex-totalreps-widget';
  widget.dataset.completed = currentReps >= targetTotal ? '1' : '0';
  widget.dataset.total = '1';
  widget.innerHTML = `
    <div class="totalreps-header">
      <span class="totalreps-label">Progresso ripetizioni</span>
      <strong class="totalreps-counter">${currentReps} / ${targetTotal} reps</strong>
    </div>
    <div class="totalreps-bar-track">
      <div class="totalreps-bar-fill"></div>
    </div>
    <div class="totalreps-actions">
      <button type="button" data-delta="-1">-1</button>
      <button type="button" data-delta="1">+1</button>
      <button type="button" data-delta="5">+5</button>
      <button type="button" data-delta="10">+10</button>
    </div>
  `;

  const counterEl = widget.querySelector('.totalreps-counter');
  const fillEl = widget.querySelector('.totalreps-bar-fill');

  const render = () => {
    const done = currentReps >= targetTotal;
    widget.dataset.completed = done ? '1' : '0';
    widget.dataset.currentReps = String(currentReps);
    counterEl.textContent = `${currentReps} / ${targetTotal} reps`;
    const pct = Math.min(100, Math.round((currentReps / targetTotal) * 100));
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (done) {
      exercise.classList.add('exercise-done');
      widget.classList.add('completed');
    } else {
      exercise.classList.remove('exercise-done');
      widget.classList.remove('completed');
    }
  };

  widget.querySelectorAll('button[data-delta]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const delta = Number(btn.dataset.delta || 0);
      currentReps = Math.max(0, currentReps + delta);
      saveTotalRepsProgress(exercise, currentReps);
      render();
      updateScreenProgress(screen, true);
      if ('vibrate' in navigator) navigator.vibrate(10);
    });
  });

  exercise.appendChild(widget);
  render();
}

function setupExerciseAccordion(exercise) {
  exercise.setAttribute('role', 'group');
  exercise.setAttribute('aria-label', exercise.querySelector('.name')?.textContent.trim() || 'esercizio');

  const toggle = (event) => {
    const interactive = event?.target.closest('button, input, select, textarea, a, label, [role="button"]');
    if (interactive && interactive !== exercise) return;
    exercise.classList.toggle('is-open');
  };

  exercise.addEventListener('click', toggle);
}

function loadSetProgress(exercise) {
  const screen = exercise.closest('.screen');
  if (!screen) return 0;
  const sheetId = getScreenSheetId(screen);
  try {
    const key = getStorageKey(exercise, sheetId);
    const currentValue = localStorage.getItem(key);
    if (currentValue === null) {
      return 0;
    }
    return Number(currentValue || 0);
  } catch (error) {
    console.warn('Progresso esercizio non leggibile:', error);
    return 0;
  }
}

function getSetCount(exercise) {
  if (exercise.dataset.totalSets) {
    const explicitSets = Number(exercise.dataset.totalSets);
    if (Number.isFinite(explicitSets) && explicitSets > 0) return explicitSets;
  }
  const badge = exercise.querySelector('.badge');
  if (!badge) return null;

  const badgeText = exercise.dataset.baseBadge || badge.textContent;
  const counts = [...badgeText.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*[xX]/g)]
    .map(match => Number(match[2] || match[1]));
  if (counts.length > 0) return counts.reduce((total, count) => total + count, 0);

  return /da compilare/i.test(badgeText) ? null : 1;
}

function setupSetProgress(exercise) {
  if (isIncrementExercise(exercise) || isTotalRepsExercise(exercise)) return;
  const totalSets = getSetCount(exercise);
  if (totalSets === null) return;

  const savedCompleted = Math.min(loadSetProgress(exercise), totalSets);

  const progress = document.createElement('span');
  progress.className = 'set-progress';
  if (savedCompleted >= totalSets) {
    progress.classList.add('completed');
  }
  progress.textContent = `${savedCompleted}/${totalSets}`;
  progress.dataset.completed = String(savedCompleted);
  progress.dataset.total = String(totalSets);
  progress.setAttribute('role', 'button');
  progress.setAttribute('tabindex', '0');
  const isClusterGroup = isGroupExercise(exercise);
  progress.setAttribute('title', isClusterGroup ? 'Tocca per registrare o modificare un gruppo' : 'Tocca per registrare o modificare una serie');
  progress.setAttribute('aria-label', isClusterGroup ? `Gruppi completati: ${savedCompleted} di ${totalSets}` : `Serie completate: ${savedCompleted} di ${totalSets}`);

  // Tap manuale sul contatore per avanzare o resettare la serie
  progress.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = Number(progress.dataset.completed);
    if (current >= totalSets) {
      progress.dataset.completed = '0';
      progress.textContent = `0/${totalSets}`;
      progress.classList.remove('completed');
      exercise.classList.remove('exercise-done');
      saveSetProgress(exercise, 0);
    } else {
      completeSet(exercise);
      return;
    }
    updateScreenProgress(exercise.closest('.screen'), true);
    if ('vibrate' in navigator) navigator.vibrate(10);
  });

  exercise.querySelector('.ex-title-wrap').appendChild(progress);

  if (savedCompleted >= totalSets) {
    exercise.classList.add('exercise-done');
  }

  updateScreenProgress(exercise.closest('.screen'), false);
}

function completeSet(exercise) {
  const progress = exercise.querySelector('.set-progress');
  if (!progress) return;

  const completed = Number(progress.dataset.completed);
  const total = Number(progress.dataset.total);
  const nextCompleted = Math.min(completed + 1, total);
  progress.dataset.completed = String(nextCompleted);
  progress.textContent = `${nextCompleted}/${total}`;
  progress.setAttribute('aria-label', `Serie completate: ${nextCompleted} di ${total}`);

  saveSetProgress(exercise, nextCompleted);

  if (nextCompleted >= total) {
    exercise.classList.add('exercise-done');
    progress.classList.add('completed');
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
  } else {
    exercise.classList.remove('exercise-done');
    progress.classList.remove('completed');
  }

  updateScreenProgress(exercise.closest('.screen'), true);
}


// ─── 7. Progress Bar Globale, Sync Calendario & Reset Allenamento ────
function collectScreenExercisesSnapshot(screen) {
  if (!screen) return [];
  return [...screen.querySelectorAll('.exercise')].map((exercise, idx) => {
    const name = exercise.querySelector('.name')?.textContent.trim() || `Esercizio ${idx + 1}`;
    const tipo = exercise.dataset.exerciseType || (isIncrementExercise(exercise) ? 'ladder' : 'serie_reps');
    const badge = exercise.querySelector('.badge')?.textContent.trim() || '';
    const maxVal = loadMaxProgress(exercise);

    if (isIncrementExercise(exercise)) {
      const dip = loadDipProgress(exercise);
      return {
        index: idx + 1,
        nome: name,
        tipo: 'ladder',
        badge,
        completedSets: dip.finished ? 1 : 0,
        totalSets: 1,
        completed: Boolean(dip.finished),
        maxValue: dip.max > 0 ? dip.max : ( dip.current > 1 ? dip.current - 1 : null ),
        totalRepsCompleted: dip.completedReps || 0,
        targetTotalReps: null,
        ladderPeak: dip.max > 0 ? dip.max : Math.max(0, dip.current - 1),
        ladderTotalReps: dip.completedReps || 0
      };
    }

    if (isTotalRepsExercise(exercise)) {
      const targetTotal = Math.max(1, Number(exercise.dataset.targetTotalReps) || 60);
      const currentReps = loadTotalRepsProgress(exercise);
      return {
        index: idx + 1,
        nome: name,
        tipo: 'reps_totali',
        badge,
        completedSets: currentReps >= targetTotal ? 1 : 0,
        totalSets: 1,
        completed: currentReps >= targetTotal,
        maxValue: maxVal,
        totalRepsCompleted: currentReps,
        targetTotalReps: targetTotal,
        ladderPeak: null,
        ladderTotalReps: null
      };
    }

    const progress = exercise.querySelector('.set-progress');
    const completedSets = progress ? Number(progress.dataset.completed || 0) : 0;
    const totalSets = progress ? Number(progress.dataset.total || 1) : 1;
    const maxSeries = loadMaxSeriesProgress(exercise, totalSets).filter(v => v !== null && v > 0);
    return {
      index: idx + 1,
      nome: name,
      tipo,
      badge,
      completedSets,
      totalSets,
      completed: completedSets >= totalSets && totalSets > 0,
      maxValue: maxVal,
      maxSeries: maxSeries.length > 0 ? maxSeries : null,
      totalRepsCompleted: null,
      targetTotalReps: null,
      ladderPeak: null,
      ladderTotalReps: null
    };
  });
}

function syncScreenToCalendarHistory(screen) {
  if (!screen) return;
  const sheetId = getScreenSheetId(screen);
  if (!sheetId) return;

  const exercises = collectScreenExercisesSnapshot(screen);
  const activeDate = getActiveTrainingDateKey();
  const title = screen.querySelector('.top-bar h2')?.textContent.trim() || sheetId;

  const presetMeta = typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.getPresetMetadata === 'function'
    ? WorkoutStorage.getPresetMetadata(sheetId)
    : null;
  const type = presetMeta ? (presetMeta.category || presetMeta.type || 'pull') : 'custom';

  const completedCount = exercises.filter(ex => ex.completed).length;

  try {
    const raw = localStorage.getItem('calisthenics_sessions_v1');
    const sessions = JSON.parse(raw || '{}');
    const existing = sessions[activeDate] || {};

    sessions[activeDate] = {
      ...existing,
      date: activeDate,
      type: existing.type || type,
      title: title || existing.title || 'Allenamento',
      workoutId: sheetId,
      sheetId: sheetId,
      source: existing.source || 'program',
      summary: {
        completedExercises: completedCount,
        totalExercises: exercises.length
      },
      exercises: exercises
    };

    localStorage.setItem('calisthenics_sessions_v1', JSON.stringify(sessions));
  } catch (e) {
    console.warn('Impossibile sincronizzare la sessione al calendario:', e);
  }

  if (typeof window.refreshCalendar === 'function') {
    window.refreshCalendar();
  }
}

function createProgressBar(screen) {
  const existing = screen.querySelector('.workout-progress');
  if (existing) existing.remove();

  const exercises = screen.querySelectorAll('.exercise .set-progress, .dip-increment-widget, .ex-totalreps-widget');
  if (exercises.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'workout-progress';
  bar.innerHTML = `
    <div class="progress-track">
      <div class="progress-fill"></div>
    </div>
    <span class="progress-label">0/${exercises.length}</span>
  `;

  const topBar = screen.querySelector('.top-bar');
  if (topBar) {
    topBar.after(bar);
  }
}

function updateScreenProgress(screen, syncHistory = false) {
  if (!screen) return;
  const bar = screen.querySelector('.workout-progress');
  if (bar) {
    const allProgress = screen.querySelectorAll('.exercise .set-progress, .dip-increment-widget, .ex-totalreps-widget');
    let completedExercises = 0;
    allProgress.forEach(p => {
      if (Number(p.dataset.completed) >= Number(p.dataset.total)) {
        completedExercises++;
      }
    });

    const total = allProgress.length;
    const fill = bar.querySelector('.progress-fill');
    const label = bar.querySelector('.progress-label');

    if (fill) fill.style.width = total > 0 ? `${(completedExercises / total) * 100}%` : '0%';
    if (label) label.textContent = `${completedExercises}/${total}`;

    if (completedExercises === total && total > 0) {
      bar.classList.add('all-done');
    } else {
      bar.classList.remove('all-done');
    }
  }

  if (syncHistory) {
    syncScreenToCalendarHistory(screen);
  }
}

function resetWorkoutScreen(screen) {
  if (!screen) return;
  const sheetId = getScreenSheetId(screen);
  const activeDate = getActiveTrainingDateKey();
  const overlay = globalTimerOverlay;

  // 0. Interrompi eventuali timer attivi in esecuzione
  if (typeof stopTimer === 'function') {
    stopTimer();
  }

  // 1. Raccogli tutti gli identificatori degli esercizi di questa schermata (inclusi explicit ID, numeri e alias ladder)
  const allExIds = new Set();
  if (sheetId) allExIds.add(sheetId);
  screen.querySelectorAll('.exercise').forEach(exercise => {
    const exId = getExerciseId(exercise, sheetId);
    if (exId) allExIds.add(exId);
    if (exercise.dataset.exerciseId) allExIds.add(exercise.dataset.exerciseId);
    const num = exercise.querySelector('.ex-num')?.textContent.trim();
    if (num && sheetId) allExIds.add(`${sheetId}-${num}`);
  });
  if (sheetId === 'tirata-1') allExIds.add('trazioni-ladder');
  if (sheetId === 'spinta-1') allExIds.add('dip-incremento');

  // Rimuovi da localStorage tutte le chiavi relative a questi esercizi / scheda per la data attiva o chiavi senza data (legacy)
  try {
    const idList = Array.from(allExIds);
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('calisthenics_')) {
        const matchesTarget = idList.some(id => k.includes(id));
        if (matchesTarget) {
          // Se la chiave è specifica della data attiva O è una vecchia chiave senza data YYYY-MM-DD
          if (k.includes(activeDate) || !k.match(/\d{4}-\d{2}-\d{2}/)) {
            keysToRemove.push(k);
          }
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Errore pulizia localStorage per reset:', e);
  }

  // 2. Resetta tutti gli esercizi nel DOM e pulisci puntualmente le chiavi per ciascun esercizio
  screen.querySelectorAll('.exercise').forEach(exercise => {
    const exId = getExerciseId(exercise, sheetId);

    // Pulizia mirata e profonda delle chiavi di storage per questo esercizio
    const directKeys = [
      getDipProgressKey(exercise),
      getDipProgressKey(exercise, activeDate),
      getTotalRepsStorageKey(exercise, sheetId),
      getTotalRepsStorageKey(exercise, sheetId, activeDate),
      getMaxStorageKey(exercise, sheetId),
      getMaxStorageKey(exercise, sheetId, activeDate),
      getStorageKey(exercise, sheetId),
      getStorageKey(exercise, sheetId, activeDate),
      `calisthenics_sets_${activeDate}_${exId}_dip_progress_v2`,
      `calisthenics_sets_${activeDate}_${exId}_dip_progress`,
      `calisthenics_sets_${exId}_dip_progress_v2`,
      `calisthenics_sets_${exId}_dip_progress`,
      `calisthenics_sets_${activeDate}_${exId}`,
      `calisthenics_sets_${exId}`,
      `calisthenics_totalreps_${activeDate}_${exId}`,
      `calisthenics_totalreps_${exId}`,
      `calisthenics_max_${activeDate}_${exId}`,
      `calisthenics_max_${exId}`
    ];
    if (exId === 'trazioni-ladder' || sheetId === 'tirata-1') {
      directKeys.push(
        `calisthenics_sets_${activeDate}_trazioni-ladder_dip_progress_v2`,
        `calisthenics_sets_trazioni-ladder_dip_progress_v2`,
        `calisthenics_sets_${activeDate}_trazioni-ladder`,
        `calisthenics_sets_trazioni-ladder`
      );
    }
    if (exId === 'dip-incremento' || sheetId === 'spinta-1') {
      directKeys.push(
        `calisthenics_sets_${activeDate}_dip-incremento_dip_progress_v2`,
        `calisthenics_sets_dip-incremento_dip_progress_v2`,
        `calisthenics_sets_${activeDate}_dip-incremento`,
        `calisthenics_sets_dip-incremento`
      );
    }
    directKeys.forEach(k => {
      if (k) localStorage.removeItem(k);
    });

    // A. Ladder
    if (isIncrementExercise(exercise)) {
      exercise.classList.remove('exercise-done');
      const widget = exercise.querySelector('.dip-increment-widget');
      if (widget) widget.remove();
      setupDipIncrement(exercise, overlay);
      return;
    }

    // B. Reps Totali
    if (isTotalRepsExercise(exercise)) {
      exercise.classList.remove('exercise-done');
      saveTotalRepsProgress(exercise, 0);
      const widget = exercise.querySelector('.ex-totalreps-widget');
      if (widget) widget.remove();
      setupTotalRepsWidget(exercise);
      return;
    }

    // C. Max inputs (multipli o singoli)
    saveMaxSeriesProgress(exercise, []);
    exercise.querySelectorAll('.ex-max-input').forEach(inp => {
      inp.value = '';
    });

    // D. Progress serie (0 / total)
    const progress = exercise.querySelector('.set-progress');
    if (progress) {
      const total = progress.dataset.total || '1';
      progress.dataset.completed = '0';
      progress.textContent = `0/${total}`;
      progress.classList.remove('completed');
      progress.setAttribute('aria-label', `Serie completate: 0 di ${total}`);
    }
    exercise.classList.remove('exercise-done');
    saveSetProgress(exercise, 0);
  });

  // 3. Ricalcola dipendenze Max/2 e barra di completamento
  updateMaxHalfDependencies(screen);
  updateScreenProgress(screen, false);

  // 4. Resetta RPE e note per la sessione odierna
  if (typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.saveSessionFeedback === 'function') {
    WorkoutStorage.saveSessionFeedback(activeDate, { rpe: null, notes: '' });
  }
  updateAthleteSessionPanel(screen);

  // 5. Resetta la sessione nel registro calendario
  try {
    const rawSessions = localStorage.getItem('calisthenics_sessions_v1');
    if (rawSessions) {
      const sessionsMap = JSON.parse(rawSessions);
      if (sessionsMap && sessionsMap[activeDate]) {
        const cur = sessionsMap[activeDate];
        if (cur.sheetId === sheetId || cur.workoutId === sheetId) {
          cur.summary = { completedExercises: 0, totalExercises: screen.querySelectorAll('.exercise').length };
          if (Array.isArray(cur.exercises)) {
            cur.exercises.forEach(ex => {
              ex.completed = false;
              ex.completedSets = 0;
              ex.maxValue = null;
              ex.maxSeries = null;
              ex.totalRepsCompleted = 0;
              ex.ladderTotalReps = 0;
              ex.ladderPeak = 0;
            });
          }
          cur.rpe = null;
          cur.notes = '';
          localStorage.setItem('calisthenics_sessions_v1', JSON.stringify(sessionsMap));
        }
      }
    }
  } catch (e) {
    console.warn('Errore reset sessione calendario:', e);
  }

  // 6. Ridisegna il calendario e le statistiche
  if (typeof window.refreshCalendar === 'function') {
    window.refreshCalendar();
  }
}
window.resetWorkoutScreen = resetWorkoutScreen;

function createResetButton(screen, overlay) {
  const existing = screen.querySelector('.reset-workout-btn');
  if (existing) existing.remove();

  const exercises = screen.querySelectorAll('.exercise');
  if (exercises.length === 0) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reset-workout-btn';
  btn.innerHTML = '↺ Reset allenamento';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();

    // 1-Tap reset immediato: azzera tutto istantaneamente
    resetWorkoutScreen(screen);

    // Feedback aptico e visivo immediato
    if ('vibrate' in navigator) navigator.vibrate([40, 60]);
    showToast('↺ Scheda azzerata: pronta per iniziare!');
  });

  const sessionPanel = screen.querySelector('.athlete-session-panel');
  if (sessionPanel) {
    sessionPanel.after(btn);
  } else {
    const exerciseList = screen.querySelector('.exercise-list');
    if (exerciseList) {
      exerciseList.after(btn);
    }
  }
}

function generateWorkoutReportText(screen) {
  const sheetId = getScreenSheetId(screen);
  const title = screen.querySelector('.top-bar h2')?.textContent.trim() || sheetId;
  const activeDate = getActiveTrainingDateKey();
  const exercises = collectScreenExercisesSnapshot(screen);
  
  const feedback = typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.getSessionFeedback === 'function'
    ? WorkoutStorage.getSessionFeedback(activeDate)
    : { rpe: null, notes: '' };

  const totalExercises = exercises.length;
  const completedExercises = exercises.filter(e => e.completed).length;

  let text = `🏋️‍♂️ CaliTracker — Report Allenamento\n`;
  text += `📅 Data: ${activeDate}\n`;
  text += `📋 Scheda: ${title} (${completedExercises}/${totalExercises} completati)\n`;
  if (feedback.rpe) {
    const rpeLabels = {
      '6': '6 (Facile)',
      '7': '7 (Medio)',
      '8': '8 (Impegnativo)',
      '9': '9 (Molto duro)',
      '10': '10 (Cedimento)'
    };
    text += `⚡ Sforzo: RPE ${rpeLabels[String(feedback.rpe)] || feedback.rpe + '/10'}\n`;
  }
  text += `\n💪 Esercizi:\n`;
  exercises.forEach(ex => {
    let detail = '';
    if (ex.tipo === 'ladder') {
      const peak = ex.ladderPeak || 0;
      const tot = ex.ladderTotalReps || 0;
      detail = `Picco ${peak} rep • ${tot} reps totali`;
    } else if (ex.tipo === 'reps_totali') {
      detail = `${ex.totalRepsCompleted || 0}/${ex.targetTotalReps || 60} reps`;
    } else {
      detail = `${ex.completedSets}/${ex.totalSets} serie`;
      if (Array.isArray(ex.maxSeries) && ex.maxSeries.length > 1) {
        detail += ` (Serie: ${ex.maxSeries.join(' - ')})`;
      } else if (ex.maxValue) {
        detail += ` (Max: ${ex.maxValue})`;
      }
    }
    const check = ex.completed ? '✓' : '•';
    text += `  ${check} ${ex.nome}: ${detail}\n`;
  });

  if (feedback.notes) {
    text += `\n📝 Note Atleta:\n${feedback.notes}\n`;
  }
  text += `\nGenerato con CaliTracker PWA`;
  return text;
}

function updateAthleteSessionPanel(screen) {
  if (!screen) return;
  const panel = screen.querySelector('.athlete-session-panel');
  if (!panel) return;

  const activeDate = getActiveTrainingDateKey();
  const dateBadge = panel.querySelector('.session-date-badge');
  if (dateBadge) dateBadge.textContent = activeDate;

  const feedback = typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.getSessionFeedback === 'function'
    ? WorkoutStorage.getSessionFeedback(activeDate)
    : { rpe: null, notes: '' };

  const rpePills = panel.querySelectorAll('.rpe-pill');
  rpePills.forEach(pill => {
    const val = Number(pill.dataset.rpe);
    pill.classList.toggle('active', val === Number(feedback.rpe));
  });

  const textarea = panel.querySelector('.session-notes-input');
  if (textarea && document.activeElement !== textarea) {
    textarea.value = feedback.notes || '';
  }
}

function createAthleteSessionPanel(screen) {
  const existing = screen.querySelector('.athlete-session-panel');
  if (existing) existing.remove();

  const exercises = screen.querySelectorAll('.exercise');
  if (exercises.length === 0) return;

  const activeDate = getActiveTrainingDateKey();
  const feedback = typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.getSessionFeedback === 'function'
    ? WorkoutStorage.getSessionFeedback(activeDate)
    : { rpe: null, notes: '' };

  const panel = document.createElement('div');
  panel.className = 'athlete-session-panel';
  panel.innerHTML = `
    <div class="session-panel-header">
      <div class="session-panel-title">
        <span class="session-panel-icon">📝</span>
        <strong>Diario & Feedback Sessione</strong>
      </div>
      <span class="session-date-badge">${activeDate}</span>
    </div>

    <div class="session-rpe-group">
      <label class="session-group-label">Sforzo percepito (RPE):</label>
      <div class="rpe-pill-selector">
        <button type="button" class="rpe-pill" data-rpe="6">6 • Facile</button>
        <button type="button" class="rpe-pill" data-rpe="7">7 • Medio</button>
        <button type="button" class="rpe-pill" data-rpe="8">8 • Duro</button>
        <button type="button" class="rpe-pill" data-rpe="9">9 • Quasi Max</button>
        <button type="button" class="rpe-pill" data-rpe="10">10 • Cedimento</button>
      </div>
    </div>

    <div class="session-notes-group">
      <label class="session-group-label" for="notes-${screen.id}">Note allenamento (zavorre, sensazioni, dolori):</label>
      <textarea id="notes-${screen.id}" class="session-notes-input" placeholder="Es. +5kg su Dip, sentita stanchezza alle spalle, tempi di recupero rispettati..." rows="2">${escapeHtml(feedback.notes || '')}</textarea>
    </div>

    <div class="session-panel-actions">
      <button type="button" class="session-save-btn">💾 Salva note</button>
      <button type="button" class="session-share-btn">📋 Copia report allenamento</button>
    </div>
  `;

  // Gestione RPE pills
  const rpePills = panel.querySelectorAll('.rpe-pill');
  rpePills.forEach(pill => {
    const rpeVal = Number(pill.dataset.rpe);
    if (rpeVal === Number(feedback.rpe)) pill.classList.add('active');

    pill.addEventListener('click', () => {
      const isAlreadyActive = pill.classList.contains('active');
      rpePills.forEach(p => p.classList.remove('active'));
      const newRpe = isAlreadyActive ? null : rpeVal;
      if (!isAlreadyActive) pill.classList.add('active');

      if (typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.saveSessionFeedback === 'function') {
        const curDate = getActiveTrainingDateKey();
        const curNotes = panel.querySelector('.session-notes-input')?.value || '';
        WorkoutStorage.saveSessionFeedback(curDate, { rpe: newRpe, notes: curNotes });
        syncScreenToCalendarHistory(screen);
      }
      if ('vibrate' in navigator) navigator.vibrate(10);
    });
  });

  // Gestione Note (salvataggio su blur, change e su pulsante)
  const notesTextarea = panel.querySelector('.session-notes-input');
  const saveNotes = () => {
    const curDate = getActiveTrainingDateKey();
    const curRpeEl = panel.querySelector('.rpe-pill.active');
    const curRpe = curRpeEl ? Number(curRpeEl.dataset.rpe) : null;
    const curNotes = notesTextarea.value.trim();
    if (typeof WorkoutStorage !== 'undefined' && typeof WorkoutStorage.saveSessionFeedback === 'function') {
      WorkoutStorage.saveSessionFeedback(curDate, { rpe: curRpe, notes: curNotes });
      syncScreenToCalendarHistory(screen);
      showToast('Note sessione salvate');
    }
  };

  notesTextarea.addEventListener('change', saveNotes);
  panel.querySelector('.session-save-btn').addEventListener('click', saveNotes);

  // Gestione Copia Report
  panel.querySelector('.session-share-btn').addEventListener('click', () => {
    const reportText = generateWorkoutReportText(screen);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(reportText).then(() => {
        showToast('📋 Report copiato negli appunti! Pronto per WhatsApp/Coach');
      }).catch(() => {
        window.prompt('Copia il report:', reportText);
      });
    } else {
      window.prompt('Copia il report:', reportText);
    }
    if ('vibrate' in navigator) navigator.vibrate(15);
  });

  const exerciseList = screen.querySelector('.exercise-list');
  if (exerciseList) {
    exerciseList.after(panel);
  }
}


// ─── 8. Motore Unificato JSON → DOM Card & Inizializzazione ──────────
function formatSecondsCompact(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins > 0 && rem > 0) return `${mins}'${String(rem).padStart(2, '0')}"`;
  if (mins > 0) return `${mins}'`;
  return `${rem}"`;
}

function isIsometricHoldName(nome) {
  if (typeof nome !== 'string') return false;
  const n = nome.toLowerCase();
  const hasIsoKeyword = /lever|planche|plank|hollow|barchetta|hold|tenuta|verticale|handstand|frog\s*stand|elephant\s*stand|l-sit|v-sit|dead\s*hang|german\s*hang|\biso\b/i.test(n);
  const hasDynamicKeyword = /raise|pull|push|dip|piegament|trazion|hspu|press|negativ|alzat|apertur|skin\s*the\s*cat|ice\s*cream|muscle\s*up|squat|pistol|curl/i.test(n);
  return hasIsoKeyword && !hasDynamicKeyword;
}

function formatJsonExerciseBadge(ex) {
  switch (ex.tipo) {
    case 'serie_reps': {
      const isoMatch = typeof ex.note === 'string' ? ex.note.match(/\+\s*(\d+"\s*Iso)/i) : null;
      const isoSuffix = isoMatch ? ` + ${isoMatch[1]}` : (ex.isometria_sec ? ` + ${ex.isometria_sec}" Iso` : '');
      if (ex.reps_min && ex.reps_max && ex.reps_min !== ex.reps_max) {
        return `${ex.serie}x${ex.reps_min}-${ex.reps_max}${isoSuffix}`;
      }
      const reps = ex.reps ?? ex.reps_min ?? ex.reps_max ?? 1;
      return `${ex.serie}x${reps}${isoSuffix}`;
    }
    case 'serie_tenuta':
      return `${ex.serie}x${ex.durata_sec || ex.tenuta_sec}"`;
    case 'max': {
      if (typeof ex.note === 'string' && /1\s*x\s*max.*4\s*x\s*max\s*\/\s*2/i.test(ex.note)) {
        return '1xMax 4xMax/2';
      }
      const isSec = ex.metrica === 'secondi' || isIsometricHoldName(ex.nome);
      const unit = isSec ? ' (sec)' : '';
      const prefix = ex.serie && ex.serie > 1 ? `${ex.serie} x ` : (ex.serie === 1 ? '1 x ' : '');
      return `${prefix}Max${unit}`.trim();
    }
    case 'max_range': {
      let rangePrefix = '';
      if (ex.serie_min && ex.serie_max) {
        rangePrefix = ex.serie_min === ex.serie_max ? `${ex.serie_min} x ` : `${ex.serie_min}-${ex.serie_max} x `;
      } else if (ex.serie) {
        rangePrefix = `${ex.serie} x `;
      }
      if (ex.min !== undefined && ex.max !== undefined) {
        const unit = (ex.unita === 'secondi' || isIsometricHoldName(ex.nome)) ? '"' : ' reps';
        return `${rangePrefix}Max (${ex.min}-${ex.max}${unit})`.trim();
      }
      return `${rangePrefix}Max`.trim();
    }
    case 'max_meta_prec': {
      const prefix = ex.serie && ex.serie > 1 ? `${ex.serie} x ` : (ex.serie === 1 ? '1 x ' : '');
      return `${prefix}Max/2 Prec`.trim();
    }
    case 'piramidale': {
      const seq = Array.isArray(ex.ripetizioni_per_gruppo)
        ? ex.ripetizioni_per_gruppo.join('-')
        : (Array.isArray(ex.sequenza) ? ex.sequenza.join('-') : '');
      const groups = ex.gruppi && ex.gruppi > 1 ? `${ex.gruppi} X (${seq})` : seq;
      return groups || 'Piramidale';
    }
    case 'ladder':
      return `Incrementi di +${ex.incremento || 1} rep`;
    case 'reps_totali':
      return `${ex.totale_reps} Reps Totali${ex.tecnica ? ' tecniche' : ''}`;
    case 'libero':
      return ex.testo_libero || 'Schema libero';
    default:
      return 'Serie';
  }
}

function computeJsonExerciseTotalSets(ex) {
  if (!ex) return null;
  switch (ex.tipo) {
    case 'serie_reps':
    case 'serie_tenuta':
      return Math.max(1, Number(ex.serie) || 1);
    case 'max':
      if (typeof ex.note === 'string' && /1\s*x\s*max.*4\s*x\s*max\s*\/\s*2/i.test(ex.note)) {
        return 5;
      }
      return Math.max(1, Number(ex.serie) || 1);
    case 'max_meta_prec':
      return Math.max(1, Number(ex.serie) || 1);
    case 'max_range':
      return Math.max(1, Number(ex.serie_max || ex.serie || ex.serie_min) || 1);
    case 'libero':
      if (typeof ex.note === 'string' && /1\s*x\s*max.*4\s*x\s*max\s*\/\s*2/i.test(ex.note)) {
        return 5;
      }
      if (typeof ex.testo_libero === 'string' && /1\s*x\s*max.*4\s*x\s*max\s*\/\s*2/i.test(ex.testo_libero)) {
        return 5;
      }
      if (ex.serie) {
        return Math.max(1, Number(ex.serie) || 1);
      }
      return 1;
    case 'piramidale':
      return Math.max(1, Number(ex.gruppi) || 1);
    case 'ladder':
    case 'reps_totali':
      return null;
    default:
      return Math.max(1, Number(ex.serie) || 1);
  }
}

function buildExerciseElementFromJson(ex, index, sheetId) {
  const card = document.createElement('div');
  card.className = 'exercise';
  card.dataset.exerciseId = `${sheetId}-${index + 1}`;
  card.dataset.exerciseType = ex.tipo || 'serie_reps';

  const badgeText = formatJsonExerciseBadge(ex);
  card.dataset.baseBadge = badgeText;

  const totalSets = computeJsonExerciseTotalSets(ex);
  if (totalSets !== null) {
    card.dataset.totalSets = String(totalSets);
  }

  if (ex.tipo === 'piramidale' && ex.gruppi && ex.gruppi > 1) {
    card.dataset.hasGroups = 'true';
  }

  if (ex.tipo === 'max' && (ex.metrica === 'secondi' || isIsometricHoldName(ex.nome))) {
    card.dataset.maxUnit = 'secondi';
  } else if (ex.tipo === 'max_range' && (ex.unita === 'secondi' || isIsometricHoldName(ex.nome))) {
    card.dataset.maxUnit = 'secondi';
  }

  if (ex.tipo === 'reps_totali') {
    card.dataset.targetTotalReps = String(ex.totale_reps || 60);
  }

  const holdSec = ex.durata_sec || ex.tenuta_sec;
  if (ex.tipo === 'serie_tenuta' && holdSec) {
    card.dataset.holdSeconds = String(holdSec);
  } else if (typeof ex.note === 'string') {
    const holdMatch = ex.note.match(/\+\s*(\d+)\s*"\s*Iso/i);
    if (holdMatch) {
      card.dataset.holdSeconds = holdMatch[1];
    }
  }

  if (ex.tipo === 'ladder') {
    card.dataset.incrementLadder = 'true';
    card.dataset.ladderStep = String(ex.incremento || 1);
    if (ex.riposo_serie_sec) {
      card.dataset.ladderRestFixed = String(ex.riposo_serie_sec);
    }
    if (ex.recupero_per_rep_sec) {
      card.dataset.ladderRestPerRep = String(ex.recupero_per_rep_sec);
    }
    if (ex.recupero_massimo_sec) {
      card.dataset.ladderRestMax = String(ex.recupero_massimo_sec);
    }
    card.dataset.ladderDescent = ex.discesa === false ? 'false' : 'true';
    if ((ex.recupero_per_rep_sec === 20 || !ex.recupero_per_rep_sec) && (ex.recupero_massimo_sec === 80 || !ex.recupero_massimo_sec)) {
      card.dataset.dipIncrement = 'true';
    }
  }

  const metaSpans = [];
  if (ex.riposo_serie_sec) {
    metaSpans.push(`<span>Riposo tra le serie: ${formatSecondsCompact(ex.riposo_serie_sec)}</span>`);
  }
  if (ex.riposo_gradino_sec) {
    metaSpans.push(`<span>Riposo gradino: ${formatSecondsCompact(ex.riposo_gradino_sec)}</span>`);
  }
  if (ex.riposo_gruppo_sec) {
    metaSpans.push(`<span>Riposo tra i gruppi: ${formatSecondsCompact(ex.riposo_gruppo_sec)}</span>`);
  }
  if (ex.tipo === 'ladder') {
    if (ex.recupero_per_rep_sec === 30 && ex.recupero_massimo_sec === 90) {
      metaSpans.push(`<span>Riposo: 30" (1 rep), 1' (2 rep), 1' 30" da 3 rep in poi</span>`);
    } else if (ex.recupero_per_rep_sec) {
      const maxCap = ex.recupero_massimo_sec ? `, max ${formatSecondsCompact(ex.recupero_massimo_sec)}` : '';
      metaSpans.push(`<span>Recupero: ${ex.recupero_per_rep_sec}" per rep${maxCap}</span>`);
    }
  }
  const endExerciseRestSec = ex.riposo_esercizio_sec || ex.riposo_fine_esercizio_sec || 150;
  if (endExerciseRestSec > 0) {
    metaSpans.push(`<span>Riposo fine esercizio: ${formatSecondsCompact(endExerciseRestSec)}</span>`);
  }
  if (ex.fermo_sec) {
    metaSpans.push(`<span>Fermo: ${ex.fermo_sec}"</span>`);
  }

  card.innerHTML = `
    <div class="ex-head">
      <span class="ex-num">${index + 1}</span>
      <div class="ex-title-wrap">
        <div class="name">${escapeHtml(ex.nome || `Esercizio ${index + 1}`)}</div>
        <span class="badge">${escapeHtml(badgeText)}</span>
      </div>
    </div>
    ${ex.note ? `<div class="ex-note">${escapeHtml(ex.note)}</div>` : ''}
    ${metaSpans.length > 0 ? `<div class="ex-meta">${metaSpans.join('')}</div>` : ''}
  `;

  return card;
}

function wireExerciseElement(exercise, overlay) {
  if (isIncrementExercise(exercise)) {
    setupDipIncrement(exercise, overlay);
  }
  if (isTotalRepsExercise(exercise)) {
    setupTotalRepsWidget(exercise);
  }
  setupMaxInputWidget(exercise);
  setupSetProgress(exercise);

  const meta = exercise.querySelector('.ex-meta');
  const holdSeconds = Number(exercise.dataset.holdSeconds || 0);

  if (isIncrementExercise(exercise)) {
    // Anche per un esercizio ladder, se c'è un riposo fine esercizio aggiungiamo il bottone
    const endRestSpan = meta ? [...meta.querySelectorAll('span')].find(s => /fine esercizio/i.test(s.textContent)) : null;
    if (endRestSpan) {
      const controls = document.createElement('div');
      controls.className = 'rest-controls';
      parseRestTimes(endRestSpan.textContent).forEach(time => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rest-button';
        button.textContent = `Avvia ${time.prefix || 'Riposo fine esercizio'} (${formatTime(time.seconds)})`;
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          startTimer(time.seconds, time.prefix || 'Riposo fine esercizio', overlay);
          if ('vibrate' in navigator) navigator.vibrate(12);
        });
        controls.appendChild(button);
      });
      if (controls.children.length > 0) exercise.appendChild(controls);
    }
    setupExerciseAccordion(exercise);
    return;
  }

  const controls = document.createElement('div');
  controls.className = 'rest-controls';

  if (holdSeconds > 0) {
    const holdBtn = document.createElement('button');
    holdBtn.type = 'button';
    holdBtn.className = 'rest-button hold-timer-button';
    holdBtn.textContent = `⏱️ Avvia Tenuta (${formatTime(holdSeconds)})`;
    holdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startTimer(holdSeconds, `Tenuta Isometrica (${holdSeconds}s)`, overlay);
      if ('vibrate' in navigator) navigator.vibrate(12);
    });
    controls.appendChild(holdBtn);
  }

  const isClusterGroup = isGroupExercise(exercise);

  if (meta) {
    meta.querySelectorAll('span').forEach(span => {
      const text = span.textContent;
      const isEndExerciseRest = /fine\s+esercizio/i.test(text);
      const isGroupRest = /\bgrupp(?:o|i)\b/i.test(text);
      const isStepRest = isClusterGroup && (/\bgradin[oi]\b/i.test(text) || (/\b(?:tra\s+(?:le\s+)?serie|riposo\s+serie)\b/i.test(text) && !isGroupRest));
      const isSetRest = !isClusterGroup && /\b(?:riposo|tra)[^]*\b(?:serie|gruppi|gradino)\b/i.test(text) && !isEndExerciseRest;

      parseRestTimes(text).forEach(time => {
        const button = document.createElement('button');
        let label = time.prefix;
        if (!label) {
          if (isEndExerciseRest) label = 'Riposo fine esercizio';
          else if (isGroupRest) label = 'Concludi gruppo & Riposo';
          else if (isStepRest) label = 'Riposo gradino';
          else label = 'Riposo';
        }

        button.type = 'button';
        button.className = 'rest-button';
        if (isGroupRest) {
          button.classList.add('group-rest-button');
        }
        button.textContent = `Avvia ${label} (${formatTime(time.seconds)})`;

        button.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isIncrementExercise(exercise) && !isTotalRepsExercise(exercise)) {
            if (isClusterGroup) {
              // Nei piramidali a gruppi, il contatore 0/4 scala SOLO quando si conclude il gruppo o l'esercizio!
              if (isGroupRest) {
                completeSet(exercise);
              } else if (isEndExerciseRest) {
                const progress = exercise.querySelector('.set-progress');
                if (progress) {
                  const completed = Number(progress.dataset.completed || 0);
                  const total = Number(progress.dataset.total || 1);
                  if (completed < total) {
                    completeSet(exercise);
                  }
                }
              }
              // Se è isStepRest (es. riposo gradino 20"), NON chiamiamo completeSet! Il contatore 0/4 non scala!
            } else {
              // Esercizi standard (serie x reps)
              if (isSetRest) {
                completeSet(exercise);
              } else if (isEndExerciseRest) {
                const progress = exercise.querySelector('.set-progress');
                if (progress) {
                  const completed = Number(progress.dataset.completed || 0);
                  const total = Number(progress.dataset.total || 1);
                  if (completed < total && (total === 1 || completed === total - 1)) {
                    completeSet(exercise);
                  }
                }
              }
            }
          }
          startTimer(time.seconds, label, overlay);
          if ('vibrate' in navigator) navigator.vibrate(12);
        });
        controls.appendChild(button);
      });
    });

    if (isClusterGroup && !controls.querySelector('.group-rest-button')) {
      const groupTimeSec = 120;
      const groupBtn = document.createElement('button');
      groupBtn.type = 'button';
      groupBtn.className = 'rest-button group-rest-button';
      groupBtn.textContent = `Avvia Concludi gruppo & Riposo (${formatTime(groupTimeSec)})`;
      groupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        completeSet(exercise);
        startTimer(groupTimeSec, 'Riposo tra i gruppi', overlay);
        if ('vibrate' in navigator) navigator.vibrate(12);
      });
      const endBtn = Array.from(controls.children).find(b => /fine\s+esercizio/i.test(b.textContent));
      if (endBtn) {
        controls.insertBefore(groupBtn, endBtn);
      } else {
        controls.appendChild(groupBtn);
      }
    }
  }

  if (controls.children.length > 0) {
    exercise.appendChild(controls);
  }
  setupExerciseAccordion(exercise);
}

function renderWorkoutScreenFromJson(screen, sheetId, overlay) {
  if (!screen || typeof WorkoutStorage === 'undefined') return false;
  const workout = typeof WorkoutStorage.getEffectiveWorkout === 'function'
    ? WorkoutStorage.getEffectiveWorkout(sheetId)
    : WorkoutStorage.getWorkout(sheetId);

  if (!workout || !Array.isArray(workout.esercizi) || workout.esercizi.length === 0) {
    return false;
  }

  screen.dataset.sheetId = sheetId;
  const titleEl = screen.querySelector('.top-bar h2');
  if (titleEl && workout.titolo) {
    titleEl.textContent = workout.titolo;
  }

  const listEl = screen.querySelector('.exercise-list');
  if (!listEl) return false;

  const programmingNote = listEl.querySelector('.programming-note');
  listEl.replaceChildren();
  if (programmingNote) {
    listEl.appendChild(programmingNote);
  }

  workout.esercizi.forEach((ex, index) => {
    const card = buildExerciseElementFromJson(ex, index, sheetId);
    listEl.appendChild(card);
  });

  listEl.querySelectorAll('.exercise').forEach(exercise => {
    wireExerciseElement(exercise, overlay);
  });

  updateMaxHalfDependencies(screen);
  createProgressBar(screen);
  createAthleteSessionPanel(screen);
  createResetButton(screen, overlay);
  updateScreenProgress(screen, false);
  screen.dataset.hydrated = 'true';
  return true;
}

function hydrateWorkoutScreen(screen) {
  if (!screen || screen.dataset.hydrated === 'true') return;
  if (!globalTimerOverlay && typeof createTimerOverlay === 'function') {
    globalTimerOverlay = createTimerOverlay();
  }
  const overlay = globalTimerOverlay;
  if (!overlay) return;

  const sheetId = screen.dataset.sheetId || (
    typeof WorkoutStorage !== 'undefined' &&
    typeof WorkoutStorage.isPresetSheetId === 'function' &&
    WorkoutStorage.isPresetSheetId(screen.id)
      ? screen.id
      : null
  );

  if (sheetId && renderWorkoutScreenFromJson(screen, sheetId, overlay)) {
    screen.dataset.hydrated = 'true';
    return;
  }

  const hasExercises = screen.querySelectorAll('.exercise').length > 0;
  screen.querySelectorAll('.exercise').forEach(exercise => {
    wireExerciseElement(exercise, overlay);
  });

  if (hasExercises) {
    updateMaxHalfDependencies(screen);
    createProgressBar(screen);
    createAthleteSessionPanel(screen);
    createResetButton(screen, overlay);
    updateScreenProgress(screen, false);
  }
  screen.dataset.hydrated = 'true';
}
window.hydrateWorkoutScreen = hydrateWorkoutScreen;

let idleHydrationScheduled = false;
function scheduleIdleHydration() {
  if (idleHydrationScheduled) return;
  idleHydrationScheduled = true;

  const runBackgroundHydration = () => {
    const screens = Array.from(document.querySelectorAll('.screen')).filter(s =>
      s.id !== 'workout-editor' &&
      s.id !== 'menu' &&
      s.id !== 'sub-programma' &&
      s.id !== 'sub-spinta' &&
      s.id !== 'sub-tirata' &&
      s.id !== 'sub-mie-schede'
    );
    let idx = 0;
    function hydrateStep() {
      if (idx >= screens.length) {
        scheduleEditorWarmup();
        return;
      }
      const s = screens[idx++];
      if (s && s.dataset.hydrated !== 'true' && (s.querySelector('.exercise-list') || s.dataset.sheetId)) {
        hydrateWorkoutScreen(s);
      }
      if (idx < screens.length) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(hydrateStep, { timeout: 800 });
        } else {
          setTimeout(hydrateStep, 50);
        }
      } else {
        scheduleEditorWarmup();
      }
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(hydrateStep, { timeout: 1500 });
    } else {
      setTimeout(hydrateStep, 100);
    }
  };

  const isIntroPlaying = document.documentElement.classList.contains('cali-intro-playing');
  if (isIntroPlaying) {
    window.addEventListener('calitrack:intro-done', runBackgroundHydration, { once: true });
    setTimeout(runBackgroundHydration, 3200);
  } else {
    setTimeout(runBackgroundHydration, 150);
  }
}

function scheduleEditorWarmup() {
  const warmup = () => {
    ensureEditorIframeLoaded();
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmup, { timeout: 3000 });
  } else {
    setTimeout(warmup, 1500);
  }
}

function setupRestTimers() {
  const overlay = createTimerOverlay();
  globalTimerOverlay = overlay;

  // Idrata subito la schermata attiva se l'app è stata aperta direttamente con un hash (es. #spinta-1)
  const currentActive = document.querySelector('.screen.active');
  if (currentActive && currentActive.id !== 'menu') {
    hydrateWorkoutScreen(currentActive);
  }

  // Pre-idrata le restanti schede solo in idle time a intro terminata
  scheduleIdleHydration();
}

document.addEventListener('DOMContentLoaded', setupRestTimers);

document.addEventListener('visibilitychange', () => {
  if (activeTimer) {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }
    updateTimerDisplay();
  }
});