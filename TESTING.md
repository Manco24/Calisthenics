# Checklist di verifica manuale

## Persistenza esercizi e isolamento per data

- Aprire una scheda, completare alcune serie e ricaricare la pagina: il contatore deve restare invariato.
- Selezionare una nuova data dal calendario: la scheda deve apparire azzerata e pronta per l'allenamento del nuovo giorno, senza residui.
- Usare il reset della scheda e verificare che i contatori si azzerino.

## Service worker e offline

- Ricaricare l'app online dopo aver modificato `sw.js`: in DevTools > Application > Service Workers deve risultare attivo `schede-v27-ui-timer-polish` o successivo.
- Aprire una scheda, disconnettere la rete e ricaricare: l'app deve aprirsi dal cache offline.
- In modalità offline verificare che CSS, JavaScript, icone e manifest continuino a caricarsi.
- [x] Aprire "Editor schede" dal menu online, poi offline: la schermata integrata si apre dalla cache e il pulsante "Indietro" torna al menu.

## Calendario, timer e statistiche

- Cambiare mese avanti e indietro e verificare che sessioni e colori siano corretti.
- Salvare una sessione, chiudere e riaprire il modale del giorno: la sessione deve essere ancora disponibile.
- Cliccare su un giorno libero: la data viene impostata per l'allenamento e l'app porta direttamente alla selezione delle schede, senza schede consigliate forzate o pop-up intrusivi.
- **Dashboard Statistiche & PR**: Nella schermata calendario toccare `📊 Statistiche & Record Personali`: verificare la comparsa del riepilogo settimanale, grafici ad istogramma e la lista dei migliori record personali.
- **Audio Timer & Countdown 3-2-1**:
  - Avviare un timer di recupero: negli ultimi 3 secondi si avvertiranno 3 beep a frequenza crescente (700Hz, 820Hz, 940Hz) con vibrazione tattile.
  - Al termine compare la conferma visiva luminosa `GO! 💪` prima della chiusura.
  - Toccando il pulsante `🔊` in alto a destra nel timer, l'audio si disattiva (`🔇`, solo vibrazione) con notifica toast; premendolo di nuovo si riattiva.
- Nella progressione Ladder (Dip o Trazioni), completare le serie ascendenti:
  - 1 rep = recupero di 30"
  - 2 reps = recupero di 60"
  - 3 reps = recupero di 90" (bloccato fisso a 90" per le serie successive)
- Premere il pulsante dinamico "Questo è il massimo: inizia la discesa" per avviare la discesa simmetrica fino a 1 rep con recupero a 90".

## Esperienza Atleta sul Campo (Strada 1)

- **Regolazione rapida recupero**: Durante un recupero attivo, premere `-15s` per scalare il timer se ci si sente pronti in anticipo, oppure `+30s` per estenderlo.
- **Diario e Feedback**:
  - Selezionare un valore RPE (es. 8 • Duro) premendo l'apposita pillola. Ricaricare la pagina o tornare alla home: la pillola selezionata deve rimanere attiva.
  - Inserire una nota (es. `Zavorra +5kg su Dip`) nel box note e salvare: verificare la notifica toast di conferma.
- **Copia e Condivisione Report**:
  - Premere "📋 Copia report allenamento": verificare la comparsa del toast di successo e incollare il testo in un editor/app di messaggistica. Il testo deve contenere data, scheda, RPE, note e il riassunto degli esercizi svolti.
- **Storico Calendario**:
  - Nel calendario, toccare la data dell'allenamento appena svolto: nel modale devono comparire il badge RPE, il testo della nota e il pulsante "📋 Condividi report".

## Gestione Schede & Editor Snellito (Strada 3)

- **Interfaccia Editor Pulita (Senza Salvataggi a Vista)**:
  - Aprire l'editor schede: verificare che la schermata si apra direttamente sulla tab `✏️ Editor / Import` (senza liste o card di schede salvate/preset a vista in alto, `#library-panel` assente).
  - L'interfaccia si presenta sgombra, pulita e focalizzata esclusivamente sulla composizione ed esecuzione.
- **Modalità di Lavoro**:
  - `✏️ Editor / Import`: inserimento JSON, conversione automatica da testo naturale, importazione da file PDF o immagine OCR.
  - `🏋️ Prova`: player di allenamento in tempo reale con contatori di serie interattivi, tenute isometriche, progressioni ladder e timer integrati.

---

## Suite di Test Automatizzati (`npm test`)

La suite automatizzata copre l'intero stack applicativo con **29 test unitari e di integrazione** + benchmark OCR:

```powershell
npm test               # Esegue tutti i test (Parser, Storage, Calendario, Flow)
npm run test:storage   # Test database locale, sessioni, feedback atleta e pulizia schede
npm run test:calendar  # Test inizio settimana, isolamento sessioni, date e statistiche
npm run test:flow      # Test motore ladder (recuperi 90s), Max/2 Prec, piramidi e report
npm run test:ocr       # Benchmark estrazione OCR con Tesseract.js
npm run test:all       # Esegue l'intera suite inclusa la pipeline OCR
```

| Suite | File | Test | Copertura |
| :--- | :--- | :--- | :--- |
| **Parser & Schema** | `parser-tests.js` | 7 test | 6 schede ufficiali (Spinta 1-2, Tirata 1-4), parsing testo naturale, 8 schede complesse reali, 9 metodi calisthenics, piramidali a gruppi, casi negativi, correzioni OCR. |
| **Storage Engine** | `storage-tests.js` | 12 test | Inizializzazione, migrazione legacy, CRUD schede, validazione, sessioni, feedback atleta (RPE e note), `clearCustomSheets`, separazione preset/custom, reset preset, sync storico e isolamento date. |
| **Calendario & Storico** | `calendar-tests.js` | 5 test | Calcolo inizio settimana (lunedì), isolamento sessioni per data, date bisestili, statistiche mensili per tipo e calcolo streak. |
| **Flow & Metodi** | `flow-tests.js` | 5 test | Progressione ladder (salita, picco, discesa simmetrica, timer bloccato a 90s), calcolo dinamico `Max/2 Prec`, piramidali a gradini/gruppi, generatore report per WhatsApp e isolamento chiavi. |
| **OCR Benchmark** | `ocr-benchmark.js` | 15 campi | Smoke fixture con Tesseract.js su `ocr-demo.png` (100% campi estratti, confidenza 94%). |

