// ═══════════════════════════════════════════════════════════════════════
// APP SCHEDE ALLENAMENTO CALISTHENICS
// ═══════════════════════════════════════════════════════════════════════

// ─── 1. Navigazione tra le schermate (History API & Slide) ───────────
const NAV_PARENTS = {
  'sub-programma': 'menu',
  'sub-spinta': 'sub-programma',
  'sub-tirata': 'sub-programma',
  'spinta-1': 'sub-spinta',
  'spinta-2': 'sub-spinta',
  'tirata-1': 'sub-tirata',
  'tirata-2': 'sub-tirata',
  'tirata-3': 'sub-tirata',
  'tirata-4': 'sub-tirata'
};

const SCREEN_LEVELS = {
  'menu': 0,
  'sub-programma': 1,
  'sub-spinta': 1,
  'sub-tirata': 1,
  'spinta-1': 2,
  'spinta-2': 2,
  'tirata-1': 2,
  'tirata-2': 2,
  'tirata-3': 2,
  'tirata-4': 2
};

function getActiveScreenId() {
  const active = document.querySelector('.screen.active');
  return active ? active.id : 'menu';
}

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
    { freq: 880, dur: 0.22, pause: 0.08 },
    { freq: 660, dur: 0.22, pause: 0.08 },
    { freq: 880, dur: 0.35, pause: 0 }
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
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.75;
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

async function beep() {
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
  [880, 660, 880].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startTime + index * 0.35;
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.28);
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

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !activeTimer) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (error) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}


// ─── 5. Gestione Interfaccia Timer di Riposo ──────────────────────────
function createTimerOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'restTimer';
  overlay.className = 'rest-timer';
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="rest-timer-ring-wrap">
      <svg class="rest-timer-ring" viewBox="0 0 120 120">
        <circle class="ring-bg" cx="60" cy="60" r="54" />
        <circle class="ring-fg" cx="60" cy="60" r="54" />
      </svg>
      <div class="rest-timer-countdown">0:00</div>
    </div>
    <div class="rest-timer-label"></div>
    <div class="rest-timer-actions">
      <button type="button" class="timer-add">+30s</button>
      <button type="button" class="timer-pause" aria-pressed="false">Pausa</button>
      <button type="button" class="timer-skip">Salta</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.timer-add').addEventListener('click', () => {
    if (activeTimer) {
      activeTimer.endTime += 30000;
      activeTimer.totalSeconds += 30;
      if (activeTimer.paused) activeTimer.remainingMs += 30000;
      updateTimerDisplay();
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

  // Effetto pulse visivo negli ultimi 5 secondi
  if (remaining <= 5 && remaining > 0) {
    countdownEl.classList.add('pulse');
  } else {
    countdownEl.classList.remove('pulse');
  }

  if (remaining === 0) {
    const completedLabel = activeTimer.label || 'Riposo';
    stopTimer();

    // Suono via Web Audio API + fallback tramite elemento Audio bufferizzato
    void beep();
    if (alarmAudio) {
      try {
        alarmAudio.currentTime = 0;
        alarmAudio.play().catch(() => {});
      } catch (e) {}
    }

    // Vibrazione tattile
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300, 150, 400]);

    // Notifica di sistema push
    sendTimerNotification(completedLabel);
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
    remainingMs: seconds * 1000
  };
  overlay.querySelector('.rest-timer-label').textContent = label;

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

  releaseWakeLock();
}


// ─── 6. Contatore Serie con Persistenza localStorage ──────────────────
const DETAILS_PREFIX = 'calisthenics_details_';

function getExerciseId(exercise, screenId) {
  const explicitId = exercise.dataset.exerciseId;
  if (explicitId) return explicitId;

  const number = exercise.querySelector('.ex-num')?.textContent.trim();
  return number ? `${screenId}-${number}` : 'unknown';
}

function getLegacyStorageKey(exercise, screenId, prefix) {
  const name = exercise.querySelector('.name');
  return `${prefix}${screenId}_${name ? name.textContent.trim() : ''}`;
}

function getStorageKey(exercise, screenId) {
  return `calisthenics_sets_${getExerciseId(exercise, screenId)}`;
}

function getDetailsStorageKey(exercise, screenId) {
  return `${DETAILS_PREFIX}${getExerciseId(exercise, screenId)}`;
}

function saveSetProgress(exercise, completed) {
  const screen = exercise.closest('.screen');
  if (!screen) return;
  const key = getStorageKey(exercise, screen.id);
  try {
    localStorage.setItem(key, String(completed));
  } catch (error) {
    console.error('Impossibile salvare il progresso esercizio:', error);
  }
}

