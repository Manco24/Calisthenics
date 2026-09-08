(function () {
  'use strict';

  const STORAGE_KEY = 'calisthenics_sessions_v1';
  const GOAL_STORAGE_KEY = 'calisthenics_weekly_goal_v1';
  const WORKOUTS = {
    'spinta-1': { label: 'Spinta 1', type: 'push', category: 'Spinta' },
    'spinta-2': { label: 'Spinta 2', type: 'push', category: 'Spinta' },
    'tirata-1': { label: 'Tirata 1', type: 'pull', category: 'Tirata' },
    'tirata-2': { label: 'Tirata 2', type: 'pull', category: 'Tirata' },
    'tirata-3': { label: 'Tirata 3', type: 'pull', category: 'Tirata' },
    'tirata-4': { label: 'Tirata 4', type: 'pull', category: 'Tirata' }
  };
  const monthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  const dayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let sessions = loadSessions();
  let lastModalTrigger = null;

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function loadSessions() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
      console.warn('Registro sessioni non leggibile:', error);
      return {};
    }
  }

  function saveSession(date, session) {
    const key = dateKey(date);
    sessions[key] = { ...session, date: key };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Impossibile salvare la sessione:', error);
      return false;
    }
    renderCalendar();
    renderStats();
    showToast('Sessione salvata');
    return true;
  }

  function getWorkoutSessions() {
    return Object.entries(sessions)
      .filter(([, session]) => session && session.type)
      .map(([key, session]) => ({ key, ...session }));
  }

  function countSessionsBetween(start, end) {
    return getWorkoutSessions().filter(session => {
      const date = new Date(`${session.key}T00:00:00`);
      return date >= start && date < end;
    }).length;
  }

  function getStreak() {
    const completedDays = new Set(getWorkoutSessions().map(session => session.key));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let streak = 0;
    while (completedDays.has(dateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function createChartBar(label, value, max, extraClass) {
    const bar = document.createElement('div');
    bar.className = `chart-bar ${extraClass || ''}`.trim();
    bar.title = `${label}: ${value} sessioni`;
    const fill = document.createElement('span');
    fill.style.height = `${value > 0 ? Math.max(12, (value / Math.max(max, 1)) * 100) : 4}%`;
    if (value > 0) fill.classList.add('has-value');
    const number = document.createElement('b');
    number.textContent = String(value);
    const caption = document.createElement('small');
    caption.textContent = label;
    bar.append(fill, number, caption);
    return bar;
  }

  function renderStats() {
    const cards = document.getElementById('statsCards');
    const weeklyChart = document.getElementById('weeklyChart');
    const monthlyChart = document.getElementById('monthlyChart');
    const recordsList = document.getElementById('recordsList');
    if (!cards || !weeklyChart || !monthlyChart || !recordsList) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const allSessions = getWorkoutSessions();
    const weekSessions = allSessions.filter(session => {
      const date = new Date(`${session.key}T00:00:00`);
      return date >= weekStart && date < weekEnd;
    });
    const push = allSessions.filter(session => session.type === 'push').length;
    const pull = allSessions.filter(session => session.type === 'pull').length;
    const custom = allSessions.filter(session => session.type === 'custom').length;
    const goal = Number(localStorage.getItem(GOAL_STORAGE_KEY) || 4);
    const cardData = [
      ['Questa settimana', `${Math.min(weekSessions.length, goal)}/${goal}`, 'accent'],
      ['Spinta', push, 'push'],
      ['Tirata', pull, 'pull'],
      ['Ad hoc', custom, 'custom']
    ];
    cards.replaceChildren();
    cardData.forEach(([label, value, type]) => {
      const card = document.createElement('div');
      card.className = `stat-card ${type}`;
      card.innerHTML = '<strong></strong><span></span>';
      card.querySelector('strong').textContent = value;
      card.querySelector('span').textContent = label;
      cards.appendChild(card);
    });

    weeklyChart.replaceChildren();
    const weeklyValues = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      weeklyValues.push({
        label: date.toLocaleDateString('it-IT', { weekday: 'short' }).slice(0, 2),
        value: countSessionsBetween(date, next)
      });
    }
    const weeklyMax = Math.max(...weeklyValues.map(item => item.value), 1);
    weeklyValues.forEach(item => weeklyChart.appendChild(createChartBar(item.label, item.value, weeklyMax)));
    const streak = document.getElementById('streakValue');
    if (streak) streak.textContent = `${getStreak()} giorni di fila`;

    monthlyChart.replaceChildren();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthlyValues = [];
    for (let week = 0; week < 5; week += 1) {
      const start = new Date(monthStart);
      start.setDate(1 + week * 7);
      if (start >= monthEnd) break;
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      monthlyValues.push({ label: `S${week + 1}`, value: countSessionsBetween(start, end) });
    }
    const monthlyMax = Math.max(...monthlyValues.map(item => item.value), 1);
    monthlyValues.forEach(item => monthlyChart.appendChild(createChartBar(item.label, item.value, monthlyMax, 'monthly')));
    const monthlyTotal = document.getElementById('monthlyTotal');
    if (monthlyTotal) monthlyTotal.textContent = `${monthlyValues.reduce((sum, item) => sum + item.value, 0)} sessioni`;

    recordsList.replaceChildren();
    const records = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('calisthenics_sets_')) continue;
      const match = key.match(/^calisthenics_sets_[^_]+_(.+)$/);
      const value = Number(localStorage.getItem(key));
      if (match && value > 0) records.push({ name: match[1], value });
    }
    records.sort((a, b) => b.value - a.value);
    (records.length ? records.slice(0, 5) : [{ name: 'Completa una serie per creare il tuo primo record', value: 0 }])
      .forEach(record => {
        const item = document.createElement('div');
        item.className = 'record-item';
        item.innerHTML = '<span></span><strong></strong>';
        item.querySelector('span').textContent = record.name;
        item.querySelector('strong').textContent = record.value ? `${record.value} serie` : '—';
        recordsList.appendChild(item);
      });
  }

  function showToast(message) {
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

  function getWeekStart(date) {
    const start = new Date(date);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function updateWeekSummary() {
    const summary = document.getElementById('weekSummary');
    if (!summary) return;
    const start = getWeekStart(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const completed = Object.keys(sessions).filter(key => {
      const date = new Date(`${key}T00:00:00`);
      return date >= start && date < end && sessions[key] && sessions[key].type;
    }).length;
    summary.textContent = `${Math.min(completed, 4)}/4 questa settimana`;
    summary.classList.toggle('on-track', completed >= 4);
  }

  function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    if (!grid || !title) return;
    title.textContent = monthFormatter.format(displayedMonth);
    const firstDay = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);
    const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
    const leadingDays = (firstDay.getDay() + 6) % 7;
    grid.replaceChildren();

    for (let index = 0; index < leadingDays; index += 1) {
      const spacer = document.createElement('span');
      spacer.className = 'calendar-day is-empty';
      spacer.setAttribute('aria-hidden', 'true');
      grid.appendChild(spacer);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day);
      const key = dateKey(date);
      const session = sessions[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      if (key === dateKey(new Date())) button.classList.add('today');
      if (session) button.classList.add(`has-${session.type}`);
      button.dataset.date = key;
      const dayLabel = document.createElement('span');
      dayLabel.textContent = String(day);
      button.appendChild(dayLabel);
      if (session) {
        const dot = document.createElement('i');
        dot.className = `day-dot ${session.type}`;
        dot.setAttribute('aria-label', session.title);
        button.appendChild(dot);
      }
      button.addEventListener('click', () => openDay(date));
      grid.appendChild(button);
    }
    updateWeekSummary();
  }

  function openDay(date) {
    const modal = document.getElementById('dayModal');
    const title = document.getElementById('dayModalTitle');
    const content = document.getElementById('dayModalContent');
    if (!modal || !title || !content) return;
    lastModalTrigger = document.activeElement;
    const session = sessions[dateKey(date)];
    title.textContent = dayFormatter.format(date);
    content.replaceChildren();

    if (session) {
      const card = document.createElement('div');
      card.className = `day-session-card ${session.type}`;
      const sessionTitle = document.createElement('strong');
      sessionTitle.textContent = session.title;
      const sessionSource = document.createElement('span');
      sessionSource.textContent = session.source === 'custom' ? 'Sessione ad hoc' : 'Scheda del programma';
      card.append(sessionTitle, sessionSource);
      content.appendChild(card);
      const openButton = createAction('Apri allenamento', 'primary');
      openButton.addEventListener('click', () => {
        closeDay();
        if (session.workoutId && typeof window.showScreen === 'function') window.showScreen(session.workoutId);
      });
      content.appendChild(openButton);
      const replaceButton = createAction('Sostituisci sessione', '');
      replaceButton.addEventListener('click', () => renderChoices(date, content));
      content.appendChild(replaceButton);
      const deleteButton = createAction('Elimina sessione', 'danger');
      deleteButton.addEventListener('click', () => {
        if (!window.confirm('Vuoi eliminare questa sessione dal calendario?')) return;
        delete sessions[dateKey(date)];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (error) {
          console.error('Impossibile eliminare la sessione:', error);
          return;
        }
        closeDay();
        renderCalendar();
      });
      content.appendChild(deleteButton);
    } else {
      renderChoices(date, content);
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('closeDayModal')?.focus();
  }

  function createAction(label, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `day-action ${variant}`.trim();
    button.textContent = label;
    return button;
  }

  function renderChoices(date, content) {
    content.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'day-modal-intro';
    intro.textContent = 'Scegli una scheda del programma oppure registra una sessione libera.';
    content.appendChild(intro);
    Object.entries(WORKOUTS).forEach(([workoutId, workout]) => {
      const button = createAction(`${workout.category} · ${workout.label}`, workout.type === 'push' ? 'push' : 'pull');
      button.addEventListener('click', () => {
        if (saveSession(date, { type: workout.type, title: workout.label, workoutId, source: 'program' })) {
          closeDay();
          window.showScreen(workoutId);
        }
      });
      content.appendChild(button);
    });
    const custom = document.createElement('form');
    custom.className = 'custom-session-form';
    custom.innerHTML = '<label for="customSessionTitle">Sessione ad hoc</label><div><input id="customSessionTitle" maxlength="50" required placeholder="es. Mobilità e core"><button class="day-action custom" type="submit">Salva</button></div>';
    custom.addEventListener('submit', event => {
      event.preventDefault();
      const input = custom.querySelector('input');
      const title = input.value.trim();
      if (!title) return;
      if (saveSession(date, { type: 'custom', title, source: 'custom' })) closeDay();
    });
    content.appendChild(custom);
  }

  function closeDay() {
    const modal = document.getElementById('dayModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') lastModalTrigger.focus();
    lastModalTrigger = null;
  }

  function exportData() {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && (key === STORAGE_KEY || key === GOAL_STORAGE_KEY || key.startsWith('calisthenics_sets_') || key.startsWith('calisthenics_details_'))) {
        storage[key] = localStorage.getItem(key);
      }
    }
    const payload = {
      format: 'calisthenics-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      storage
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calisthenics-backup-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        if (!payload || payload.format !== 'calisthenics-backup' || !payload.storage || typeof payload.storage !== 'object') {
          throw new Error('Formato backup non riconosciuto');
        }
        const allowed = key => key === STORAGE_KEY || key === GOAL_STORAGE_KEY || key.startsWith('calisthenics_sets_') || key.startsWith('calisthenics_details_');
        Object.entries(payload.storage).forEach(([key, value]) => {
          if (!allowed(key) || typeof value !== 'string') return;
          localStorage.setItem(key, value);
        });
        sessions = loadSessions();
        renderCalendar();
        window.alert('Dati importati correttamente.');
        window.location.reload();
      } catch (error) {
        console.error('Importazione dati fallita:', error);
        window.alert('Il file selezionato non è un backup valido.');
      }
    };
    reader.onerror = () => window.alert('Impossibile leggere il file selezionato.');
    reader.readAsText(file);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('previousMonth')?.addEventListener('click', () => {
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
      displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    document.getElementById('closeDayModal')?.addEventListener('click', closeDay);
    document.getElementById('dayModal')?.addEventListener('click', event => {
      if (event.target.id === 'dayModal') closeDay();
    });
    document.addEventListener('keydown', event => {
      const modal = document.getElementById('dayModal');
      if (!modal?.classList.contains('active')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDay();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.disabled);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    document.getElementById('exportDataButton')?.addEventListener('click', exportData);
    const importInput = document.getElementById('importDataInput');
    document.getElementById('importDataButton')?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', event => {
      importData(event.target.files[0]);
      event.target.value = '';
    });
    setupAppearanceControls();
    renderCalendar();
    const goalSelect = document.getElementById('weeklyGoal');
    if (goalSelect) {
      goalSelect.value = String(Number(localStorage.getItem(GOAL_STORAGE_KEY) || 4));
      goalSelect.addEventListener('change', () => {
        localStorage.setItem(GOAL_STORAGE_KEY, goalSelect.value);
        renderStats();
      });
    }
    renderStats();
  });

  function setupAppearanceControls() {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('calisthenics_theme');
    const savedScale = Number(localStorage.getItem('calisthenics_font_scale') || 1);
    if (savedTheme === 'light') root.dataset.theme = 'light';
    root.style.setProperty('--font-scale', String(Math.min(1.15, Math.max(0.9, savedScale))));
    const themeButton = document.getElementById('themeToggle');
    const updateThemeLabel = () => {
      const light = root.dataset.theme === 'light';
      if (themeButton) {
        themeButton.textContent = light ? 'Tema scuro' : 'Tema chiaro';
        themeButton.setAttribute('aria-pressed', String(light));
      }
    };
    themeButton?.addEventListener('click', () => {
      const light = root.dataset.theme !== 'light';
      root.dataset.theme = light ? 'light' : 'dark';
      localStorage.setItem('calisthenics_theme', light ? 'light' : 'dark');
      updateThemeLabel();
    });
    document.getElementById('fontDecrease')?.addEventListener('click', () => changeFontScale(-0.05));
    document.getElementById('fontIncrease')?.addEventListener('click', () => changeFontScale(0.05));
    updateThemeLabel();
  }

  function changeFontScale(delta) {
    const root = document.documentElement;
    const current = Number(getComputedStyle(root).getPropertyValue('--font-scale')) || 1;
    const next = Math.min(1.15, Math.max(0.9, Number((current + delta).toFixed(2))));
    root.style.setProperty('--font-scale', String(next));
    localStorage.setItem('calisthenics_font_scale', String(next));
  }
}());
