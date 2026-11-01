(function () {
  var chair = document.querySelector(".header-content .chair");
  var canvas = document.getElementById("chair-runner");
  var stage = document.querySelector(".chair-runner-stage");
  var exitButton = document.querySelector(".chair-runner-exit");
  if (!chair || !canvas || !stage || !exitButton) return;

  var ctx = canvas.getContext("2d");
  var STORAGE_KEY = "chair-runner-best";
  var OBSTACLE_SRCS = [
    "images/game/obstacle_1.png",
    "images/game/obstacle_2.png",
    "images/game/obstacle_3.png",
    "images/game/obstacle_4.png",
    "images/game/obstacle_5.png",
    "images/game/obstacle_6.png"
  ];

  var assets = {
    player: null,
    bg: null,
    floor: null,
    obstacles: []
  };

  var state = "idle";
  var width = 0;
  var height = 0;
  var dpr = 1;
  var lastTs = 0;
  var rafId = 0;

  var player = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    vy: 0,
    onGround: true
  };
  var obstacles = [];
  var lastObstacleIndex = -1;
  var spawnTimer = 0;
  var elapsed = 0;
  var score = 0;
  var best = 0;
  var bgOffset = 0;
  var floorOffset = 0;
  var groundH = 0;
  var floorY = 0;
  var spriteScale = 1;
  var obstacleScale = 1;
  var floorTileW = 1;
  var bgTileW = 1;
  var bgTileH = 1;
  var gravity = 2400;
  var jumpVelocity = -820;
  var hangTime = 0.7;
  var flash = 0;
  var playerRotation = 0;
  var crashTimer = 0;
  var crashDuration = 0.5;
  var crashOffsetX = 0;
  var crashOffsetY = 0;


  try {
    best = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
  } catch (e) {
    best = 0;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Failed to load " + src)); };
      img.src = src;
    });
  }

  var assetsReady = null;

  function loadAssets() {
    if (!assetsReady) {
      assetsReady = Promise.all([
        loadImage("images/game/player.png"),
        loadImage("images/game/bg.png"),
        loadImage("images/game/floor.png")
      ].concat(OBSTACLE_SRCS.map(loadImage))).then(function (images) {
        assets.player = images[0];
        assets.bg = images[1];
        assets.floor = images[2];
        assets.obstacles = images.slice(3);
      });
    }
    return assetsReady;
  }

  var touchQuery = window.matchMedia("(hover: none), (pointer: coarse)");
  // Phones and narrow windows are too small to play inside the header.
  var fullscreenQuery = window.matchMedia(
    "(hover: none), (pointer: coarse), (max-width: 750px)"
  );

  function isTouch() {
    return touchQuery.matches;
  }

  function applyLayoutMode() {
    var fullscreen = state !== "idle" && fullscreenQuery.matches;
    document.body.classList.toggle("game-fullscreen", fullscreen);
    document.body.classList.toggle(
      "game-rotated",
      fullscreen && isTouch() && window.innerHeight > window.innerWidth
    );
  }

  function requestDeviceFullscreen() {
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      Promise.resolve(request.call(root)).then(function () {
        if (screen.orientation && screen.orientation.lock) {
          return screen.orientation.lock("landscape");
        }
      }).catch(function () { /* CSS rotation covers unsupported browsers */ });
    } catch (e) { /* CSS rotation covers unsupported browsers */ }
  }

  function exitDeviceFullscreen() {
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit || !(document.fullscreenElement || document.webkitFullscreenElement)) return;
    try {
      Promise.resolve(exit.call(document)).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function resize() {
    // clientWidth/clientHeight ignore the CSS rotation applied in portrait.
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutSprites();
  }

  function layoutSprites() {
    groundH = Math.round(Math.min(150, Math.max(80, height * 0.16)));
    floorY = height - groundH + groundH * 0.34;
    var targetPlayerH = Math.round(
      2 * Math.min(250, Math.max(120, height * 0.32))
    );
    spriteScale = targetPlayerH / assets.player.naturalHeight;
    obstacleScale = spriteScale * 0.8;
    player.w = assets.player.naturalWidth * spriteScale;
    player.h = assets.player.naturalHeight * spriteScale;
    player.x = Math.round(Math.min(140, width * 0.09));
    if (player.onGround || state !== "playing") {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
    var floorScale = groundH / assets.floor.naturalHeight;
    floorTileW = assets.floor.naturalWidth * floorScale;
    var bgScale = height / assets.bg.naturalHeight;
    bgTileH = height;
    bgTileW = assets.bg.naturalWidth * bgScale;
    gravity = height * 2.5;
    var peak = player.h * 0.4;
    jumpVelocity = -Math.sqrt(2 * gravity * peak);
    hangTime = (2 * Math.abs(jumpVelocity)) / gravity;
  }

  function speedNow() {
    return Math.min(900, 340 + elapsed * 18);
  }

  function spawnDelayNow() {
    return Math.max(0.62, 1.7 - elapsed * 0.045);
  }

  function resetRun() {
    obstacles = [];
    spawnTimer = 0.9;
    elapsed = 0;
    score = 0;
    bgOffset = 0;
    floorOffset = 0;
    player.vy = 0;
    player.onGround = true;
    player.y = floorY - player.h;
    flash = 0;
    playerRotation = 0;
    crashTimer = 0;
    crashOffsetX = 0;
    crashOffsetY = 0;
  }

  function spawnObstacle() {
    var index;

    do {
      index = Math.floor(Math.random() * assets.obstacles.length);
    } while (
      assets.obstacles.length > 1 &&
      index === lastObstacleIndex
    );

    lastObstacleIndex = index;

    var img = assets.obstacles[index];
    var w = img.naturalWidth * obstacleScale;
    var h = img.naturalHeight * obstacleScale;

    obstacles.push({
      img: img,
      x: width + 20,
      y: floorY - h,
      w: w,
      h: h
    });
  }

  function hitbox(x, y, w, h, insetX, insetY) {
    return {
      x: x + w * insetX,
      y: y + h * insetY,
      w: w * (1 - insetX * 2),
      h: h * (1 - insetY * 2)
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function jump() {
    if (state === "ready") {
      state = "playing";
      resetRun();
      player.vy = jumpVelocity;
      player.onGround = false;
      return;
    }
    if (state === "gameover") {
      state = "playing";
      resetRun();
      return;
    }
    if (state === "playing" && player.onGround) {
      player.vy = jumpVelocity;
      player.onGround = false;
    }
  }

  function startCrash() {
    if (state !== "playing") return;

    state = "crashing";
    crashTimer = 0;
    playerRotation = 0;
    crashOffsetX = 0;
    crashOffsetY = 0;
    flash = 0.2;
  }


  function endGame() {
    state = "gameover";
    flash = 0.35;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(STORAGE_KEY, String(best));
      } catch (e) { /* ignore quota / private mode */ }
    }
  }

  function update(dt) {
    if (state === "crashing") {

      crashTimer += dt;

      var progress = Math.min(crashTimer / crashDuration, 1);

      var spinProgress = Math.min(progress / 0.78, 1);

      playerRotation = Math.PI * 4 * (1 - Math.pow(1 - spinProgress, 2));

      // Knock sideways, then return towards the starting position.
      crashOffsetX = 38 * Math.sin(progress * Math.PI) * (1 - progress * 0.25);

      // Small upward lift during the spin.
      if (progress < 0.75) {
        crashOffsetY = -26 * Math.sin((progress / 0.75) * Math.PI);
      } else {
        // Small bounce as the crash finishes.
        var landing = (progress - 0.75) / 0.25;
        crashOffsetY = -12 * Math.sin(landing * Math.PI);
      }

      if (progress >= 1) {
        crashOffsetX = 0;
        crashOffsetY = 0;
        endGame();
      }

      return;
    }
    if (state !== "playing") return;

    elapsed += dt;
    score = Math.floor(elapsed * 10);

    var speed = speedNow();
    bgOffset = (bgOffset + speed * 0.32 * dt) % bgTileW;
    floorOffset = (floorOffset + speed * dt) % floorTileW;

    player.vy += gravity * dt;
    player.y += player.vy * dt;
    var groundPlayerY = floorY - player.h;
    if (player.y >= groundPlayerY) {
      player.y = groundPlayerY;
      player.vy = 0;
      player.onGround = true;
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      var minGap = speed * hangTime * 0.9;
      var last = obstacles[obstacles.length - 1];
      if (!last || width + 20 - last.x >= minGap) {
        spawnObstacle();
        spawnTimer = spawnDelayNow() * (0.72 + Math.random() * 0.5);
      } else {
        spawnTimer = 0.04;
      }
    }

    var playerBox = hitbox(player.x, player.y, player.w, player.h, 0.2, 0.12);
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed * dt;
      if (obstacles[i].x + obstacles[i].w < -40) {
        obstacles.splice(i, 1);
        continue;
      }
      var obBox = hitbox(obstacles[i].x, obstacles[i].y, obstacles[i].w, obstacles[i].h, 0.12, 0.08);
      if (overlaps(playerBox, obBox)) {
        startCrash();
        break;
      }
    }
  }

  function drawRepeating(img, offset, y, tileW, tileH) {
    var x = -offset;
    while (x < width) {
      ctx.drawImage(img, x, y, tileW, tileH);
      x += tileW;
    }
  }

  function drawScene() {
    ctx.clearRect(0, 0, width, height);
    var sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#010208");
    sky.addColorStop(1, "#041428");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    var bgY = 0;
    drawRepeating(assets.bg, bgOffset % bgTileW, bgY, bgTileW, bgTileH);
    drawRepeating(assets.floor, floorOffset % floorTileW, height - groundH, floorTileW, groundH);

    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
    }

    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
    }

    ctx.save();

    ctx.translate(
      player.x + player.w / 2 + crashOffsetX,
      player.y + player.h / 2 + crashOffsetY
    );

    ctx.rotate(playerRotation);

    ctx.drawImage(
      assets.player,
      -player.w / 2,
      -player.h / 2,
      player.w,
      player.h
    );

    ctx.restore();

    if (flash > 0) ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "400 22px Montserrat, sans-serif";
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText("Score " + String(score).padStart(5, "0"), width - 24, 36);
    ctx.fillStyle = "#FEAD7B";
    ctx.font = "400 14px Montserrat, sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText("Best " + String(best).padStart(5, "0"), width - 24, 58);

    var action = isTouch() ? "Tap" : "Press space";
    if (state === "ready") {
      drawBanner("OFFICE RUNNER", action + " to start");
    } else if (state === "gameover") {
      drawBanner("GAME OVER", action + " to try again");
    }
  }


  function drawBanner(title, subtitle) {
    ctx.save();
    ctx.textAlign = "center";
  
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 42px Montserrat, sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillText(title, width / 2, height * 0.4);
  
    ctx.fillStyle = "#FEAD7B";
    ctx.font = "400 18px Montserrat, sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText(subtitle, width / 2, height * 0.46);
  
    ctx.restore();
  }
  

  function frame(ts) {
    if (state === "idle") return;
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (flash > 0) flash -= dt;
    update(dt);
    drawScene();
    rafId = requestAnimationFrame(frame);
  }

  function launch() {
    if (state !== "idle") return;
    // Must run inside the click/tap gesture or the browser rejects it.
    if (isTouch()) requestDeviceFullscreen();
    loadAssets().then(function () {
      if (state !== "idle") return;
      document.body.classList.add("game-active");
      stage.removeAttribute("hidden");
      stage.setAttribute("aria-hidden", "false");
      state = "ready";
      applyLayoutMode();
      resize();
      resetRun();
      lastTs = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
      canvas.focus();
    });
  }

  function exitGame() {
    if (state === "idle") return;
    state = "idle";
    cancelAnimationFrame(rafId);
    document.body.classList.remove("game-active");
    applyLayoutMode();
    stage.setAttribute("hidden", "");
    stage.setAttribute("aria-hidden", "true");
    exitDeviceFullscreen();
    // Tell the descriptor to clear sticky hover/focus from the launch tap
    // and resume rotating — especially important on mobile where blur never comes.
    chair.dispatchEvent(new CustomEvent("chair-runner:exit", { bubbles: true }));
    // Restore focus for keyboard users; descriptor ignores this programmatic focus.
    chair.focus({ preventScroll: true });
  }

  chair.addEventListener("click", launch);
  chair.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      launch();
    }
  });

  window.addEventListener("keydown", function (e) {
    if (state === "idle") return;
    if (e.key === "Escape") {
      e.preventDefault();
      exitGame();
      return;
    }
    if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      jump();
    }
  }, true);

  canvas.addEventListener("pointerdown", function (e) {
    if (state === "idle") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    jump();
  });

  exitButton.addEventListener("click", exitGame);

  function handleViewportChange() {
    if (state === "idle") return;
    applyLayoutMode();
    resize();
  }

  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
})();
