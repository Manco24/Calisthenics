const assert = require('node:assert');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS flow: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL flow: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log('=== AVVIO SUITE TEST FLOW E METODOLOGIE CALISTHENICS ===\n');

// 1. Motore Ladder: progressione salita/discesa e recuperi bloccati
runTest('progressione Ladder: salita, dichiarazione picco, discesa simmetrica e recuperi a 90s', () => {
  function getLadderRest(reps, state, customRestMax = 90) {
    const isLockedAtCap = Boolean(
      (state && (state.reachedThree || state.phase === 'down' || state.max >= 3)) ||
      reps >= 3
    );
    if (isLockedAtCap) return customRestMax;
    return Math.min(reps * 30, customRestMax);
  }

  const ladderState = {
    current: 1,
    max: 0,
    previousReps: 0,
    reachedThree: false,
    phase: 'up',
    completedReps: 0,
    finished: false
  };

  // Step 1: 1 rep
  assert.strictEqual(ladderState.current, 1);
  assert.strictEqual(getLadderRest(1, ladderState), 30);
  ladderState.previousReps = 1;
  ladderState.completedReps += 1;
  ladderState.current = 2;

  // Step 2: 2 reps
  assert.strictEqual(ladderState.current, 2);
  assert.strictEqual(getLadderRest(2, ladderState), 60);
  ladderState.previousReps = 2;
  ladderState.completedReps += 2;
  ladderState.current = 3;

  // Step 3: 3 reps -> raggiunte le 3 rep
  assert.strictEqual(ladderState.current, 3);
  ladderState.reachedThree = true;
  assert.strictEqual(getLadderRest(3, ladderState), 90);
  ladderState.previousReps = 3;
  ladderState.completedReps += 3;
  ladderState.current = 4;

  // Step 4: 4 reps -> oltre le 3 rep
  assert.strictEqual(ladderState.current, 4);
  assert.strictEqual(getLadderRest(4, ladderState), 90);
  ladderState.previousReps = 4;
  ladderState.completedReps += 4;
  ladderState.current = 5;

  // Atleta decide che il picco era 4 rep e avvia la discesa
  ladderState.max = 4;
  ladderState.phase = 'down';
  ladderState.current = 3; // discesa simmetrica

  // Discesa Step 1: 3 reps -> recupero deve rimanere fisso a 90s
  assert.strictEqual(getLadderRest(3, ladderState), 90);
  ladderState.previousReps = 3;
  ladderState.completedReps += 3;
  ladderState.current = 2;

  // Discesa Step 2: 2 reps -> recupero deve rimanere bloccato fisso a 90s in discesa
  assert.strictEqual(getLadderRest(2, ladderState), 90);
  ladderState.previousReps = 2;
  ladderState.completedReps += 2;
  ladderState.current = 1;

  // Discesa Step 3: 1 rep -> recupero bloccato fisso a 90s in discesa
  assert.strictEqual(getLadderRest(1, ladderState), 90);
  ladderState.previousReps = 1;
  ladderState.completedReps += 1;
  ladderState.finished = true;

  // Verifica volumi totali
  // Salita: 1 + 2 + 3 + 4 = 10 reps
  // Discesa: 3 + 2 + 1 = 6 reps
  // Totale: 16 reps
  assert.strictEqual(ladderState.completedReps, 16, 'Il totale reps deve essere 16');
  assert.strictEqual(ladderState.finished, true, 'La ladder deve essere marcata come completata');
});

