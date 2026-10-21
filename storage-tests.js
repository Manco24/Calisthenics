const assert = require('node:assert');
const WorkoutStorage = require('./workout-storage');
const { validateWorkout } = require('./workout-validation');

const createMockStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    dump: () => Object.fromEntries(store.entries())
  };
};

const sampleWorkout1 = {
  versione: 1,
  titolo: 'Spinta 1',
  esercizi: [
    {
      nome: 'Piegamenti stretti',
      tipo: 'serie_reps',
      serie: 5,
      reps: 5,
      riposo_serie_sec: 90,
      riposo_esercizio_sec: 120
    }
  ]
};

const sampleWorkout2 = {
  versione: 1,
  titolo: 'Tirata 1',
  esercizi: [
    {
      nome: 'Dip',
      tipo: 'ladder',
      incremento: 1,
      recupero_per_rep_sec: 20,
      recupero_massimo_sec: 80,
      discesa: true,
      termina_su_fallimento: true,
      riposo_esercizio_sec: 150
    }
  ]
};

let failed = 0;
const test = (label, fn) => {
  try {
    fn();
    console.log(`PASS storage: ${label}`);
  } catch (err) {
    failed++;
    console.error(`FAIL storage: ${label}`);
    console.error(err);
  }
};

// 1. Initial empty storage
test('carica libreria vuota quando non ci sono dati', () => {
  const mock = createMockStorage();
  const lib = WorkoutStorage.loadLibrary(mock);
  assert.strictEqual(lib.version, 1);
  assert.deepStrictEqual(lib.sheets, {});
  assert.strictEqual(lib.activeSheetId, null);
  assert.deepStrictEqual(WorkoutStorage.listSheets(mock), []);
});

// 2. Migration from legacy key
test('migra automaticamente da workout-sheet-last-saved senza eliminare la chiave', () => {
  const mock = createMockStorage({
    [WorkoutStorage.LEGACY_KEY]: JSON.stringify(sampleWorkout1)
  });

  const lib = WorkoutStorage.loadLibrary(mock);
  assert.ok(lib.activeSheetId, 'activeSheetId deve essere valorizzato');
  const activeSheet = lib.sheets[lib.activeSheetId];
  assert.strictEqual(activeSheet.titolo, 'Spinta 1');
  assert.strictEqual(activeSheet.workout.esercizi.length, 1);

  // Verifica che la chiave legacy non sia stata rimossa
  assert.ok(mock.getItem(WorkoutStorage.LEGACY_KEY), 'la chiave legacy deve rimanere per rollback');

  // Verifica getActiveWorkout
  const activeWorkout = WorkoutStorage.getActiveWorkout(mock);
  assert.strictEqual(activeWorkout.titolo, 'Spinta 1');
  assert.strictEqual(validateWorkout(activeWorkout), null);
});

// 3. CRUD Schede
test('salva, elenca, ottiene e aggiorna schede', () => {
  const mock = createMockStorage();

  // Save first sheet
  const sheet1 = WorkoutStorage.saveSheet(sampleWorkout1, null, mock);
  assert.ok(sheet1.id);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), sheet1.id);

  // Save second sheet
  const sheet2 = WorkoutStorage.saveSheet(sampleWorkout2, null, mock);
  assert.ok(sheet2.id);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), sheet2.id);

  // List sheets
  const list = WorkoutStorage.listSheets(mock);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].id, sheet2.id); // sorted desc by updatedAt
  assert.strictEqual(list[0].isActive, true);
  assert.strictEqual(list[1].isActive, false);

  // Switch active sheet
  WorkoutStorage.setActiveSheetId(sheet1.id, mock);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), sheet1.id);
  assert.strictEqual(WorkoutStorage.getActiveWorkout(mock).titolo, 'Spinta 1');

  // Update sheet 1
  const updatedWorkout1 = {
    ...sampleWorkout1,
    titolo: 'Spinta 1 Modificata'
  };
  WorkoutStorage.saveSheet(updatedWorkout1, sheet1.id, mock);
  assert.strictEqual(WorkoutStorage.getWorkout(sheet1.id, mock).titolo, 'Spinta 1 Modificata');
});

