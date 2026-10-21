# Calisthenics Workout Tracker & Converter — Contesto Progetto

## 1. Panoramica e Stack Tecnologico
PWA *offline-first* per l'allenamento calisthenics e la conversione di schede da testo/PDF/immagini.
- **Stack**: Vanilla Web puro (HTML5, CSS3 moderno con variabili/glassmorphism, JavaScript ES6+).
- **Zero Dipendenze di Build**: Nessun bundler (Webpack/Vite) e nessun framework UI (React/Vue/Tailwind). Il codice viene eseguito nativamente nel browser.
- **Librerie Esterne (Client-side)**: `tesseract.js` (OCR immagini), `pdf.js` (estrazione testo PDF).
- **Persistenza**: 100% locale tramite `localStorage`, centralizzata in `workout-editor/workout-storage.js`.

## 2. Mappa Architetturale dei File Critici
- `index.html` & `style.css`: UI principale della PWA (mobile-first, tema dark).
- `script.js`: Controller principale del player di allenamento, gestione `navigator.wakeLock`, `timerWorker` (Web Worker per timer in background) e sintesi sonora tramite Web Audio API.
- `calendar-home.js`: Gestione calendario, storico allenamenti e statistiche.
- `sw.js` & `manifest.json`: Service Worker e manifest per il funzionamento 100% offline.
- `workout-editor/`: Modulo standalone per editing, creazione e importazione schede:
  - `app.js`: Controller UI dell'editor e preview interattiva.
  - `workout-parser.js` & `ocr-confidence.js`: Motore di parsing semantico da testo libero/OCR a JSON e correzione errori comuni (es. `18s` -> `10s`, `nin` -> `min`).
  - `workout-validation.js` & `workout.schema.json`: Validatore formale basato su JSON Schema (Draft-07).
  - `workout-storage.js`: Motore di storage locale, contiene le 11 schede predefinite (Spinta 1-6, Tirata 1-5) e gestisce l'isolamento delle sessioni per data (`YYYY-MM-DD`).
  - `training-methods-library.js`: Definizioni e logiche dei 9 metodi di allenamento.

## 3. Regole di Dominio (I 9 Metodi di Allenamento)
Ogni esercizio appartiene a uno e un solo `tipo` tra:
1. `serie_reps`: Serie x Ripetizioni costanti.
2. `serie_tenuta`: Isometriche a tempo (in secondi) con timer dedicato.
3. `max`: Test massimale (input numerico salvato nella sessione).
4. `max_meta_prec`: Dipendenza dinamica dall'esercizio `max` precedente (`Math.ceil(max / 2)`).
5. `ladder`: Progressione (+1 rep/serie) con 3 contatori (*Reps da fare*, *Serie precedente*, *Reps totali*), gestione del picco per discesa simmetrica e recuperi bloccati (30" a 1 rep, 60" a 2 rep, 90" da >=3 rep).
6. `piramidale`: Sequenze singole (es. `2-4-6-4-2`) o a gruppi (es. `4x(3-5-7-5-3)`) con doppio timer (tra gradini e tra gruppi).
7. `reps_totali`: Accumulo di volume totale scalabile serie per serie.
8. `max_range`: Serie variabili a cedimento (min/max serie).
9. `libero`: Esercizio a schema libero con note.