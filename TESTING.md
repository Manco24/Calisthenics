# Checklist di verifica manuale

## Persistenza esercizi

- Aprire una scheda, completare alcune serie e ricaricare la pagina: il contatore deve restare invariato.
- Modificare temporaneamente il nome visualizzato di un esercizio negli strumenti di sviluppo e ricaricare: il progresso deve restare associato allo stesso esercizio.
- Verificare che i dettagli (ripetizioni, peso e note) restino presenti dopo un ricaricamento.
- Usare il reset della scheda e verificare che contatori e dettagli si comportino come previsto.

## Service worker e offline

- Ricaricare l'app online dopo aver modificato `sw.js`: in DevTools > Application > Service Workers deve risultare attivo `schede-v7`.
- Aprire una scheda, disconnettere la rete e ricaricare: l'app deve aprirsi dal cache.
- In modalità offline verificare che CSS, JavaScript, icone e manifest continuino a caricarsi.
- Richiedere una risorsa inesistente offline: non deve essere restituito `index.html` al posto della risorsa mancante.

## Calendario e timer

- Cambiare mese avanti e indietro e verificare che sessioni e colori siano corretti.
- Salvare una sessione, chiudere e riaprire il modale del giorno: la sessione deve essere ancora disponibile.
- Avviare un timer, nascondere la scheda e verificare il comportamento della notifica e del suono al termine.
