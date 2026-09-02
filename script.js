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

function beep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
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
    beep();
  }
}

function startTimer(seconds, label, overlay) {
  if (activeTimer) stopTimer();
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

function setupRestTimers() {
  const overlay = createTimerOverlay();
  document.querySelectorAll('.exercise').forEach(exercise => {
    const meta = exercise.querySelector('.ex-meta');
    if (!meta) return;

    const controls = document.createElement('div');
    controls.className = 'rest-controls';
    meta.querySelectorAll('span').forEach(span => {
      parseRestTimes(span.textContent).forEach(time => {
        const button = document.createElement('button');
        const label = time.prefix || 'Riposo';
        button.type = 'button';
        button.className = 'rest-button';
        button.textContent = `Avvia ${label} (${formatTime(time.seconds)})`;
        button.addEventListener('click', () => startTimer(time.seconds, label, overlay));
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