function loadExerciseDetails(exercise) {
  const screen = exercise.closest('.screen');
  if (!screen) return { sets: [], notes: '', history: [] };
  try {
    const currentKey = getDetailsStorageKey(exercise, screen.id);
    const legacyKey = getLegacyStorageKey(exercise, screen.id, DETAILS_PREFIX);
    const savedValue = localStorage.getItem(currentKey) ?? localStorage.getItem(legacyKey) ?? '{}';
    const saved = JSON.parse(savedValue);
    if (!localStorage.getItem(currentKey) && savedValue !== '{}') {
      localStorage.setItem(currentKey, savedValue);
    }
    return {
      sets: Array.isArray(saved.sets) ? saved.sets : [],
      notes: typeof saved.notes === 'string' ? saved.notes : '',
      history: Array.isArray(saved.history) ? saved.history : []
    };
  } catch (error) {
    console.warn('Dettagli esercizio non leggibili:', error);
    return { sets: [], notes: '', history: [] };
  }
}

function saveExerciseDetails(exercise, details) {
  const screen = exercise.closest('.screen');
  if (!screen) return;
  try {
    const previous = loadExerciseDetails(exercise);
    const history = [...previous.history, { savedAt: new Date().toISOString(), ...details }].slice(-20);
    localStorage.setItem(getDetailsStorageKey(exercise, screen.id), JSON.stringify({ ...details, history }));
  } catch (error) {
    console.error('Impossibile salvare i dettagli esercizio:', error);
  }
}

function createExerciseDetails(exercise, totalSets) {
  const details = loadExerciseDetails(exercise);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'exercise-details-toggle';
  button.textContent = 'Dettagli';
  button.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('div');
  panel.className = 'exercise-details';
  panel.hidden = true;
  const heading = document.createElement('h3');
  heading.textContent = 'Progressi della sessione';
  panel.appendChild(heading);
  if (details.history.length > 0) {
    const historyLabel = document.createElement('p');
    historyLabel.className = 'exercise-history';
    historyLabel.textContent = `${details.history.length} rilevazioni salvate`;
    panel.appendChild(historyLabel);
  }

  const rows = document.createElement('div');
  rows.className = 'set-details-list';
  for (let index = 0; index < totalSets; index += 1) {
    const saved = details.sets[index] || {};
    const row = document.createElement('div');
    row.className = 'set-details-row';
    const series = document.createElement('strong');
    series.textContent = `Serie ${index + 1}`;
    row.appendChild(series);
    const addInput = (labelText, field, value, placeholder, step, inputMode) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = step;
      input.inputMode = inputMode;
      input.dataset.field = field;
      input.value = typeof value === 'string' ? value : '';
      input.placeholder = placeholder;
      label.appendChild(input);
      row.appendChild(label);
    };
    addInput('Peso', 'weight', saved.weight, 'kg', '0.5', 'decimal');
    addInput('Rip.', 'reps', saved.reps, 'n', '1', 'numeric');
    const difficultyLabel = document.createElement('label');
    difficultyLabel.textContent = 'Difficoltà';
    const difficulty = document.createElement('select');
    difficulty.dataset.field = 'difficulty';
    ['', 'facile', 'giusta', 'difficile'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || '-';
      option.selected = saved.difficulty === value;
      difficulty.appendChild(option);
    });
    difficultyLabel.appendChild(difficulty);
    row.appendChild(difficultyLabel);
    rows.appendChild(row);
  }
  panel.appendChild(rows);

  const notesLabel = document.createElement('label');
  notesLabel.className = 'exercise-notes-label';
  notesLabel.textContent = 'Note personali';
  const notes = document.createElement('textarea');
  notes.rows = 3;
  notes.maxLength = 500;
  notes.placeholder = 'Come è andata?';
  notes.value = details.notes;
  notesLabel.appendChild(notes);
  panel.appendChild(notesLabel);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'exercise-details-save';
  saveButton.textContent = 'Salva dettagli';
  saveButton.addEventListener('click', () => {
    const sets = [...rows.querySelectorAll('.set-details-row')].map(row => {
      const value = field => row.querySelector(`[data-field="${field}"]`).value.trim();
      return { weight: value('weight'), reps: value('reps'), difficulty: value('difficulty') };
    });
    saveExerciseDetails(exercise, { sets, notes: notes.value.trim() });
    button.textContent = 'Salvato';
    window.setTimeout(() => { button.textContent = 'Dettagli'; }, 1200);
  });
  panel.appendChild(saveButton);

  button.addEventListener('click', () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    button.setAttribute('aria-expanded', String(!isOpen));
  });
  exercise.append(button, panel);
}

function loadSetProgress(exercise) {
  const screen = exercise.closest('.screen');
  if (!screen) return 0;
  try {
    const key = getStorageKey(exercise, screen.id);
    const currentValue = localStorage.getItem(key);
    const legacyKey = getLegacyStorageKey(exercise, screen.id, 'calisthenics_sets_');
    const savedValue = currentValue ?? localStorage.getItem(legacyKey);
    if (savedValue !== null && currentValue === null) {
      localStorage.setItem(key, savedValue);
    }
    return Number(savedValue || 0);
  } catch (error) {
    console.warn('Progresso esercizio non leggibile:', error);
    return 0;
  }
}

