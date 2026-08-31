// Registrazione Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(reg => console.log('Service Worker registrato'))
    .catch(err => console.log('Errore Service Worker:', err));
}

// Navigazione tra le schermate
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (el) {
    el.classList.remove('active');
  });

  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }

  window.scrollTo(0, 0);
}

// Ingrandimento immagine scheda (Zoom)
function zoomImage(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  
  if (modal && modalImg) {
    modalImg.src = src;
    modal.classList.add('active');
  }
}

// Chiusura dello zoom
function closeZoom() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.classList.remove('active');
  }
}