// 2. Calcolo dinamico dipendenze Max / 2 Prec
runTest('calcolo dipendenza dinamica Max / 2 Prec con arrotondamento corretto', () => {
  function computeMaxHalf(prevMax) {
    if (!prevMax || prevMax <= 0 || !Number.isFinite(Number(prevMax))) return null;
    return Math.max(1, Math.floor(Number(prevMax) / 2));
  }

  // 14 reps massimali -> 7 reps
  assert.strictEqual(computeMaxHalf(14), 7);

  // 15 reps massimali -> floor(15/2) = 7 reps
  assert.strictEqual(computeMaxHalf(15), 7);

  // 1 rep massimale -> 1 rep minima garantita
  assert.strictEqual(computeMaxHalf(1), 1);

  // 0 reps o non completato -> null (non valorizzato)
  assert.strictEqual(computeMaxHalf(0), null);
  assert.strictEqual(computeMaxHalf(null), null);
  assert.strictEqual(computeMaxHalf('invalid'), null);
});

// 3. Verifica sequenze piramidali a gradini e a gruppi
runTest('calcolo volume e passaggi piramidale singolo e a gruppi', () => {
  // Piramidale singolo: 2-4-6-8-6-4-2
  const singlePyramid = [2, 4, 6, 8, 6, 4, 2];
  const singleTotal = singlePyramid.reduce((sum, n) => sum + n, 0);
  assert.strictEqual(singleTotal, 32, 'Piramidale 2-4-6-8-6-4-2 deve totalizzare 32 reps');

  // Piramidale a gruppi: 4 serie x (12-16-20-16-12)
  const groupSteps = [12, 16, 20, 16, 12];
  const groupTotal = groupSteps.reduce((sum, n) => sum + n, 0);
  assert.strictEqual(groupTotal, 76, 'Ogni gruppo piramidale deve totalizzare 76 reps');
  const fullWorkoutTotal = groupTotal * 4;
  assert.strictEqual(fullWorkoutTotal, 304, '4 gruppi piramidali devono totalizzare 304 reps');
});

// 4. Generazione Report Allenamento per WhatsApp / Telegram
runTest('formattazione corretta del report di allenamento condivisibile', () => {
  function generateMockReport(data) {
    const totalExercises = data.exercises.length;
    const completedExercises = data.exercises.filter(e => e.completed).length;

    let text = `🏋️‍♂️ CaliTracker — Report Allenamento\n`;
    text += `📅 Data: ${data.date}\n`;
    text += `📋 Scheda: ${data.title} (${completedExercises}/${totalExercises} completati)\n`;
    if (data.rpe) {
      const rpeLabels = {
        '6': '6 (Facile)',
        '7': '7 (Medio)',
        '8': '8 (Impegnativo)',
        '9': '9 (Molto duro)',
        '10': '10 (Cedimento)'
      };
      text += `⚡ Sforzo: RPE ${rpeLabels[String(data.rpe)] || data.rpe + '/10'}\n`;
    }
    text += `\n💪 Esercizi:\n`;
    data.exercises.forEach(ex => {
      let detail = '';
      if (ex.tipo === 'ladder') {
        detail = `Picco ${ex.ladderPeak || 0} rep • ${ex.ladderTotalReps || 0} reps totali`;
      } else if (ex.tipo === 'reps_totali') {
        detail = `${ex.totalRepsCompleted || 0}/${ex.targetTotalReps || 60} reps`;
      } else {
        detail = `${ex.completedSets}/${ex.totalSets} serie`;
        if (ex.maxValue) detail += ` (Max: ${ex.maxValue})`;
      }
      const check = ex.completed ? '✓' : '•';
      text += `  ${check} ${ex.nome}: ${detail}\n`;
    });

    if (data.notes && data.notes.trim()) {
      text += `\n📝 Note Atleta:\n"${data.notes.trim()}"\n`;
    }
    return text;
  }

  const reportPayload = {
    date: '2026-10-20',
    title: 'Spinta 1',
    rpe: 8,
    notes: 'Zavorra +5kg su Dip, buone sensazioni complessive.',
    exercises: [
      { nome: 'Piegamenti verticale', tipo: 'serie_reps', completedSets: 6, totalSets: 6, completed: true },
      { nome: 'Dip', tipo: 'ladder', ladderPeak: 5, ladderTotalReps: 25, completed: true },
      { nome: 'Piegamenti a terra', tipo: 'max', completedSets: 1, totalSets: 1, maxValue: 22, completed: true }
    ]
  };

  const reportText = generateMockReport(reportPayload);
  assert.ok(reportText.includes('CaliTracker — Report Allenamento'));
  assert.ok(reportText.includes('📅 Data: 2026-10-20'));
  assert.ok(reportText.includes('📋 Scheda: Spinta 1 (3/3 completati)'));
  assert.ok(reportText.includes('⚡ Sforzo: RPE 8 (Impegnativo)'));
  assert.ok(reportText.includes('✓ Dip: Picco 5 rep • 25 reps totali'));
  assert.ok(reportText.includes('✓ Piegamenti a terra: 1/1 serie (Max: 22)'));
  assert.ok(reportText.includes('Zavorra +5kg su Dip'));
});

