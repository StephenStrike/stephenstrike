
(function () {
  var words = [
    "Developer",
    "Product Builder",
    "Technical Leader",
    "Startup Partner",
    "Fractional CTO",
    "Growth Advisor",
    "Product Strategy"
  ];

  var wordElement = document.querySelector(".nav-logo__word");
  var chair = document.querySelector(".chair");

  if (!wordElement || !chair) return;

  var index = 0;
  var intervalMs = 2800;
  var transitionMs = 400;

  var interval = null;
  var transitionTimeout = null;
  var isHovered = false;
  var isFocused = false;
  // Suppress hover/focus cues briefly after the game exits. Restoring the chair
  // from display:none can re-fire pointerenter under a still-present cursor, and
  // mobile taps often leave a sticky hover/focus flag with no matching blur.
  var suppressPointerCue = false;
  var suppressPointerCueTimeout = null;
  var transitionId = 0;

  function transitionTo(word) {
    // Cancel any previous transition
    clearTimeout(transitionTimeout);
    var id = ++transitionId;

    wordElement.classList.remove("is-entering");
    wordElement.classList.add("is-exiting");

    transitionTimeout = setTimeout(function () {
      if (id !== transitionId) return;

      wordElement.textContent = word;
      wordElement.classList.remove("is-exiting");
      wordElement.classList.add("is-entering");

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (id === transitionId) {
            wordElement.classList.remove("is-entering");
          }
        });
      });
    }, transitionMs);
  }

  function cycle() {
    if (isHovered || isFocused) return;

    index = (index + 1) % words.length;
    transitionTo(words[index]);
  }

  function startRotation() {
    clearInterval(interval);
    interval = setInterval(cycle, intervalMs);
  }

  function updateState() {
    var playing = isHovered || isFocused;

    clearInterval(interval);

    if (playing) {
      transitionTo("Play Game");
    } else {
      transitionTo(words[index]);
      startRotation();
    }
  }

  chair.addEventListener("pointerenter", function () {
    if (suppressPointerCue) return;
    isHovered = true;
    updateState();
  });

  chair.addEventListener("pointerleave", function () {
    isHovered = false;
    updateState();
  });

  chair.addEventListener("focus", function () {
    if (suppressPointerCue) return;
    isFocused = true;
    updateState();
  });

  chair.addEventListener("blur", function () {
    isFocused = false;
    updateState();
  });

  // Game exit (Escape / X): clear sticky launch cues and resume rotation.
  chair.addEventListener("chair-runner:exit", function () {
    isHovered = false;
    isFocused = false;
    suppressPointerCue = true;
    clearTimeout(suppressPointerCueTimeout);
    updateState();
    suppressPointerCueTimeout = setTimeout(function () {
      suppressPointerCue = false;
      // On hover-capable pointers, re-sync if the cursor is still over the chair.
      // Skip on touch (hover: none) so a sticky mobile :hover cannot pin "Play Game".
      if (
        window.matchMedia("(hover: hover)").matches &&
        chair.matches(":hover")
      ) {
        isHovered = true;
        updateState();
      }
    }, 100);
  });

  startRotation();
})();