// 4. Delete sheet
test('elimina scheda e aggiorna activeSheetId', () => {
  const mock = createMockStorage();
  const sheet1 = WorkoutStorage.saveSheet(sampleWorkout1, null, mock);
  const sheet2 = WorkoutStorage.saveSheet(sampleWorkout2, null, mock);

  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), sheet2.id);

  // Delete active sheet
  const deleted = WorkoutStorage.deleteSheet(sheet2.id, mock);
  assert.strictEqual(deleted, true);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), sheet1.id);
  assert.strictEqual(WorkoutStorage.listSheets(mock).length, 1);

  // Delete remaining sheet
  WorkoutStorage.deleteSheet(sheet1.id, mock);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), null);
  assert.strictEqual(WorkoutStorage.listSheets(mock).length, 0);
});

// 5. Workout validation on save
test('rifiuta salvataggio di scheda con schema non valido', () => {
  const mock = createMockStorage();
  assert.throws(() => {
    WorkoutStorage.saveSheet({ titolo: 'Incompleta' }, null, mock);
  }, /non valido|obbligatorio|array non vuoto/i);
});

// 6. Session management
test('crea, aggiorna e termina sessioni di allenamento', () => {
  const mock = createMockStorage();
  const sheet = WorkoutStorage.saveSheet(sampleWorkout1, null, mock);

  // Get or create session
  const session = WorkoutStorage.getOrCreateActiveSession(sheet.id, mock);
  assert.ok(session.id);
  assert.strictEqual(session.sheetId, sheet.id);
  assert.strictEqual(session.endedAt, null);

  // Retrieve active session
  const found = WorkoutStorage.getActiveSession(sheet.id, mock);
  assert.strictEqual(found.id, session.id);

  // Update exercise in session
  WorkoutStorage.updateSessionExercise(session.id, 0, {
    setsCompleted: 3,
    maxResult: null
  }, mock);

  const updatedSession = WorkoutStorage.getActiveSession(sheet.id, mock);
  assert.strictEqual(updatedSession.exercises['0'].setsCompleted, 3);

  // End session
  WorkoutStorage.endSession(session.id, mock);
  assert.strictEqual(WorkoutStorage.getActiveSession(sheet.id, mock), null);

  // Verify session appears in sheet history
  const history = WorkoutStorage.getSessionsForSheet(sheet.id, 10, mock);
  assert.strictEqual(history.length, 1);
  assert.ok(history[0].endedAt);
  assert.strictEqual(history[0].exercises['0'].setsCompleted, 3);
});

// 7. Session feedback & Athlete notes
test('salva e recupera feedback atleta (RPE e note)', () => {
  const mock = createMockStorage();
  const dateKey = '2026-10-20';
  
  WorkoutStorage.saveSessionFeedback(dateKey, {
    rpe: 8,
    notes: 'Ottime sensazioni su Dip, recuperi rispettati.'
  }, mock);

  const fb = WorkoutStorage.getSessionFeedback(dateKey, mock);
  assert.strictEqual(fb.rpe, 8);
  assert.strictEqual(fb.notes, 'Ottime sensazioni su Dip, recuperi rispettati.');
});

// 8. Clear custom sheets
test('clearCustomSheets elimina tutte le schede custom e ripristina activeSheetId su preset', () => {
  const mock = createMockStorage();
  WorkoutStorage.saveSheet(sampleWorkout1, 'custom-1', mock);
  WorkoutStorage.saveSheet(sampleWorkout2, 'custom-2', mock);
  // Personalizza un preset
  const customPreset = { ...sampleWorkout1, titolo: 'Spinta 1 Custom' };
  WorkoutStorage.saveSheet(customPreset, 'spinta-1', mock);

  WorkoutStorage.setActiveSheetId('custom-2', mock);
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), 'custom-2');
  assert.strictEqual(WorkoutStorage.listCustomSheets(mock).length, 2);

  // Esegui clearCustomSheets
  const res = WorkoutStorage.clearCustomSheets(mock);
  assert.strictEqual(res, true);

  // Le schede custom devono essere eliminate
  const customSheets = WorkoutStorage.listCustomSheets(mock);
  assert.strictEqual(customSheets.length, 0);

  // La personalizzazione del preset deve essere preservata
  const library = WorkoutStorage.loadLibrary(mock);
  assert.ok(library.sheets['spinta-1'], 'La personalizzazione del preset deve essere preservata');
  assert.strictEqual(library.sheets['spinta-1'].titolo, 'Spinta 1 Custom');

  // activeSheetId deve essere tornato su un preset valido
  assert.strictEqual(WorkoutStorage.getActiveSheetId(mock), 'spinta-1');
});