function getSetCount(exercise) {
  const badge = exercise.querySelector('.badge');
  if (!badge) return null;

  const counts = [...badge.textContent.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*[xX]/g)]
    .map(match => Number(match[2] || match[1]));
  return counts.length > 0 ? counts.reduce((total, count) => total + count, 0) : null;
}

function setupSetProgress(exercise) {
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
  progress.setAttribute('title', 'Tocca per registrare o modificare una serie');
  progress.setAttribute('aria-label', `Serie completate: ${savedCompleted} di ${totalSets}`);

  // Tap manuale sul contatore per avanzare o resettare la serie
  progress.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = Number(progress.dataset.completed);
    if (current >= totalSets) {
      // Se già completato, un tocco permette di azzerare
      progress.dataset.completed = '0';
      progress.textContent = `0/${totalSets}`;
      progress.classList.remove('completed');
      exercise.classList.remove('exercise-done');
      saveSetProgress(exercise, 0);
    } else {
      completeSet(exercise);
    }
    updateScreenProgress(exercise.closest('.screen'));
    if ('vibrate' in navigator) navigator.vibrate(10);
  });

  exercise.querySelector('.ex-title-wrap').appendChild(progress);

  // Evidenzia esercizio completato
  if (savedCompleted >= totalSets) {
    exercise.classList.add('exercise-done');
  }

  updateScreenProgress(exercise.closest('.screen'));
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

  // Salva in localStorage
  saveSetProgress(exercise, nextCompleted);

  // Evidenziazione completamento
  if (nextCompleted >= total) {
    exercise.classList.add('exercise-done');
    progress.classList.add('completed');
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
  } else {
    exercise.classList.remove('exercise-done');
    progress.classList.remove('completed');
  }

  updateScreenProgress(exercise.closest('.screen'));
}


// ─── 7. Progress Bar Globale & Reset Allenamento ─────────────────────
function createProgressBar(screen) {
  const exercises = screen.querySelectorAll('.exercise .set-progress');
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

function updateScreenProgress(screen) {
  if (!screen) return;
  const bar = screen.querySelector('.workout-progress');
  if (!bar) return;

  const allProgress = screen.querySelectorAll('.exercise .set-progress');
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

  // Stile celebrativo quando tutti gli esercizi sono completati
  if (completedExercises === total && total > 0) {
    bar.classList.add('all-done');
  } else {
    bar.classList.remove('all-done');
  }
}

function createResetButton(screen) {
  const exercises = screen.querySelectorAll('.exercise .set-progress');
  if (exercises.length === 0) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reset-workout-btn';
  btn.innerHTML = '↺ Reset allenamento';
  btn.addEventListener('click', () => {
    if (!confirm('Vuoi resettare tutti i contatori di questa scheda?')) return;

    screen.querySelectorAll('.exercise').forEach(exercise => {
      const progress = exercise.querySelector('.set-progress');
      if (!progress) return;
      const total = progress.dataset.total;
      progress.dataset.completed = '0';
      progress.textContent = `0/${total}`;
      progress.classList.remove('completed');
      exercise.classList.remove('exercise-done');
      saveSetProgress(exercise, 0);
    });

    updateScreenProgress(screen);
    if ('vibrate' in navigator) navigator.vibrate(15);
  });

  const exerciseList = screen.querySelector('.exercise-list');
  if (exerciseList) {
    exerciseList.after(btn);
  }
}


// ─── 8. Inizializzazione Principale ────────────────────────────────────
function setupRestTimers() {
  const overlay = createTimerOverlay();
  document.querySelectorAll('.screen').forEach(screen => {
    const hasExercises = screen.querySelectorAll('.exercise').length > 0;

    screen.querySelectorAll('.exercise').forEach(exercise => {
      setupSetProgress(exercise);
      const totalSets = getSetCount(exercise);
      if (totalSets !== null) createExerciseDetails(exercise, totalSets);
      const meta = exercise.querySelector('.ex-meta');
      if (!meta) return;

      const controls = document.createElement('div');
      controls.className = 'rest-controls';
      meta.querySelectorAll('span').forEach(span => {
        const isSetRest = /\b(?:riposo|tra)[^]*\bserie\b/i.test(span.textContent);
        parseRestTimes(span.textContent).forEach(time => {
          const button = document.createElement('button');
          const label = time.prefix || 'Riposo';
          button.type = 'button';
          button.className = 'rest-button';
          button.textContent = `Avvia ${label} (${formatTime(time.seconds)})`;
          button.addEventListener('click', () => {
            if (isSetRest) completeSet(exercise);
            startTimer(time.seconds, label, overlay);
            if ('vibrate' in navigator) navigator.vibrate(12);
          });
          controls.appendChild(button);
        });
      });
      if (controls.children.length > 0) exercise.appendChild(controls);
    });

    if (hasExercises) {
      createProgressBar(screen);
      createResetButton(screen);
      updateScreenProgress(screen);
    }
  });
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