const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseWorkoutText, normalizeWorkoutText } = require('./workout-parser');
const { validateWorkout } = require('./workout-validation');
const WorkoutStorage = require('./workout-storage');

let validateWithSchema = null;
try {
  const Ajv2020 = require('ajv/dist/2020');
  const schemaPath = path.join(__dirname, 'workout.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true });
  validateWithSchema = ajv.compile(schema);
} catch (e) {
  // AJV is optional if running standalone without local node_modules
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log('=== AVVIO SUITE TEST PARSER & VALIDAZIONE ===\n');

// 1. Validazione schema delle 6 schede predefinite
runTest('Validazione 6 schede predefinite (Spinta 1-2, Tirata 1-4)', () => {
  const presetIds = [
    'spinta-1', 'spinta-2',
    'tirata-1', 'tirata-2', 'tirata-3', 'tirata-4'
  ];

  for (const id of presetIds) {
    const workout = WorkoutStorage.getEffectiveWorkout(id);
    assert(workout, `Preset non trovato: ${id}`);
    
    // Validazione runtime
    const runtimeErr = validateWorkout(workout);
    assert.strictEqual(runtimeErr, null, `Errore runtime su ${id}: ${runtimeErr}`);

    // Validazione AJV JSON Schema Draft 2020-12
    if (validateWithSchema) {
      const valid = validateWithSchema(workout);
      assert.strictEqual(valid, true, `Errore AJV su ${id}: ${JSON.stringify(validateWithSchema.errors)}`);
    }
  }
});

// 2. Parsing e validazione di samples/testo-scheda.txt (Spinta 1)
runTest('Parsing e validazione samples/testo-scheda.txt', () => {
  const filePath = path.join(__dirname, 'samples', 'testo-scheda.txt');
  assert(fs.existsSync(filePath), 'File testo-scheda.txt non trovato');
  const content = fs.readFileSync(filePath, 'utf8');
  
  const parsed = parseWorkoutText(content);
  assert.strictEqual(parsed.titolo, 'Spinta 1');
  assert.strictEqual(parsed.esercizi.length, 5);

  const runtimeErr = validateWorkout(parsed);
  assert.strictEqual(runtimeErr, null, `Errore runtime: ${runtimeErr}`);

  if (validateWithSchema) {
    const valid = validateWithSchema(parsed);
    assert.strictEqual(valid, true, `Errore schema: ${JSON.stringify(validateWithSchema.errors)}`);
  }
});

// 3. Parsing e validazione di tutte le schede in samples/schede-reali-aggiuntive.txt
runTest('Parsing e validazione 8 schede reali aggiuntive', () => {
  const filePath = path.join(__dirname, 'samples', 'schede-reali-aggiuntive.txt');
  assert(fs.existsSync(filePath), 'File schede-reali-aggiuntive.txt non trovato');
  const fullText = fs.readFileSync(filePath, 'utf8');
  const chunks = fullText.split(/[-─]{10,}/).map(c => c.trim()).filter(Boolean);

  assert.strictEqual(chunks.length, 8, `Attesi 8 blocchi di schede, trovati ${chunks.length}`);

  for (const [index, chunk] of chunks.entries()) {
    const parsed = parseWorkoutText(chunk);
    assert(parsed.titolo, `Titolo mancante nel blocco ${index + 1}`);
    assert(parsed.esercizi.length >= 4, `Attesi almeno 4 esercizi in blocco ${index + 1}, trovati ${parsed.esercizi.length}`);

    const runtimeErr = validateWorkout(parsed);
    assert.strictEqual(runtimeErr, null, `Errore runtime su blocco ${index + 1} (${parsed.titolo}): ${runtimeErr}`);

    if (validateWithSchema) {
      const valid = validateWithSchema(parsed);
      assert.strictEqual(valid, true, `Errore schema su blocco ${index + 1} (${parsed.titolo}): ${JSON.stringify(validateWithSchema.errors)}`);
    }
  }
});

// 4. Copertura dei 9 metodi di allenamento ufficiali
runTest('Riconoscimento e mapping dei 9 metodi ufficiali', () => {
  const snippet = `
Titolo: Test 9 Metodi

Primo esercizio:
Panca Piana. Schema 4x8
Riposo 2 min tra serie.

Secondo esercizio:
Plank Addome. Schema 4x30 sec
Riposo 1 min tra serie.

Terzo esercizio:
Trazioni Massimali. Schema 1xMax
Riposo 3 min.

Quarto esercizio:
Trazioni Dimezzate. Schema 4x Max/2 Prec
Riposo 90 sec tra serie.

Quinto esercizio:
Dip Ladder. Schema: Ladder 1 con salita e discesa
Recuperi: 1 rep 30 sec, 2 reps 1 min, da 3 reps in poi 1.30 min.

Sesto esercizio:
Dip Piramidale. Schema: Piramide 2-4-6-8-6-4-2
Riposo 1 min tra serie.

Settimo esercizio:
Piegamenti Volume. Schema 30 reps tecniche
Riposo 90 sec tra serie.

Ottavo esercizio:
Trazioni Range. Schema 3-4 x Max
Riposo 2 min tra serie.

Nono esercizio:
Mobilità Articolare. Schema libero
Note: stretching libero per spalle.
`;

  const parsed = parseWorkoutText(snippet);
  assert.strictEqual(parsed.esercizi.length, 9);

  const types = parsed.esercizi.map(e => e.tipo);
  assert.strictEqual(types[0], 'serie_reps');
  assert.strictEqual(types[1], 'serie_tenuta');
  assert.strictEqual(types[2], 'max');
  assert.strictEqual(types[3], 'max_meta_prec');
  assert.strictEqual(types[4], 'ladder');
  assert.strictEqual(types[5], 'piramidale');
  assert.strictEqual(types[6], 'reps_totali');
  assert.strictEqual(types[7], 'max_range');
  assert.strictEqual(types[8], 'libero');

  const runtimeErr = validateWorkout(parsed);
  assert.strictEqual(runtimeErr, null, `Errore runtime: ${runtimeErr}`);

  if (validateWithSchema) {
    const valid = validateWithSchema(parsed);
    assert.strictEqual(valid, true, `Errore schema: ${JSON.stringify(validateWithSchema.errors)}`);
  }
});

// 5. Test piramidali a gruppi con doppio riposo
runTest('Parsing piramidale a gruppi con doppio riposo (4 x (12-16-20-16-12))', () => {
  const snippet = `
Titolo: Piramidale a Gruppi

Primo esercizio:
Piegamenti su rialzo da 4 cm. Schema 4 X (12-16-20-16-12)
Riposo tra serie 20 sec, finite le serie 2 min tra i gruppi.
`;
  const parsed = parseWorkoutText(snippet);
  assert.strictEqual(parsed.esercizi.length, 1);
  const ex = parsed.esercizi[0];
  assert.strictEqual(ex.tipo, 'piramidale');
  assert.strictEqual(ex.gruppi, 4);
  assert.deepStrictEqual(ex.ripetizioni_per_gruppo, [12, 16, 20, 16, 12]);
  assert.strictEqual(ex.riposo_gradino_sec, 20);
  assert.strictEqual(ex.riposo_gruppo_sec, 120);

  assert.strictEqual(validateWorkout(parsed), null);
  if (validateWithSchema) {
    assert.strictEqual(validateWithSchema(parsed), true);
  }
});

// 6. Test casi negativi (devono essere rifiutati)
runTest('Casi negativi respinti da runtime e da schema', () => {
  // Mancanza titolo
  assert(validateWorkout({ versione: 1, esercizi: [{ nome: 'Dip', tipo: 'ladder' }] }) !== null);

  // Tipo sconosciuto
  const invalidType = {
    versione: 1,
    titolo: 'Invalido',
    esercizi: [{ nome: 'Dip', tipo: 'superserie', serie: 3, reps: 10 }]
  };
  assert(validateWorkout(invalidType) !== null);
  if (validateWithSchema) {
    assert.strictEqual(validateWithSchema(invalidType), false);
  }

  // Ladder con campo 'serie' non consentito
  const invalidLadder = {
    versione: 1,
    titolo: 'Invalido',
    esercizi: [{ nome: 'Dip', tipo: 'ladder', serie: 5, incremento: 1 }]
  };
  assert(validateWorkout(invalidLadder) !== null);
  if (validateWithSchema) {
    assert.strictEqual(validateWithSchema(invalidLadder), false);
  }

  // max_range con serie_min > serie_max (vincolo semantico runtime)
  const invalidRange = {
    versione: 1,
    titolo: 'Invalido',
    esercizi: [{ nome: 'Trazioni', tipo: 'max_range', serie_min: 5, serie_max: 3 }]
  };
  assert(validateWorkout(invalidRange) !== null);
});

// 7. Normalizzazione OCR
runTest('Normalizzazione OCR (Max;2 Prec, nin -> min, apostrofi, trattini)', () => {
  const raw = `
Titolo: Scheda OCR

Primo esercizio:
Esercizio A. Schema 4x Max;2 Prec
Riposo 1.30 nin tra serie.

Secondo esercizio:
Esercizio B. Schema 4x8
Riposo 1'30" tra serie.
`;
  const parsed = parseWorkoutText(raw);
  assert.strictEqual(parsed.esercizi[0].tipo, 'max_meta_prec');
  assert.strictEqual(parsed.esercizi[0].riposo_serie_sec, 90);
  assert.strictEqual(parsed.esercizi[1].riposo_serie_sec, 90);
});

console.log(`\n========================================`);
console.log(`Risultato: ${passed} passati, ${failed} falliti`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
