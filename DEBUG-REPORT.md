# Report di debug CaliTracker

**Data verifica:** 19 settembre 2026  
**Ambienti verificati:** browser Chromium, viewport mobile 320x700, viewport mobile 375x812 e viewport desktop simulato 575x789.  
**Nota:** il progetto è una PWA statica senza `package.json` o suite automatizzata. I test interattivi sono stati eseguiti caricando `index.html`; il service worker richiede invece HTTP/HTTPS e non è validabile correttamente con `file://`.

## Riepilogo

| Area | Esito | Dettaglio |
|---|---|---|
| Sintassi JavaScript | OK | `script.js`, `calendar-home.js` e `sw.js` superano `node --check`. |
| Asset referenziati | OK | HTML, CSS, JavaScript, manifest e icone presenti. |
| Avvio e calendario | OK | Calendario mensile renderizzato; navigazione mese disponibile. |
| Navigazione schede | OK | Menu, Spinta/Tirata e apertura delle schede funzionano. |
| URL/history e back | OK | La scheda aperta aggiorna l'hash, utile anche al tasto indietro del telefono/browser. |
| Contatore serie | OK | Il completamento aggiorna il contatore e resta dopo il reload tramite `localStorage`. |
| Dettagli esercizio | RISOLTO | La funzione esisteva ma non veniva mai invocata; ora il pannello è disponibile e i dati persistono. |
| Timer recupero | OK | Overlay, countdown, pausa/salta e completamento automatico della serie verificati. |
| Responsive mobile | OK | A 320px non è stato rilevato overflow orizzontale. |
| Responsive desktop | PARZIALE | La larghezza massima è correttamente limitata a circa 560px; manca un test su un dispositivo desktop reale. |
| Service worker/offline | OK | Verificato via HTTP locale: service worker attivo, reload offline riuscito e CSS con query string servito dalla cache. |
| Notifiche/audio in background | NON VERIFICATO | Dipendono da permessi, browser, sistema operativo e installazione PWA. |

## Test eseguiti

### Avvio e compatibilità

- Titolo e schermata iniziale caricati senza errori JavaScript.
- Sono presenti 92 pulsanti nella pagina iniziale/schede dinamiche.
- Il manifest, le icone SVG, il foglio CSS e gli script sono referenziati da file esistenti.
- Durante il reload della scheda non sono stati rilevati errori `pageerror` o errori console.

### Calendario e selezione scheda

- Il click su un giorno senza sessione imposta la data pendente e porta alla selezione del programma.
- La scelta `Spinta > Spinta 1` apre `#spinta-1`.
- La sessione viene registrata in `calisthenics_sessions_v1` con data, tipo e `workoutId`.
- I flussi Tirata e le altre schede usano lo stesso meccanismo e risultano coperti dalla stessa struttura.

### Progresso e reload

- Il click sul contatore di una serie incrementa il valore.
- Dopo il reload, il contatore viene ricostruito dal `localStorage`.
- Il reset della scheda è presente nell'interfaccia; non sono emersi errori nella sua costruzione.

### Dettagli esercizio

È stato rilevato e corretto un difetto funzionale:

- `createExerciseDetails()` costruiva correttamente il pannello Peso/Rip./Difficoltà/Note.
- Nessun punto del codice chiamava però la funzione, quindi l'utente non poteva aprire o salvare i dettagli.
- La funzione viene ora invocata per gli esercizi con numero di serie valido.
- Verifica dopo la correzione:
  - 5 pulsanti `Dettagli` visibili nella scheda `Spinta 1`.
  - Salvataggio di peso, ripetizioni e note in `calisthenics_details_spinta-1-1`.
  - Valore del peso ripristinato dopo il reload.

### Timer

- Il pulsante “Avvia Riposo serie (2:30)” crea l'overlay del timer.
- Countdown, label e pulsanti `+30s`, `Pausa` e `Salta` sono presenti.
- Il timer avvia anche il completamento automatico della serie associata, come previsto dal codice.
- Non è stato possibile certificare il comportamento con app in background, audio bloccato o telefono bloccato.

### Layout mobile

- Viewport 320x700: `document.documentElement.scrollWidth` non supera `innerWidth`.
- Viewport 375x812: non è stato rilevato overflow orizzontale.
- È presente un breakpoint dedicato sotto 420px con griglia a colonna singola per i selettori.
- Sono presenti `viewport`, `safe-area-inset`, supporto touch e `prefers-reduced-motion`.

## Problemi ancora da verificare

### Service worker e offline — RISOLTO E VERIFICATO

Il codice del service worker appare coerente:

- cache version `schede-v9`;
- precache di HTML, CSS, JavaScript, manifest e icone;
- cancellazione delle cache precedenti;
- fallback alla pagina iniziale solo per le richieste di navigazione;
- le risorse mancanti non vengono trasformate automaticamente in `index.html`.

La verifica è stata eseguita via server HTTP locale:

1. il service worker `schede-v9` è risultato registrato e controllore della pagina;
2. il reload con rete disabilitata ha mantenuto titolo, schermata attiva e foglio CSS;
3. `style.css?v=3` è stato restituito dalla cache offline con status `200`;
4. una risorsa inesistente è rimasta `404`, senza fallback errato a `index.html`.

È stata corretta anche la causa: la cache usa `ignoreSearch: true`, così gli asset con query string (come `style.css?v=3`) vengono trovati anche se il file precaricato non contiene la query.

### Notifiche, audio e background — priorità media

Il codice gestisce fallback e permessi, ma i risultati cambiano tra:

- Chrome/Android;
- Safari/iOS;
- PWA installata e semplice tab del browser;
- permesso notifiche consentito o negato;
- risparmio energetico e blocco schermo.

Serve un test fisico su almeno Android/Chrome e iPhone/Safari installando la PWA.

### Accessibilità — migliorata, verifica assistiva ancora consigliata

Gli esercizi usavano un contenitore con `role="button"` che conteneva altri pulsanti, creando ruoli interattivi annidati. Il contenitore ora usa `role="group"` e mantiene il nome dell'esercizio, mentre i controlli interni restano pulsanti indipendenti. Il problema strutturale è stato eliminato; resta consigliata una prova con VoiceOver/TalkBack.

## Modifica applicata

Modifiche applicate:

- In `script.js`, durante l'inizializzazione degli esercizi, viene calcolato il numero totale di serie e viene chiamata `createExerciseDetails()` per gli esercizi compatibili.
- In `script.js`, i contenitori degli esercizi non sono più annunciati come pulsanti contenenti altri pulsanti.
- In `sw.js`, la cache è passata a `schede-v9` e le richieste statiche ignorano la query string durante la ricerca.
- In `index.html`, il riferimento al CSS è passato a `style.css?v=3`.
- Gli esercizi incrementali delle dip restano gestiti dal loro widget dedicato.

## Conclusione

Il funzionamento principale su browser desktop e viewport mobile è operativo. Sono stati corretti e verificati i dettagli degli esercizi, la cache offline con query string e la struttura ARIA annidata. Restano da provare su dispositivi fisici le notifiche/audio in background e la compatibilità specifica di Android/Chrome e iOS/Safari.
