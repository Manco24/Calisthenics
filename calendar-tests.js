const assert = require('node:assert');

// Logica e costanti del calendario (allineate a calendar-home.js)
const SESSIONS_STORAGE_KEY = 'calisthenics_sessions_v1';
const GOAL_STORAGE_KEY = 'calisthenics_weekly_goal_v1';

const createMockStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
};

function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function getWeekStart(date) {
  const start = new Date(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function loadSessions(storage) {
  try {
    const saved = JSON.parse(storage.getItem(SESSIONS_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (e) {
    return {};
  }
}

function saveSession(storage, dateStr, sessionData) {
  const sessions = loadSessions(storage);
  sessions[dateStr] = { ...sessionData, updatedAt: new Date().toISOString() };
  storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  return true;
}

function computeMonthlyStats(sessionsMap, year, monthZeroIndexed) {
  let push = 0;
  let pull = 0;
  let custom = 0;
  let total = 0;

  const targetPrefix = `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}`;

  for (const [key, session] of Object.entries(sessionsMap)) {
    if (key.startsWith(targetPrefix) && session) {
      total++;
      if (session.type === 'push') push++;
      else if (session.type === 'pull') pull++;
      else custom++;
    }
  }

  return { total, push, pull, custom };
}

function computeConsecutiveStreak(sessionsMap, referenceDateStr) {
  let streak = 0;
  let curr = new Date(referenceDateStr);

  while (true) {
    const key = formatDateKey(curr);
    if (sessionsMap[key]) {
      streak++;
      curr.setDate(curr.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS calendar: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL calendar: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log('=== AVVIO SUITE TEST CALENDARIO & STORICO SESSIONI ===\n');

// 1. Calcolo inizio settimana con allineamento a lunedì
runTest('calcolo inizio settimana (getWeekStart) allinea correttamente a lunedì', () => {
  // 19 Ottobre 2026 = Lunedì
  const monday = new Date(2026, 9, 19, 15, 30);
  const startMon = getWeekStart(monday);
  assert.strictEqual(startMon.getDay(), 1);
  assert.strictEqual(startMon.getDate(), 19);

  // 21 Ottobre 2026 = Mercoledì -> inizio settimana deve essere 19
  const wednesday = new Date(2026, 9, 21, 10, 0);
  const startWed = getWeekStart(wednesday);
  assert.strictEqual(startWed.getDay(), 1);
  assert.strictEqual(startWed.getDate(), 19);

  // 25 Ottobre 2026 = Domenica -> inizio settimana deve essere sempre 19
  const sunday = new Date(2026, 9, 25, 22, 0);
  const startSun = getWeekStart(sunday);
  assert.strictEqual(startSun.getDay(), 1);
  assert.strictEqual(startSun.getDate(), 19);

  // 26 Ottobre 2026 = Lunedì successivo -> inizio settimana è 26
  const nextMonday = new Date(2026, 9, 26, 8, 0);
  const startNextMon = getWeekStart(nextMonday);
  assert.strictEqual(startNextMon.getDay(), 1);
  assert.strictEqual(startNextMon.getDate(), 26);
});

// 2. Isolamento e recupero sessioni nel calendario per data
runTest('isolamento e recupero sessioni nel calendario per data', () => {
  const storage = createMockStorage();

  saveSession(storage, '2026-10-19', {
    type: 'push',
    title: 'Spinta 1',
    workoutId: 'spinta-1',
    completedExercises: 5
  });

  saveSession(storage, '2026-10-21', {
    type: 'pull',
    title: 'Tirata 1',
    workoutId: 'tirata-1',
    completedExercises: 5
  });

  const sessions = loadSessions(storage);
  assert.ok(sessions['2026-10-19'], 'Sessione 19 Ottobre salvata');
  assert.strictEqual(sessions['2026-10-19'].title, 'Spinta 1');
  assert.strictEqual(sessions['2026-10-19'].type, 'push');

  assert.ok(sessions['2026-10-21'], 'Sessione 21 Ottobre salvata');
  assert.strictEqual(sessions['2026-10-21'].title, 'Tirata 1');
  assert.strictEqual(sessions['2026-10-21'].type, 'pull');

  assert.strictEqual(sessions['2026-10-20'], undefined, '20 Ottobre non deve avere sessioni');
});

// 3. Formattazione e calcolo date key
runTest('formatDateKey gestisce correttamente zeri iniziali e anni bisestili', () => {
  const d1 = new Date(2026, 0, 5); // 5 Gennaio 2026
  assert.strictEqual(formatDateKey(d1), '2026-01-05');

  const leap = new Date(2028, 1, 29); // 29 Febbraio 2028
  assert.strictEqual(formatDateKey(leap), '2028-02-29');

  const endYear = new Date(2026, 11, 31); // 31 Dicembre 2026
  assert.strictEqual(formatDateKey(endYear), '2026-12-31');
});

// 4. Aggregazione statistiche mensili
runTest('computeMonthlyStats aggrega correttamente sessioni per mese e categoria', () => {
  const mockSessions = {
    '2026-10-05': { type: 'push', title: 'Spinta 1' },
    '2026-10-07': { type: 'pull', title: 'Tirata 1' },
    '2026-10-09': { type: 'push', title: 'Spinta 2' },
    '2026-10-10': { type: 'pull', title: 'Tirata 2' },
    '2026-10-12': { type: 'push', title: 'Spinta 1' },
    '2026-10-14': { type: 'custom', title: 'Addome & Core' },
    '2026-11-02': { type: 'push', title: 'Spinta 1' } // mese diverso
  };

  const statsOct = computeMonthlyStats(mockSessions, 2026, 9);
  assert.strictEqual(statsOct.total, 6);
  assert.strictEqual(statsOct.push, 3);
  assert.strictEqual(statsOct.pull, 2);
  assert.strictEqual(statsOct.custom, 1);

  const statsNov = computeMonthlyStats(mockSessions, 2026, 10);
  assert.strictEqual(statsNov.total, 1);
  assert.strictEqual(statsNov.push, 1);
});

// 5. Calcolo streak consecutivo
runTest('computeConsecutiveStreak calcola correttamente i giorni consecutivi di allenamento', () => {
  const sessions = {
    '2026-10-18': { title: 'Spinta 1' },
    '2026-10-19': { title: 'Tirata 1' },
    '2026-10-20': { title: 'Spinta 2' },
    '2026-10-15': { title: 'Spinta 1' } // buco tra il 15 e il 18
  };

  const streak = computeConsecutiveStreak(sessions, '2026-10-20');
  assert.strictEqual(streak, 3, 'Streak deve essere di 3 giorni (18, 19, 20)');

  const streakBreak = computeConsecutiveStreak(sessions, '2026-10-21');
  assert.strictEqual(streakBreak, 0, 'Il 21 non ha sessioni, quindi streak 0');
});

if (failed > 0) {
  console.error(`\n${failed} test calendario falliti.`);
  process.exit(1);
} else {
  console.log(`\nTutti i test calendario sono passati con successo (${passed} passati).`);
}
