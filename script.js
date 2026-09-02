// Navigazione tra le schermate
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (el) {
    el.classList.remove('active');
  });

  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }

  window.scrollTo(0, 0);
}

// Ingrandimento immagine scheda (Zoom)
function zoomImage(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  
  if (modal && modalImg) {
    modalImg.src = src;
    modal.classList.add('active');
  }
}

// Chiusura dello zoom
function closeZoom() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

let activeTimer = null;
let timerInterval = null;
let wakeLock = null;
let audioContext = null;

function parseRestTimes(text) {
  const times = [];
  const pattern = /(\d+)\s*'\s*(\d+)?\s*(?:"|″|”)?|(\d+)\s*(?:"|″|”)/g;
  let match;
  let previousEnd = 0;

  while ((match = pattern.exec(text)) !== null) {
    const minutes = match[1] ? Number(match[1]) : 0;
    const seconds = match[1] ? Number(match[2] || 0) : Number(match[3]);
    times.push({
      seconds: minutes * 60 + seconds,
      prefix: text.slice(previousEnd, match.index).replace(/^[\s:|/]+|[\s:|/]+$/g, '').trim()
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

function createTimerOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'restTimer';
  overlay.className = 'rest-timer';
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="rest-timer-label"></div>
    <div class="rest-timer-countdown">0:00</div>
    <div class="rest-timer-actions">
      <button type="button" class="timer-add">+30 secondi</button>
      <button type="button" class="timer-skip">Salta</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.timer-add').addEventListener('click', () => {
    if (activeTimer) {
      activeTimer.endTime += 30000;
      updateTimerDisplay();
    }
  });
  overlay.querySelector('.timer-skip').addEventListener('click', stopTimer);
  return overlay;
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
  if (!AudioContext) return;

  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(error => {
      console.error('Impossibile attivare l’audio del timer:', error);
    });
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

function updateTimerDisplay() {
  if (!activeTimer) return;
  const remaining = Math.max(0, Math.ceil((activeTimer.endTime - Date.now()) / 1000));
  activeTimer.overlay.querySelector('.rest-timer-countdown').textContent = formatTime(remaining);
  if (remaining === 0) {
    const completedTimer = activeTimer;
    activeTimer = null;
    clearInterval(timerInterval);
    timerInterval = null;
    completedTimer.overlay.classList.remove('visible');
    releaseWakeLock();
    if ('vibrate' in navigator) navigator.vibrate([250, 100, 250]);
    void beep();
  }
}

function startTimer(seconds, label, overlay) {
  if (activeTimer) stopTimer();
  prepareAudio();
  activeTimer = { endTime: Date.now() + seconds * 1000, overlay };
  overlay.querySelector('.rest-timer-label').textContent = label;
  overlay.classList.add('visible');
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 250);
  requestWakeLock();
}

function stopTimer() {
  if (!activeTimer) return;
  activeTimer.overlay.classList.remove('visible');
  activeTimer = null;
  clearInterval(timerInterval);
  timerInterval = null;
  releaseWakeLock();
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

  const progress = document.createElement('span');
  progress.className = 'set-progress';
  progress.textContent = `0/${totalSets}`;
  progress.dataset.completed = '0';
  progress.dataset.total = String(totalSets);
  progress.setAttribute('aria-label', `Serie completate: 0 di ${totalSets}`);
  exercise.querySelector('.ex-title-wrap').appendChild(progress);
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
}

function setupRestTimers() {
  const overlay = createTimerOverlay();
  document.querySelectorAll('.exercise').forEach(exercise => {
    setupSetProgress(exercise);
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
        });
        controls.appendChild(button);
      });
    });
    if (controls.children.length > 0) exercise.appendChild(controls);
  });
}

document.addEventListener('DOMContentLoaded', setupRestTimers);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activeTimer) requestWakeLock();
});