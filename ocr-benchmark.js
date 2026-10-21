const fs = require('node:fs');
const path = require('node:path');
const { createWorker, OEM } = require('tesseract.js');
const { parseWorkoutText } = require('./workout-parser');
const { validateWorkout } = require('./workout-validation');

const benchmarkPath = path.join(__dirname, 'samples', 'ocr-benchmark.json');
const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

const compareWorkout = (actual, expected) => {
  const mismatches = [];
  let checked = 0;
  let matched = 0;

  const compareField = (label, actualValue, expectedValue) => {
    checked += 1;
    if (JSON.stringify(actualValue) === JSON.stringify(expectedValue)) {
      matched += 1;
    } else {
      mismatches.push(`${label}: atteso ${JSON.stringify(expectedValue)}, ottenuto ${JSON.stringify(actualValue)}`);
    }
  };

  compareField('titolo', actual.titolo, expected.titolo);
  compareField('numero esercizi', actual.esercizi.length, expected.esercizi.length);
  for (const [index, expectedExercise] of expected.esercizi.entries()) {
    const actualExercise = actual.esercizi[index];
    if (!actualExercise) continue;
    for (const [field, expectedValue] of Object.entries(expectedExercise)) {
      compareField(`esercizio ${index + 1}.${field}`, actualExercise[field], expectedValue);
    }
  }

  return { checked, matched, mismatches };
};

const run = async () => {
  const worker = await createWorker('ita+eng', OEM.LSTM_ONLY, {
    langPath: __dirname,
    gzip: false,
    logger: () => {}
  });
  let totalChecked = 0;
  let totalMatched = 0;
  let failedCases = 0;

  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });

    for (const testCase of benchmark.cases) {
      const imagePath = path.join(__dirname, 'samples', testCase.image);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Immagine benchmark non trovata: ${imagePath}`);
      }

      const result = await worker.recognize(imagePath);
      const workout = parseWorkoutText(result.data.text);
      const validationError = validateWorkout(workout);
      const comparison = compareWorkout(workout, testCase.expected);
      totalChecked += comparison.checked;
      totalMatched += comparison.matched;

      if (validationError || comparison.mismatches.length > 0) {
        failedCases += 1;
        console.error(`FAIL ${testCase.image}${validationError ? `: ${validationError}` : ''}`);
        for (const mismatch of comparison.mismatches) console.error(`  ${mismatch}`);
      } else {
        console.log(`PASS ${testCase.image}: ${comparison.matched}/${comparison.checked} campi attesi; confidenza Tesseract ${Math.round(result.data.confidence)}%`);
      }
    }
  } finally {
    await worker.terminate();
  }

  const accuracy = totalChecked ? (totalMatched / totalChecked) * 100 : 0;
  console.log(`Risultato smoke benchmark: ${totalMatched}/${totalChecked} campi (${accuracy.toFixed(1)}%). ${benchmark.description}`);
  if (failedCases > 0 || totalChecked === 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
