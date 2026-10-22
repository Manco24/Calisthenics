const fs = require('node:fs');
const path = require('node:path');

const { parseWorkoutText, normalizeWorkoutText } = require('./workout-editor/workout-parser');
const { validateWorkout } = require('./workout-editor/workout-validation');
const CalisthenicsLexicon = require('./workout-editor/calisthenics-lexicon');
const OcrPreprocessor = require('./workout-editor/ocr-preprocessor');
const OcrConfidence = require('./workout-editor/ocr-confidence');
const VisionAiAdapter = require('./workout-editor/vision-ai-adapter');

console.log('=== AVVIO SUITE BENCHMARK OCR & VISION AI ===\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

const assert = (condition, description) => {
  totalChecks += 1;
  if (condition) {
    passedChecks += 1;
    console.log(`PASS: ${description}`);
  } else {
    failedChecks += 1;
    console.error(`FAIL: ${description}`);
  }
};

// -------------------------------------------------------------
// SEZIONE 1: Pre-processore Immagine (Sauvola, Contrast, Sharpen)
// -------------------------------------------------------------
console.log('--- Sezione 1: Algoritmi di Pre-processing Immagine ---');

// 1. Grayscale
const samplePixels = new Uint8ClampedArray([
  255, 0, 0, 255,   // Rosso puro -> ~76 lum
  0, 255, 0, 255,   // Verde puro -> ~150 lum
  0, 0, 255, 255,   // Blu puro   -> ~29 lum
  128, 128, 128, 255 // Grigio medio
]);
OcrPreprocessor.toGrayscale(samplePixels);
assert(samplePixels[0] === samplePixels[1] && samplePixels[1] === samplePixels[2], 'toGrayscale converte canali RGB in valori uniformi');
assert(samplePixels[0] > 70 && samplePixels[0] < 80, 'toGrayscale rispetta la luminanza ITU-R BT.601 sul rosso');

// 2. Contrast Stretch (Auto-levels)
const darkPixels = new Uint8ClampedArray([
  40, 40, 40, 255,
  60, 60, 60, 255,
  80, 80, 80, 255,
  100, 100, 100, 255
]);
OcrPreprocessor.contrastStretch(darkPixels);
assert(darkPixels[0] <= 10 && darkPixels[12] >= 240, 'contrastStretch espande l\'istogramma coprendo tutto l\'intervallo 0-255');

// 3. Invert (Blackboard)
const invPixels = new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255]);
OcrPreprocessor.invert(invPixels);
assert(invPixels[0] === 245 && invPixels[4] === 55, 'invert inverte correttamente i livelli di bianco e nero');

// 4. Binarizzazione Adattiva Sauvola (2x2 pixel minimi)
const binarizePixels = new Uint8ClampedArray(16 * 16 * 4);
for (let i = 0; i < binarizePixels.length; i += 4) {
  // Sfondo a 180, testo al centro a 50
  const x = (i / 4) % 16;
  const y = Math.floor((i / 4) / 16);
  const isText = (x >= 6 && x <= 9 && y >= 6 && y <= 9);
  const val = isText ? 40 : 190;
  binarizePixels[i] = val;
  binarizePixels[i + 1] = val;
  binarizePixels[i + 2] = val;
  binarizePixels[i + 3] = 255;
}
OcrPreprocessor.adaptiveThreshold(binarizePixels, 16, 16, 4, 0.2);
const centerPixelVal = binarizePixels[(7 * 16 + 7) * 4];
const cornerPixelVal = binarizePixels[0];
assert(centerPixelVal === 0 && cornerPixelVal === 255, 'adaptiveThreshold (Sauvola) separa nettamente il testo (0) dal fondo (255)');

// -------------------------------------------------------------
// SEZIONE 2: Lessico Calisthenics & Riparazione Errori OCR
// -------------------------------------------------------------
console.log('\n--- Sezione 2: Lessico Calisthenics & Riparazione Errori OCR ---');

const noisyOcrSamples = [
  {
    raw: 'Pu11 up presa prona 4 K 8 r1poso serie 90s',
    expectedName: 'Pull up presa prona',
    expectedReps: 8,
    expectedSets: 4,
    expectedRest: 90
  },
  {
    raw: 'D1p alle parallele 5xMax;2 Prec riposo 1.30 nin tra le ser1e',
    expectedName: 'Dip alle parallele',
    expectedType: 'max_meta_prec',
    expectedSets: 5,
    expectedRest: 90
  },
  {
    raw: 'Barohetta 5x20" r1poso eserc1z1o 2 min',
    expectedName: 'Barchetta',
    expectedType: 'serie_tenuta',
    expectedSets: 5,
    expectedDuration: 20,
    expectedExerciseRest: 120
  },
  {
    raw: 'P1egamenti a terra +1 rep ladder a salire r1poso 60 sec tra serie',
    expectedName: 'Piegamenti a terra',
    expectedType: 'ladder',
    expectedRest: 60
  },
  {
    raw: 'Ch1n up presa inversa 3 x (10-12-14-12-10)',
    expectedName: 'Chin up presa inversa',
    expectedType: 'piramidale'
  }
];

