(function () {
  var chair = document.querySelector(".header-content .chair");
  if (!chair) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function maxPx() {
    var wrap = chair.closest(".header-content");
    var w = wrap ? wrap.offsetWidth : window.innerWidth;
    return Math.min(56, w * -0.02);
  }

  function move(clientX) {
    var w = window.innerWidth || 1;
    var x = ((clientX / w) * 3 - 1) * maxPx();
    chair.style.transform = "translateX(calc(-50% + " + x.toFixed(2) + "px))";
  }

  window.addEventListener("mousemove", function (e) {
    move(e.clientX);
  }, { passive: true });

  window.addEventListener("touchmove", function (e) {
    if (e.touches[0]) move(e.touches[0].clientX);
  }, { passive: true });
})();
