// Google Analytics 4 - loaded only on the real site. Local previews and test runs (localhost, file:) never load it and
// never send anything, so development traffic cannot pollute production numbers. gtag() stays defined either way, so
// calling it can never throw. See ANALYTICS.md.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
(function () {
  var h = location.hostname;
  var local = location.protocol === 'file:' || h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /\.local$/.test(h);
  window.TOSPORT_ANALYTICS_OFF = local;
  if (local) return;
  gtag('js', new Date());
  gtag('config', 'G-BKHDQGMC8T');
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-BKHDQGMC8T';
  document.head.appendChild(s);
})();