// 5. Isolamento delle chiavi di storage per data attiva
runTest('isolamento dei contatori per data impedisce contaminazione tra giorni diversi', () => {
  function getExerciseKey(sheetId, exIndex, dateKey) {
    return `calisthenics_${dateKey}_${sheetId}_ex_${exIndex}`;
  }

  const keyDay1 = getExerciseKey('spinta-1', 0, '2026-10-19');
  const keyDay2 = getExerciseKey('spinta-1', 0, '2026-10-20');

  assert.notStrictEqual(keyDay1, keyDay2, 'Le chiavi per due date diverse devono essere distinte');
  assert.strictEqual(keyDay1, 'calisthenics_2026-10-19_spinta-1_ex_0');
  assert.strictEqual(keyDay2, 'calisthenics_2026-10-20_spinta-1_ex_0');
});

// 6. Verifica serie contatori e badge dinamici Max e Max/2 Prec per Tirata 1 e altri preset
runTest('serie contatori e badge dinamici Max, Max/2 Prec e multi-set per schede tirata e spinta', () => {
  // Simula o importa le funzioni di rendering e computazione
  function isIsometricHoldName(nome) {
    if (typeof nome !== 'string') return false;
    const n = nome.toLowerCase();
    return /lever|planche|plank|hollow|barchetta|hold|tenuta/i.test(n) && !/raise|pull|push|dip/i.test(n);
  }

  function formatBadge(ex) {
    switch (ex.tipo) {
      case 'max': {
        if (typeof ex.note === 'string' && /1\s*x\s*max.*4\s*x\s*max\s*\/\s*2/i.test(ex.note)) {
          return '1xMax 4xMax/2';
        }
        const isSec = ex.metrica === 'secondi' || isIsometricHoldName(ex.nome);
        const unit = isSec ? ' (sec)' : '';
        const prefix = ex.serie && ex.serie > 1 ? `${ex.serie} x ` : (ex.serie === 1 ? '1 x ' : '');
        return `${prefix}Max${unit}`.trim();
      }
      case 'max_meta_prec': {
        const prefix = ex.serie && ex.serie > 1 ? `${ex.serie} x ` : (ex.serie === 1 ? '1 x ' : '');
        return `${prefix}Max/2 Prec`.trim();
      }
      case 'max_range': {
        let rangePrefix = '';
        if (ex.serie_min && ex.serie_max) {
          rangePrefix = ex.serie_min === ex.serie_max ? `${ex.serie_min} x ` : `${ex.serie_min}-${ex.serie_max} x `;
        } else if (ex.serie) {
          rangePrefix = `${ex.serie} x `;
        }
        return `${rangePrefix}Max`.trim();
      }
      case 'libero':
        return ex.testo_libero || ex.note || 'Schema libero';
      default:
        return 'Serie';
    }
  }

  function computeTotalSets(ex) {
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
        if (ex.serie) return Math.max(1, Number(ex.serie) || 1);
        return 1;
      case 'piramidale':
        return Math.max(1, Number(ex.gruppi) || 1);
      default:
        return Math.max(1, Number(ex.serie) || 1);
    }
  }

  function updateBadgeWithPrevMax(baseBadge, prevMax) {
    if (!prevMax || prevMax <= 0) return baseBadge;
    const half = Math.max(1, Math.floor(prevMax / 2));
    if (/max\s*\/\s*2\s*prec/i.test(baseBadge)) {
      return baseBadge.replace(/max\s*\/\s*2\s*prec/i, `${half} reps (Max/2 Prec)`);
    }
    return `${baseBadge} (${half} rep)`;
  }

  // 1. Tuck Front Lever (Tirata 1)
  const tfl = { nome: 'Tuck Front Lever', tipo: 'max', serie: 4, metrica: 'secondi', riposo_serie_sec: 90 };
  assert.strictEqual(computeTotalSets(tfl), 4, 'Tuck Front Lever deve avere 4 serie totali (0/4)');
  assert.strictEqual(formatBadge(tfl), '4 x Max (sec)', 'Badge Tuck Front Lever deve essere 4 x Max (sec)');

  // 2. Tuck Front Lever raise (Tirata 1)
  const tflRaise = { nome: 'Tuck Front Lever raise', tipo: 'max_meta_prec', serie: 4, riferimento: 'esercizio_precedente' };
  assert.strictEqual(computeTotalSets(tflRaise), 4, 'Tuck Front Lever raise deve avere 4 serie totali (0/4)');
  assert.strictEqual(formatBadge(tflRaise), '4 x Max/2 Prec', 'Badge iniziale deve essere 4 x Max/2 Prec');
  // Dinamico: se max tenuta precedente = 14s, reps calcolate = 7
  assert.strictEqual(updateBadgeWithPrevMax(formatBadge(tflRaise), 14), '4 x 7 reps (Max/2 Prec)');

  // 3. Leg raise o Dragon flag (Tirata 1)
  const legRaise = { nome: 'Leg raise o Dragon flag', tipo: 'max', serie: 4 };
  assert.strictEqual(computeTotalSets(legRaise), 4, 'Leg raise o Dragon flag deve avere 4 serie totali');
  assert.strictEqual(formatBadge(legRaise), '4 x Max');

  // 4. Trazioni presa larga (Tirata 2)
  const trazioniLarga = { nome: 'Trazioni presa larga al mento', tipo: 'max', serie: 2 };
  assert.strictEqual(computeTotalSets(trazioniLarga), 2, 'Trazioni presa larga deve avere 2 serie (0/2)');
  assert.strictEqual(formatBadge(trazioniLarga), '2 x Max');

  // 5. Australian pull up (Tirata 2)
  const australian = { nome: 'Australian pull up', tipo: 'max', serie: 2 };
  assert.strictEqual(computeTotalSets(australian), 2, 'Australian pull up deve avere 2 serie (0/2)');
  assert.strictEqual(formatBadge(australian), '2 x Max');

  // 6. Piegamenti a terra (Spinta 1)
  const piegamentiSpinta1 = { nome: 'Piegamenti a terra', tipo: 'max_meta_prec', serie: 5 };
  assert.strictEqual(computeTotalSets(piegamentiSpinta1), 5, 'Piegamenti a terra Spinta 1 deve avere 5 serie (0/5)');
  assert.strictEqual(formatBadge(piegamentiSpinta1), '5 x Max/2 Prec');

  // 7. Piegamenti in verticale (Spinta 2)
  const piegSpinta2 = { nome: 'Piegamenti in verticale', tipo: 'libero', note: 'Schema: 1xMax 4xMax/2' };
  assert.strictEqual(computeTotalSets(piegSpinta2), 5, 'Spinta 2 ex 1 deve contare 5 serie (0/5)');
});

if (failed > 0) {
  console.error(`\n${failed} test flow falliti.`);
  process.exit(1);
} else {
  console.log(`\nTutti i test flow sono passati con successo (${passed} passati).`);
}