noisyOcrSamples.forEach((item, index) => {
  const workoutText = `Scheda Test OCR\n${item.raw}`;
  const parsed = parseWorkoutText(workoutText);
  const exercise = parsed.esercizi[0];

  assert(
    exercise && exercise.nome === item.expectedName,
    `Ripristino nome esercizio [${index + 1}]: "${item.raw.split(' ')[0]}" -> "${item.expectedName}"`
  );

  if (item.expectedType) {
    assert(exercise.tipo === item.expectedType, `Riconoscimento metodo [${index + 1}]: "${item.expectedType}"`);
  }
  if (item.expectedSets) {
    assert(exercise.serie === item.expectedSets, `Riconoscimento serie [${index + 1}]: ${item.expectedSets}`);
  }
  if (item.expectedReps) {
    assert(exercise.reps === item.expectedReps, `Riconoscimento reps [${index + 1}]: ${item.expectedReps}`);
  }
  if (item.expectedDuration) {
    assert(exercise.durata_sec === item.expectedDuration, `Riconoscimento durata [${index + 1}]: ${item.expectedDuration}s`);
  }
  if (item.expectedRest) {
    assert(exercise.riposo_serie_sec === item.expectedRest, `Riconoscimento riposo serie [${index + 1}]: ${item.expectedRest}s`);
  }
  if (item.expectedExerciseRest) {
    assert(exercise.riposo_esercizio_sec === item.expectedExerciseRest, `Riconoscimento riposo esercizio [${index + 1}]: ${item.expectedExerciseRest}s`);
  }
});

// -------------------------------------------------------------
// SEZIONE 3: OcrConfidence Token Verifier
// -------------------------------------------------------------
console.log('\n--- Sezione 3: Valutatore Confidenza OCR Numerico ---');

const testWords = [
  { text: 'Piegamenti', confidence: 95 },
  { text: '5', confidence: 60 },          // Numeric < 80
  { text: 'x', confidence: 85 },
  { text: '8', confidence: 92 },          // Numeric >= 80
  { text: '90s', confidence: 55 },        // Numeric < 80
  { text: 'riposo', confidence: 90 }
];

const lowCount = OcrConfidence.countLowConfidenceNumericTokens(testWords);
assert(lowCount === 2, `countLowConfidenceNumericTokens rileva correttamente 2 token numerici incerti (ottenuto: ${lowCount})`);

// -------------------------------------------------------------
// SEZIONE 4: Vision AI Adapter & Schema Conformity
// -------------------------------------------------------------
console.log('\n--- Sezione 4: Vision AI Adapter & Prompting ---');

assert(
  typeof VisionAiAdapter.CALISTHENICS_VISION_PROMPT === 'string' &&
  VisionAiAdapter.CALISTHENICS_VISION_PROMPT.includes('serie_reps') &&
  VisionAiAdapter.CALISTHENICS_VISION_PROMPT.includes('max_meta_prec') &&
  VisionAiAdapter.CALISTHENICS_VISION_PROMPT.includes('ladder'),
  'VisionAiAdapter include un prompt ingegnerizzato conforme allo schema Calisthenics'
);

assert(
  typeof VisionAiAdapter.checkEndpointHealth === 'function',
  'VisionAiAdapter espone checkEndpointHealth per testare endpoint Ollama'
);

// -------------------------------------------------------------
// SEZIONE 5: Benchmark su Scheda Completa con Errori Misti OCR
// -------------------------------------------------------------
console.log('\n--- Sezione 5: Benchmark Scheda Completa con Errori Misti OCR ---');

const mixedOcrSheet = `
Spinta 1 OCR Difficile
P1egamenti in verticale a mani strette | 6 K 3 | r1poso serie: 150s | riposo esercizio: 210s
D1p A | incremento da 1 | riposo esercizio: 2.30 min
Piegamenti a terra | 1 K Max | riposo eserc1z1o: 3 min
Piegamenti a terra | 5 K Max;2 Prec | riposo serie: 1.30 nin | riposo esercizio: 150s
Barohetta | 5 K 20" | riposo serie: 60s | riposo esercizio: 2 min
`;

const parsedMixed = parseWorkoutText(mixedOcrSheet);
const valErr = validateWorkout(parsedMixed);
assert(!valErr, `Scheda rumorosa validata senza errori di schema: ${valErr || 'OK'}`);
assert(parsedMixed.esercizi.length === 5, `Tutti i 5 esercizi della scheda sono stati estratti (trovati: ${parsedMixed.esercizi.length})`);
assert(parsedMixed.esercizi[0].nome === 'Piegamenti in verticale a mani strette', 'Esercizio 1: corretto typo P1egamenti e moltiplicatore K');
assert(parsedMixed.esercizi[1].tipo === 'ladder', 'Esercizio 2: ladder riconosciuto con riposo convertito a 150s');
assert(parsedMixed.esercizi[3].tipo === 'max_meta_prec' && parsedMixed.esercizi[3].riposo_serie_sec === 90, 'Esercizio 4: Max;2 Prec e "1.30 nin" riparati a 90s');
assert(parsedMixed.esercizi[4].tipo === 'serie_tenuta' && parsedMixed.esercizi[4].durata_sec === 20, 'Esercizio 5: Barohetta riparato in Barchetta tenuta 20s');

// -------------------------------------------------------------
// RIEPILOGO FINALE
// -------------------------------------------------------------
console.log('\n========================================');
console.log(`Risultato benchmark: ${passedChecks}/${totalChecks} controlli passati (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
console.log('========================================');

if (failedChecks > 0) {
  process.exitCode = 1;
}