// 9. List preset and custom sheets separation
test('listPresetSheets e listCustomSheets separano correttamente i tipi di scheda', () => {
  const mock = createMockStorage();
  const presets = WorkoutStorage.listPresetSheets(mock);
  assert.strictEqual(presets.length, 6, 'Devono esserci 6 schede predefinite ufficiali');
  
  const pushPresets = presets.filter(p => p.category === 'push');
  const pullPresets = presets.filter(p => p.category === 'pull');
  assert.strictEqual(pushPresets.length, 2, 'Devono esserci 2 schede di spinta');
  assert.strictEqual(pullPresets.length, 4, 'Devono esserci 4 schede di tirata');

  // Verifica struttura metadati preset
  assert.strictEqual(presets[0].id, 'spinta-1');
  assert.strictEqual(presets[0].badge, '1');
  assert.strictEqual(presets[0].isPreset, true);
});

// 10. Reset preset sheet to default
test('resetPresetSheet ripristina il preset predefinito dopo una modifica personalizzata', () => {
  const mock = createMockStorage();
  const modified = { ...sampleWorkout1, titolo: 'Spinta 1 Personalizzata' };
  WorkoutStorage.saveSheet(modified, 'spinta-1', mock);

  const customizedSheet = WorkoutStorage.getSheet('spinta-1', mock);
  assert.strictEqual(customizedSheet.titolo, 'Spinta 1 Personalizzata');

  // Reset preset
  const resetRes = WorkoutStorage.resetPresetSheet('spinta-1', mock);
  assert.strictEqual(resetRes, true);

  // Verifica ripristino preset originale
  const restored = WorkoutStorage.getEffectiveWorkout('spinta-1', mock);
  assert.strictEqual(restored.titolo, 'Spinta 1');
  assert.strictEqual(restored.esercizi.length, WorkoutStorage.DEFAULT_WORKOUTS['spinta-1'].esercizi.length);
});

// 11. Sync calendar session details & chronological previous session lookup
test('syncCalendarSessionDetails e getPreviousCalendarSession sincronizzano e recuperano sessioni in ordine cronologico', () => {
  const mock = createMockStorage();
  const date1 = '2026-10-10';
  const date2 = '2026-10-15';
  const date3 = '2026-10-20';

  const workoutDef = WorkoutStorage.getPresetWorkout('spinta-1');
  const snapshotDay1 = [
    { setsCompleted: 6, setsTotal: 6, completed: true }
  ];
  const snapshotDay2 = [
    { setsCompleted: 6, setsTotal: 6, completed: true, maxResult: 16 }
  ];

  WorkoutStorage.syncCalendarSessionDetails('spinta-1', workoutDef, snapshotDay1, date1, mock);
  WorkoutStorage.syncCalendarSessionDetails('spinta-1', workoutDef, snapshotDay2, date2, mock);

  // Cerca sessione precedente prima di date3
  const prevBeforeDay3 = WorkoutStorage.getPreviousCalendarSession(date3, 'spinta-1', mock);
  assert.ok(prevBeforeDay3, 'Sessione precedente trovata');
  assert.strictEqual(prevBeforeDay3.date, date2, 'La sessione precedente più recente deve essere date2 (15 Ottobre)');

  // Cerca sessione precedente prima di date2
  const prevBeforeDay2 = WorkoutStorage.getPreviousCalendarSession(date2, 'spinta-1', mock);
  assert.strictEqual(prevBeforeDay2.date, date1, 'La sessione precedente prima di date2 deve essere date1 (10 Ottobre)');

  // Cerca sessione precedente prima di date1 (deve essere null)
  const prevBeforeDay1 = WorkoutStorage.getPreviousCalendarSession(date1, 'spinta-1', mock);
  assert.strictEqual(prevBeforeDay1, null, 'Nessuna sessione precedente prima di date1');
});

// 12. Active training date isolation
test('setActiveTrainingDate e getActiveTrainingDate isolano la data di allenamento', () => {
  const mock = createMockStorage();
  const today = WorkoutStorage.formatDateKey(new Date());
  assert.strictEqual(WorkoutStorage.getActiveTrainingDate(mock), today);

  // Imposta data esplicita
  WorkoutStorage.setActiveTrainingDate('2026-10-25', mock);
  assert.strictEqual(WorkoutStorage.getActiveTrainingDate(mock), '2026-10-25');

  // Reset al default passando null
  WorkoutStorage.setActiveTrainingDate(null, mock);
  assert.strictEqual(WorkoutStorage.getActiveTrainingDate(mock), today);
});

if (failed > 0) {
  console.error(`\n${failed} test storage falliti.`);
  process.exit(1);
} else {
  console.log('\nTutti i test storage sono passati con successo.');
}
