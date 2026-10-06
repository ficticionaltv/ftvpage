/* ============================================================
   FicticionalTV — redirección opcional a la versión TV
   Pégalo (o incluye este archivo) al inicio del <head> de la web
   normal si quieres que las smart TV y las cajas de Android TV /
   Fire TV abran automáticamente /tv/.
   Siempre se puede forzar con  ?tv=1  o desactivar con  ?tv=0
   ============================================================ */
(function () {
  try {
    var p = new URLSearchParams(location.search).get('tv');
    if (p === '0') { sessionStorage.setItem('ftv_no_tv', '1'); return; }
    if (sessionStorage.getItem('ftv_no_tv')) return;
    var ua = navigator.userAgent;
    var isTV = p === '1' || /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|AFT[A-Z]|Android.*TV|GoogleTV|BRAVIA|CrKey|Roku|VIDAA|Hisense|Philips/i.test(ua);
    if (isTV) location.replace('tv/index.html');
  } catch (e) { /* si algo falla, se queda en la web normal */ }
})();
