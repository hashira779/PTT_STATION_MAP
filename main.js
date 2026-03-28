// if ('serviceWorker' in navigator) {
//     navigator.serviceWorker.register('/service-worker.js')
//         .then((registration) => {
//             console.log('Service Worker registered with scope:', registration.scope);
//         }).catch((error) => {
//             console.log('Service Worker registration failed:', error);
//         });
// }
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/MAPTT_0114/service-worker.js', {
        scope: '/MAPTT_0114/',
        updateViaCache: 'none'
      }).then(function(registration) {
        registration.update();
        setInterval(function () {
          registration.update();
        }, 60000);
      }).catch(function(error) {
      });
    });
  }