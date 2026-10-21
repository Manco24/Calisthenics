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
  let pendingSelectionDate = null;

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
    const existing = sessions[key];
    const targetSheetId = session.sheetId || session.workoutId;
    const existingSheetId = existing ? (existing.sheetId || existing.workoutId) : null;

    const merged = {
      ...(existing && existingSheetId === targetSheetId ? existing : {}),
      ...session,
      sheetId: targetSheetId,
      workoutId: session.workoutId || targetSheetId,
      date: key,
      updatedAt: new Date().toISOString()
    };

    if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
      window.WorkoutStorage.setActiveTrainingDate(key);
    }

    sessions[key] = merged;
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

  function getSessionLabel(session) {
    if (session.workoutId && WORKOUTS[session.workoutId]) {
      return WORKOUTS[session.workoutId].label;
    }
    if (session.title) return session.title;
    if (session.type === 'push') return 'Spinta';
    if (session.type === 'pull') return 'Tirata';
    return 'Personalizzata';
  }

  function resolveExerciseName(sheetId, exerciseIndexOneBased) {
    if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.getEffectiveWorkout === 'function') {
      const workout = window.WorkoutStorage.getEffectiveWorkout(sheetId);
      const ex = workout?.esercizi?.[exerciseIndexOneBased - 1];
      if (ex && ex.nome) {
        return `${ex.nome} (${workout.titolo || sheetId})`;
      }
    }
    const screen = document.getElementById(sheetId);
    if (screen) {
      const exEl = screen.querySelectorAll('.exercise')[exerciseIndexOneBased - 1];
      const name = exEl?.querySelector('.name')?.textContent.trim();
      if (name) return `${name} (${WORKOUTS[sheetId]?.label || sheetId})`;
    }
    return `${WORKOUTS[sheetId]?.label || sheetId} • Es. ${exerciseIndexOneBased}`;
  }

  function collectPersonalRecords() {
    const recordsMap = new Map();

    // 1. Raccogli dai massimali e piramidi salvati nello storico sessioni calendario
    const allSessions = getWorkoutSessions().sort((a, b) => a.key.localeCompare(b.key));
    allSessions.forEach(sess => {
      if (!Array.isArray(sess.exercises)) return;
      const sheetLabel = sess.title || getSessionLabel(sess);
      sess.exercises.forEach(ex => {
        const keyId = `${sess.sheetId || sess.workoutId || 's'}_${ex.index || ex.nome}`;
        const prev = recordsMap.get(keyId);
        if (ex.maxValue && ex.maxValue > 0 && ex.tipo !== 'ladder') {
          const delta = prev && prev.rawVal ? ex.maxValue - prev.rawVal : 0;
          if (!prev || ex.maxValue >= prev.rawVal) {
            recordsMap.set(keyId, {
              name: `${ex.nome} (${sheetLabel})`,
              rawVal: ex.maxValue,
              score: ex.maxValue * 10,
              label: `Max: ${ex.maxValue}${delta > 0 ? ` (+${delta} 🔥)` : ''}`
            });
          }
        } else if (ex.tipo === 'ladder' && (ex.ladderPeak > 0 || ex.ladderTotalReps > 0)) {
          const peak = ex.ladderPeak || 0;
          const tot = ex.ladderTotalReps || ex.totalRepsCompleted || 0;
          const delta = prev && prev.rawVal ? tot - prev.rawVal : 0;
          if (!prev || tot >= prev.rawVal) {
            recordsMap.set(keyId, {
              name: `${ex.nome} (${sheetLabel})`,
              rawVal: tot,
              score: tot * 2 + peak * 10,
              label: `Picco ${peak} rep • ${tot} tot${delta > 0 ? ` (+${delta} 🔥)` : ''}`
            });
          }
        }
      });
    });

    // 2. Integra con i valori attuali in localStorage (calisthenics_max_*, _dip_progress_v2, calisthenics_sets_*)
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;

      const maxMatch = key.match(/^calisthenics_max_(.+)-(\d+)$/);
      if (maxMatch) {
        const sheetId = maxMatch[1];
        const exIdx = Number(maxMatch[2]);
        const val = Number(localStorage.getItem(key));
        const mapKey = `${sheetId}_${exIdx}`;
        if (val > 0 && !recordsMap.has(mapKey)) {
          recordsMap.set(mapKey, {
            name: resolveExerciseName(sheetId, exIdx),
            rawVal: val,
            score: val * 10,
            label: `Max: ${val}`
          });
        }
        continue;
      }

      const dipMatch = key.match(/^calisthenics_sets_(.+)-(\d+)_dip_progress_v2$/);
      if (dipMatch) {
        const sheetId = dipMatch[1];
        const exIdx = Number(dipMatch[2]);
        const mapKey = `${sheetId}_${exIdx}`;
        try {
          const dip = JSON.parse(localStorage.getItem(key) || '{}');
          const tot = Number(dip.completedReps || 0);
          const peak = Number(dip.max || (dip.current > 1 ? dip.current - 1 : 0));
          if ((tot > 0 || peak > 0) && !recordsMap.has(mapKey)) {
            recordsMap.set(mapKey, {
              name: resolveExerciseName(sheetId, exIdx),
              rawVal: tot,
              score: tot * 2 + peak * 10,
              label: `Picco ${peak} rep • ${tot} tot`
            });
          }
        } catch (e) {}
        continue;
      }

      const setsMatch = key.match(/^calisthenics_sets_(.+)-(\d+)$/);
      if (setsMatch) {
        const sheetId = setsMatch[1];
        const exIdx = Number(setsMatch[2]);
        const val = Number(localStorage.getItem(key));
        const mapKey = `${sheetId}_${exIdx}`;
        if (val > 0 && !recordsMap.has(mapKey)) {
          recordsMap.set(mapKey, {
            name: resolveExerciseName(sheetId, exIdx),
            rawVal: val,
            score: val,
            label: `${val} serie`
          });
        }
      }
    }

    return [...recordsMap.values()].sort((a, b) => b.score - a.score);
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
      ['Personalizzate', custom, 'custom']
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
    const records = collectPersonalRecords();
    (records.length ? records.slice(0, 6) : [{ name: 'Completa una serie o registra un Max per creare il tuo primo record', label: '—' }])
      .forEach(record => {
        const item = document.createElement('div');
        item.className = 'record-item';
        item.innerHTML = '<span></span><strong></strong>';
        item.querySelector('span').textContent = record.name;
        item.querySelector('strong').textContent = record.label;
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
  window.showToast = showToast;

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
    const goal = Number(localStorage.getItem(GOAL_STORAGE_KEY) || 4);
    const completed = Object.keys(sessions).filter(key => {
      const date = new Date(`${key}T00:00:00`);
      return date >= start && date < end && sessions[key] && sessions[key].type;
    }).length;
    summary.textContent = `${Math.min(completed, goal)}/${goal} questa settimana`;
    summary.classList.toggle('on-track', completed >= goal);
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
      if (session) {
        button.classList.add(`has-${session.type}`);
      }
      button.dataset.date = key;
      const dayLabel = document.createElement('span');
      dayLabel.textContent = String(day);
      button.appendChild(dayLabel);
      if (session) {
        const displayLabel = getSessionLabel(session);
        button.title = displayLabel;
        button.setAttribute('aria-label', `${day}: ${displayLabel}`);
        const dot = document.createElement('i');
        dot.className = `day-dot ${session.type}`;
        dot.setAttribute('aria-hidden', 'true');
        button.appendChild(dot);
        const sessionLabel = document.createElement('span');
        sessionLabel.className = 'calendar-session-label';
        sessionLabel.textContent = getSessionLabel(session);
        button.appendChild(sessionLabel);
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
    sessions = loadSessions();
    const key = dateKey(date);
    const session = sessions[key];
    title.textContent = dayFormatter.format(date);
    content.replaceChildren();

    if (session) {
      renderSavedSessionActions(date, session, content);
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.getElementById('closeDayModal')?.focus();
    } else {
      renderChoices(date);
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c] || c));
  }

  function generateSessionReportTextFromSession(session) {
    const title = session.title || getSessionLabel(session);
    const date = session.date || dateKey(new Date());
    let text = `🏋️‍♂️ CaliTracker — Report Allenamento\n`;
    text += `📅 Data: ${date}\n`;
    text += `📋 Scheda: ${title}\n`;
    if (session.rpe) {
      const rpeLabels = {
        '6': 'Facile', '7': 'Medio', '8': 'Duro', '9': 'Quasi Max', '10': 'Cedimento'
      };
      const label = rpeLabels[String(session.rpe)];
      text += `⚡ Sforzo: RPE ${session.rpe}/10${label ? ` (${label})` : ''}\n`;
    }
    if (Array.isArray(session.exercises) && session.exercises.length > 0) {
      text += `\n💪 Esercizi:\n`;
      session.exercises.forEach(ex => {
        text += `  • ${ex.nome}: ${formatExerciseProgressMetric(ex)}\n`;
      });
    }
    if (session.notes) {
      text += `\n📝 Note Atleta:\n${session.notes}\n`;
    }
    text += `\nGenerato con CaliTracker PWA`;
    return text;
  }

  function computeExerciseDeltaBadge(ex, prevEx) {
    if (!prevEx) return null;

    if (ex.tipo === 'ladder') {
      const curPeak = ex.ladderPeak || 0;
      const prevPeak = prevEx.ladderPeak || 0;
      const curTot = ex.ladderTotalReps || ex.totalRepsCompleted || 0;
      const prevTot = prevEx.ladderTotalReps || prevEx.totalRepsCompleted || 0;
      const diffTot = curTot - prevTot;
      const diffPeak = curPeak - prevPeak;
      if (curTot === 0 && curPeak === 0) return null;
      if (diffPeak > 0 || diffTot > 0) {
        const parts = [];
        if (diffPeak > 0) parts.push(`+${diffPeak} picco`);
        if (diffTot > 0) parts.push(`+${diffTot} rep tot`);
        return { text: `▲ ${parts.join(' • ')}`, kind: 'up' };
      }
      if (diffPeak === 0 && diffTot === 0 && curTot > 0) {
        return { text: '= Stesso volume', kind: 'same' };
      }
      if (diffTot < 0) {
        return { text: `▼ ${diffTot} rep tot`, kind: 'down' };
      }
      return null;
    }

    if (ex.maxValue && prevEx.maxValue) {
      const diff = ex.maxValue - prevEx.maxValue;
      if (diff > 0) return { text: `▲ +${diff} Max`, kind: 'up' };
      if (diff === 0) return { text: '= Stesso Max', kind: 'same' };
      return { text: `▼ ${diff} Max`, kind: 'down' };
    }

    if (ex.tipo === 'reps_totali' && ex.totalRepsCompleted !== null && prevEx.totalRepsCompleted !== null) {
      const diff = ex.totalRepsCompleted - prevEx.totalRepsCompleted;
      if (diff > 0) return { text: `▲ +${diff} reps`, kind: 'up' };
      if (diff === 0 && ex.totalRepsCompleted > 0) return { text: '= Stesse reps', kind: 'same' };
      if (diff < 0) return { text: `▼ ${diff} reps`, kind: 'down' };
    }

    if (ex.completedSets > 0 && prevEx.completedSets > 0) {
      const diff = ex.completedSets - prevEx.completedSets;
      if (diff > 0) return { text: `▲ +${diff} serie`, kind: 'up' };
      if (diff < 0) return { text: `▼ ${diff} serie`, kind: 'down' };
    }

    return null;
  }

  function formatExerciseProgressMetric(ex) {
    const parts = [];
    if (ex.tipo === 'ladder') {
      const peak = ex.ladderPeak || 0;
      const tot = ex.ladderTotalReps || ex.totalRepsCompleted || 0;
      if (peak > 0 || tot > 0) {
        parts.push(`Picco: ${peak} rep • Tot: ${tot} rep`);
      } else {
        parts.push(ex.completed ? 'Completato ✓' : 'Da iniziare');
      }
    } else if (ex.tipo === 'reps_totali') {
      parts.push(`${ex.totalRepsCompleted || 0}/${ex.targetTotalReps || 60} reps`);
    } else {
      parts.push(`${ex.completedSets || 0}/${ex.totalSets || 1} serie`);
    }

    if (ex.maxValue && ex.tipo !== 'ladder') {
      parts.push(`Max: ${ex.maxValue}`);
    }
    return parts.join(' • ');
  }

  function renderSavedSessionActions(date, session, content) {
    const key = dateKey(date);
    const sheetId = session.sheetId || session.workoutId;

    const card = document.createElement('div');
    card.className = `day-session-card ${session.type}`;
    const sessionTitle = document.createElement('strong');
    sessionTitle.textContent = session.title || getSessionLabel(session);
    const sessionSource = document.createElement('span');

    let summaryText = session.source === 'library' ? 'Scheda personalizzata' : 'Scheda programma';
    if (session.summary && session.summary.totalExercises > 0) {
      summaryText += ` • ${session.summary.completedExercises}/${session.summary.totalExercises} esercizi completati (${session.summary.completedSets}/${session.summary.totalSets} serie)`;
    }
    sessionSource.textContent = summaryText;
    card.append(sessionTitle, sessionSource);
    content.appendChild(card);

    if (session.rpe || session.notes) {
      const feedbackCard = document.createElement('div');
      feedbackCard.className = 'session-saved-feedback';
      let fbHtml = '';
      if (session.rpe) {
        const rpeLabels = {
          '6': 'Facile', '7': 'Medio', '8': 'Duro', '9': 'Quasi Max', '10': 'Cedimento'
        };
        const rpeText = rpeLabels[String(session.rpe)] || '';
        fbHtml += `<div class="saved-rpe-badge">⚡ RPE <strong>${session.rpe}/10</strong> ${rpeText ? `(${rpeText})` : ''}</div>`;
      }
      if (session.notes) {
        fbHtml += `<div class="saved-notes-body"><span class="notes-quote-mark">“</span>${escapeHtml(session.notes)}<span class="notes-quote-mark">”</span></div>`;
      }
      feedbackCard.innerHTML = fbHtml;
      content.appendChild(feedbackCard);
    }

    // Storico dettagliato esercizi e confronto miglioramenti (Delta) con la sessione precedente
    const prevSession = (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.getPreviousCalendarSession === 'function' && sheetId)
      ? window.WorkoutStorage.getPreviousCalendarSession(key, sheetId)
      : null;

    let exercisesToRender = Array.isArray(session.exercises) && session.exercises.length > 0
      ? session.exercises
      : null;

    if (!exercisesToRender && sheetId && typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.getEffectiveWorkout === 'function') {
      const workoutDef = window.WorkoutStorage.getEffectiveWorkout(sheetId);
      if (workoutDef && Array.isArray(workoutDef.esercizi)) {
        exercisesToRender = workoutDef.esercizi.map((ex, i) => ({
          index: i + 1,
          nome: ex.nome,
          tipo: ex.tipo,
          badge: '',
          completedSets: 0,
          totalSets: ex.serie || ex.gruppi || 1,
          completed: false,
          maxValue: null,
          totalRepsCompleted: 0,
          targetTotalReps: ex.totale_reps || null,
          ladderPeak: 0,
          ladderTotalReps: 0
        }));
      }
    }

    if (exercisesToRender && exercisesToRender.length > 0) {
      const detailsWrap = document.createElement('div');
      detailsWrap.className = 'session-history-details';

      const detailsHeader = document.createElement('div');
      detailsHeader.className = 'session-history-header';
      detailsHeader.innerHTML = `
        <strong>Dettaglio esercizi</strong>
        ${prevSession ? `<span class="session-prev-ref">Confronto vs ${prevSession.date}</span>` : '<span class="session-prev-ref">Prima sessione tracciata</span>'}
      `;
      detailsWrap.appendChild(detailsHeader);

      const listEl = document.createElement('div');
      listEl.className = 'session-ex-list';

      exercisesToRender.forEach((ex, idx) => {
        const prevEx = prevSession && Array.isArray(prevSession.exercises)
          ? (prevSession.exercises.find(p => p.nome === ex.nome) || prevSession.exercises[idx])
          : null;
        const delta = computeExerciseDeltaBadge(ex, prevEx);

        const row = document.createElement('div');
        row.className = `session-ex-row ${ex.completed ? 'is-done' : ''}`.trim();

        const topLine = document.createElement('div');
        topLine.className = 'session-ex-topline';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'session-ex-name';
        nameSpan.textContent = `${ex.index || idx + 1}. ${ex.nome}`;

        const metricSpan = document.createElement('span');
        metricSpan.className = 'session-ex-metric';
        metricSpan.textContent = formatExerciseProgressMetric(ex);

        topLine.append(nameSpan, metricSpan);
        row.appendChild(topLine);

        if (delta) {
          const deltaSpan = document.createElement('span');
          deltaSpan.className = `delta-badge delta-${delta.kind}`;
          deltaSpan.textContent = delta.text;
          row.appendChild(deltaSpan);
        }

        listEl.appendChild(row);
      });

      detailsWrap.appendChild(listEl);
      content.appendChild(detailsWrap);
    }

    const intro = document.createElement('p');
    intro.className = 'day-modal-intro';
    intro.textContent = 'Cosa vuoi fare con questa sessione?';
    content.appendChild(intro);

    const actions = document.createElement('div');
    actions.className = 'saved-session-actions';

    const watchButton = createAction('🏋️ Apri allenamento', 'session-watch');
    watchButton.addEventListener('click', () => {
      if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
        window.WorkoutStorage.setActiveTrainingDate(key);
      }
      const targetScreen = document.getElementById(sheetId);
      if (targetScreen) {
        delete targetScreen.dataset.syncedTrainingDate;
        if (typeof window.syncScreenForActiveDate === 'function') {
          window.syncScreenForActiveDate(targetScreen);
        }
      }
      closeDay();
      if (session.source === 'library' || (sheetId && !WORKOUTS[sheetId])) {
        if (typeof window.openCustomWorkout === 'function') {
          window.openCustomWorkout(sheetId, 'menu');
        } else if (typeof window.showScreen === 'function') {
          window.showScreen('workout-editor');
        }
      } else if (sheetId && typeof window.showScreen === 'function') {
        window.showScreen(sheetId);
      }
    });
    actions.appendChild(watchButton);

    if (sheetId && typeof window.openSheetInEditor === 'function') {
      const editButton = createAction('✏️ Modifica scheda / JSON', 'session-edit');
      editButton.addEventListener('click', () => {
        if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
          window.WorkoutStorage.setActiveTrainingDate(key);
        }
        closeDay();
        window.openSheetInEditor(sheetId);
      });
      actions.appendChild(editButton);
    }

    const shareButton = createAction('📋 Condividi report', 'session-share');
    shareButton.addEventListener('click', () => {
      const reportText = generateSessionReportTextFromSession(session);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText).then(() => {
          showToast('📋 Report copiato negli appunti! Pronto da incollare');
        }).catch(() => {
          window.prompt('Copia il report:', reportText);
        });
      } else {
        window.prompt('Copia il report:', reportText);
      }
      if ('vibrate' in navigator) navigator.vibrate(12);
    });
    actions.appendChild(shareButton);

    const changeButton = createAction('Cambia sessione', 'session-change');
    changeButton.addEventListener('click', () => {
      pendingSelectionDate = date;
      if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
        window.WorkoutStorage.setActiveTrainingDate(key);
      }
      closeDay();
      if (typeof window.showScreen === 'function') window.showScreen('sub-programma');
    });
    actions.appendChild(changeButton);

    const deleteButton = createAction('Elimina sessione', 'session-delete');
    deleteButton.addEventListener('click', () => {
      if (!window.confirm('Vuoi eliminare questa sessione dal calendario?')) return;
      delete sessions[key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      } catch (error) {
        console.error('Impossibile eliminare la sessione:', error);
        return;
      }
      closeDay();
      renderCalendar();
      renderStats();
    });
    actions.appendChild(deleteButton);
    content.appendChild(actions);
  }

  function createAction(label, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `day-action ${variant}`.trim();
    button.textContent = label;
    return button;
  }

  function renderChoices(date) {
    pendingSelectionDate = date;
    const key = dateKey(date);
    if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
      window.WorkoutStorage.setActiveTrainingDate(key);
    }
    closeDay();
    if (typeof window.showScreen === 'function') {
      window.showScreen('sub-programma');
    }
  }

  window.openWorkoutFromCalendar = function (workoutId, customTitle = null) {
    const targetDate = pendingSelectionDate || new Date();
    const formattedDate = dateKey(targetDate);
    if (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.setActiveTrainingDate === 'function') {
      window.WorkoutStorage.setActiveTrainingDate(formattedDate);
    }

    const targetScreen = document.getElementById(workoutId);
    if (targetScreen) {
      delete targetScreen.dataset.syncedTrainingDate;
      if (typeof window.syncScreenForActiveDate === 'function') {
        window.syncScreenForActiveDate(targetScreen);
      }
    }

    if (pendingSelectionDate) {
      const workout = WORKOUTS[workoutId];
      if (workout) {
        const effectiveTitle = (typeof window.WorkoutStorage !== 'undefined' && typeof window.WorkoutStorage.getEffectiveWorkout === 'function')
          ? (window.WorkoutStorage.getEffectiveWorkout(workoutId)?.titolo || workout.label)
          : workout.label;
        if (!saveSession(pendingSelectionDate, {
          type: workout.type,
          title: effectiveTitle,
          workoutId,
          sheetId: workoutId,
          source: 'program'
        })) return false;
      } else if (customTitle || (window.WorkoutStorage && window.WorkoutStorage.getSheet(workoutId))) {
        const sheet = window.WorkoutStorage ? window.WorkoutStorage.getSheet(workoutId) : null;
        const title = customTitle || sheet?.workout?.titolo || sheet?.titolo || 'Scheda personalizzata';
        if (!saveSession(pendingSelectionDate, {
          type: 'custom',
          title: title,
          workoutId: workoutId,
          sheetId: workoutId,
          source: 'library'
        })) return false;
      }
      pendingSelectionDate = null;
    }
    return true;
  };

  window.refreshCalendar = function () {
    sessions = loadSessions();
    renderCalendar();
    renderStats();
  };

  function closeDay() {
    const modal = document.getElementById('dayModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') lastModalTrigger.focus();
    lastModalTrigger = null;
  }

  function isBackupStorageKey(key) {
    return Boolean(
      key && (
        key === STORAGE_KEY ||
        key === GOAL_STORAGE_KEY ||
        key === 'workout-library-v1' ||
        key === 'workout-sessions-v1' ||
        key === 'workout-sheet-last-saved' ||
        key === 'calisthenics_active_date_v1' ||
        key === 'calisthenics_theme' ||
        key === 'calisthenics_font_scale' ||
        key.startsWith('calisthenics_sets_') ||
        key.startsWith('calisthenics_max_') ||
        key.startsWith('calisthenics_totalreps_') ||
        key.startsWith('calisthenics_details_')
      )
    );
  }

  function exportData() {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (isBackupStorageKey(key)) {
        storage[key] = localStorage.getItem(key);
      }
    }
    const payload = {
      format: 'calisthenics-backup',
      version: 2,
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
        Object.entries(payload.storage).forEach(([key, value]) => {
          if (!isBackupStorageKey(key) || typeof value !== 'string') return;
          localStorage.setItem(key, value);
        });
        sessions = loadSessions();
        renderCalendar();
        renderStats();
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
