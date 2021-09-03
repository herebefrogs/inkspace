import { isMobile } from './mobile';
import { checkMonetization, isMonetizationEnabled } from './monetization';
import { loadSongs, playSound, playSong } from './sound';
import { initSpeech } from './speech';
import { save, load } from './storage';
import { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT, CHARSET_SIZE, initCharset, renderText } from './text';
import { choice, clamp, getRandSeed, setRandSeed, lerp, loadImg, rand, randInt } from './utils';


const konamiCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
let konamiIndex = 0;

// GAMEPLAY VARIABLES

const TITLE_SCREEN = 0;
const GAME_SCREEN = 1;
const END_SCREEN = 2;
let screen = TITLE_SCREEN;

// factor by which to reduce both X and Y velocity when player moving diagonally
// so they don't seem to move faster than when traveling vertically or horizontally
// (equals radius of 1 unit at 45 deg angle)
const DIAGONAL_VELOCITY_DRAG = Math.cos(Math.PI / 4);
const TIME_TO_FULL_SPEED = 150;                // in millis, duration till going full speed in any direction

let countdown; // in seconds
let hero;
let crosshair; // coordinate in viewport space (add viewportOffset to convert to map space)
let entities;
let spaceCaptured;
let colorSet;

let speak;

// RENDER VARIABLES

// visible canvas (size will be readjusted on load and on resize)
const [CTX] = createCanvas(480, 360, c);
// full map, rendered off screen
const [MAP_CTX, MAP] = createCanvas(480, 360);
// paint layer, rendered off screen
const [PAINT_CTX, PAINT] = createCanvas(480, 360);
// shrunk down version of paint layer to optimize % of captured space calculation
const [MINI_PAINT_CTX, MINI_PAINT] = createCanvas(160, 120);
// visible portion of the map, seen from camera
const [VIEWPORT_CTX, VIEWPORT] = createCanvas(320, 240);

// camera-window & edge-snapping settings
const CAMERA_WINDOW_X = 100;
const CAMERA_WINDOW_Y = 50;
const CAMERA_WINDOW_WIDTH = VIEWPORT.width - CAMERA_WINDOW_X;
const CAMERA_WINDOW_HEIGHT = VIEWPORT.height - CAMERA_WINDOW_Y;
let viewportOffsetX;
let viewportOffsetY;
let canvasX;
let scaleToFit;

const BLUE_PAINT = '#00a';
const COLOR_SETS = [
  { homeTeam: '#0b6', visitors: '#b08', neutral: '#ab0' },
  { homeTeam: '#61b', visitors: '#1b7', neutral: '#d47' },
  { homeTeam: '#bc0', visitors: '#81a', neutral: '#b09' }
]

const ATLAS = {
  hero: {
    color: '#f0f',
    path: new Path2D('M-5 -5l10 0l0 10l-10 0Z'),
    speed: 100,
    w: 10,
    h: 10
  },
  bullet: {
    path: new Path2D('m0.197 8.28-1.79-8.31c-0.341-2.68 3.79-2.81 3.58 0z'),
    speed: 400,
    // from Inkscape
    w: 9,
    h: 22
  },
  splash: {
    path: new Path2D('m-11.3 0.723s0 2.75-4.36 1.49c-4.88-1.41-3.89 8.01-0.389 7.3 3.5-0.707 5.45-4.87 5.76-1.57 0.311 3.3-4.05 5.97-4.05 5.97s-2.17 3.31 2.02 2.59c2.31-0.397 2.96-4.71 2.96-4.71 1.95-0.626 0.467 4 0.467 4 0.346 1.63 1.87-0.628 1.87-0.628 0.497-2.04 0.0232-3.48 1.63-3.22 1.95 1.05-0.517 1.24-0.623 5.97-0.0696 2.51 3.27 1.46 2.88-0.628-0.0411-2.84 0.194-4.07 2.8-4.08 5.32 1.81 0.438 3.37 4.82 6.36 4 1.48 6.97-2.56 4.51-9.11-0.714-2.41 3.54 0.536 5.84 2.91 1.42 1.09 4.2-0.888 1.56-2.12-3.55-1.05-5.44-1.78-6.3-3.53 0.658-2.09 3.86 1.27 5.99 2.36 2.88 0.942 7.82-3.29 1.32-7.22-2.94-1.48-5.61 2.15-6.77-1.65-0.699-4.62 4.23-5.21 7.24-6.44 0.418-1.34-0.199-1.81-1.01-2.12-1.74 0.476-3.23 2.5-4.36 2.04 0.39-0.79 1.26-1.19 0.7-2.75-0.458-1.72-2.13 0.196-1.71-0.707 0.574-3.96-2.43-4-3.27-1.81-1.13 3.73-1.66 2.4-2.41 2.91-2.48-2.08 3.03-5.02-1.4-11.5-1.98-1.75-7.81 0.634-6.77 3.61 1.09 3.78-0.747 4.11-2.02 5.1-3.81-0.288-5.05-2.18-6.3-4.32-3.07-2.3-1.48 1.33-1.48 1.33 3.02 1.7 5.29 4.4 5.29 4.4-1.94-0.755-4.12-0.222-2.1 1.65-4.17-2.85-6.07-0.236-2.57 0.864 1.61 0.218 1.38 1.05 1.17 1.88-1.92 1.71-2.39-0.029-4.12-0.628-1.34-0.209-2.16 0.778-0.623 1.57 1.19 0.0964 2.89 0.295 4.28 2.2-5.1 0.00198-2.86 2.48-0.467 2.2z'),
    sound: [1.01,.5,195.9977,.01,.04,.06,,2.4,-6.7,.1,,,,,,,,.7,.07]
  }
};

const MAX_AMNO = 100;
const AMNO_REPLENISH_TIME = 1; // in seconds
const PAINT_RATE = 0.1; // in seconds, 10 shots per seconds
const DISTANCE_TO_TARGET_RANGE = 5; // in pixel
const GROUP_FOE = 1;
const GROUP_FRIEND = 1;

// LOOP VARIABLES

let currentTime;
let elapsedTime;
let lastTime;
let requestId;
let running = true;

// GAMEPLAY HANDLERS

function unlockExtraContent() {
  // NOTE: remember to update the value of the monetization meta tag in src/index.html to your payment pointer
}


function createEntity(type, group, x = 0, y = 0) {
  const cfg = ATLAS[type];
  return {
    ...cfg,
    group,
    moveDown: 0,
    moveLeft: 0,
    moveRight: 0,
    moveUp: 0,
    type,
    velX: 0,
    velY: 0,
    // coordinates in VIEWPORT space (MAP - VIEWPORT offset)
    view: {},
    // coordinates in MAP space
    x,
    y,
  };
};

function startGame() {
  // setRandSeed(getRandSeed());
  // if (isMonetizationEnabled()) { unlockExtraContent() }
  konamiIndex = 0;
  countdown = 60;
  colorSet = choice(COLOR_SETS);
  viewportOffsetX = viewportOffsetY = 0;
  hero = {
    ...createEntity('hero', GROUP_FRIEND, VIEWPORT.width / 2, VIEWPORT.height / 2),
    paintAmno: MAX_AMNO,
    amnoReplenishTime: 0,
  };
  entities = [
    hero,
  ];
  crosshair = {
    view: { x: hero.x, y: hero.y },
    map: {}
  };
  renderMap();
  resetPaint();
  screen = GAME_SCREEN;
};

function testAABBCollision(entity1, entity2) {
  const test = {
    entity1MaxX: entity1.x + entity1.w,
    entity1MaxY: entity1.y + entity1.h,
    entity2MaxX: entity2.x + entity2.w,
    entity2MaxY: entity2.y + entity2.h,
  };

  test.collide = entity1.group !== entity2.group
    && entity1.x < test.entity2MaxX
    && test.entity1MaxX > entity2.x
    && entity1.y < test.entity2MaxY
    && test.entity1MaxY > entity2.y;

  return test;
};

// entity1 collided into entity2
function correctAABBCollision(entity1, entity2, test) {
  const { entity1MaxX, entity1MaxY, entity2MaxX, entity2MaxY } = test;

  const deltaMaxX = entity1MaxX - entity2.x;
  const deltaMaxY = entity1MaxY - entity2.y;
  const deltaMinX = entity2MaxX - entity1.x;
  const deltaMinY = entity2MaxY - entity1.y;

  // AABB collision response (homegrown wall sliding, not physically correct
  // because just pushing along one axis by the distance overlapped)

  // entity1 moving down/right
  if (entity1.velX > 0 && entity1.velY > 0) {
    if (deltaMaxX < deltaMaxY) {
      // collided right side first
      entity1.x -= deltaMaxX;
    } else {
      // collided top side first
      entity1.y -= deltaMaxY;
    }
  }
  // entity1 moving up/right
  else if (entity1.velX > 0 && entity1.velY < 0) {
    if (deltaMaxX < deltaMinY) {
      // collided right side first
      entity1.x -= deltaMaxX;
    } else {
      // collided bottom side first
      entity1.y += deltaMinY;
    }
  }
  // entity1 moving right
  else if (entity1.velX > 0) {
    entity1.x -= deltaMaxX;
  }
  // entity1 moving down/left
  else if (entity1.velX < 0 && entity1.velY > 0) {
    if (deltaMinX < deltaMaxY) {
      // collided left side first
      entity1.x += deltaMinX;
    } else {
      // collided top side first
      entity1.y -= deltaMaxY;
    }
  }
  // entity1 moving up/left
  else if (entity1.velX < 0 && entity1.velY < 0) {
    if (deltaMinX < deltaMinY) {
      // collided left side first
      entity1.x += deltaMinX;
    } else {
      // collided bottom side first
      entity1.y += deltaMinY;
    }
  }
  // entity1 moving left
  else if (entity1.velX < 0) {
    entity1.x += deltaMinX;
  }
  // entity1 moving down
  else if (entity1.velY > 0) {
    entity1.y -= deltaMaxY;
  }
  // entity1 moving up
  else if (entity1.velY < 0) {
    entity1.y += deltaMinY;
  }
};

function constrainToViewport(entity) {
  if (entity.x < 0) {
    entity.x = 0;
  } else if (entity.x > MAP.width - entity.w) {
    entity.x = MAP.width - entity.w;
  }
  if (entity.y < 0) {
    entity.y = 0;
  } else if (entity.y > MAP.height - entity.h) {
    entity.y = MAP.height - entity.h;
  }
};


function updateCameraWindow() {
  // edge snapping
  if (0 < viewportOffsetX && hero.x < viewportOffsetX + CAMERA_WINDOW_X) {
    viewportOffsetX = Math.max(0, Math.round(hero.x - CAMERA_WINDOW_X));
  }
  else if (viewportOffsetX < MAP.width - VIEWPORT.width && hero.x + hero.w > viewportOffsetX + CAMERA_WINDOW_WIDTH) {
    viewportOffsetX = Math.min(MAP.width - VIEWPORT.width, Math.round(hero.x + hero.w - CAMERA_WINDOW_WIDTH));
  }
  if (0 < viewportOffsetY && hero.y < viewportOffsetY + CAMERA_WINDOW_Y) {
    viewportOffsetY = Math.max(0, Math.round(hero.y - CAMERA_WINDOW_Y));
  }
  else if (viewportOffsetY < MAP.height - VIEWPORT.height && hero.y + hero.h > viewportOffsetY + CAMERA_WINDOW_HEIGHT) {
    viewportOffsetY = Math.min(MAP.height - VIEWPORT.height, Math.round(hero.y + hero.h - CAMERA_WINDOW_HEIGHT));
  }
};

function updateEntityViewportPosition(entity) {
  entity.view.x = Math.round(entity.x - viewportOffsetX);
  entity.view.y = Math.round(entity.y - viewportOffsetY);
}

function updateCrosshairMapPosition() {
  crosshair.x = Math.round(crosshair.view.x + viewportOffsetX);
  crosshair.y = Math.round(crosshair.view.y + viewportOffsetY);
}

function updateHeroVelocity() {
  if (hero.moveLeft || hero.moveRight) {
    hero.velX = (hero.moveLeft > hero.moveRight ? -1 : 1) * lerp(0, 1, (currentTime - Math.max(hero.moveLeft, hero.moveRight)) / TIME_TO_FULL_SPEED)
  } else {
    hero.velX = 0;
  }
  if (hero.moveDown || hero.moveUp) {
    hero.velY = (hero.moveUp > hero.moveDown ? -1 : 1) * lerp(0, 1, (currentTime - Math.max(hero.moveUp, hero.moveDown)) / TIME_TO_FULL_SPEED)
  } else {
    hero.velY = 0;
  }
}

function updateEntityPosition(entity) {
  const ratio = entity.velX && entity.velY ? DIAGONAL_VELOCITY_DRAG : 1;
  const distance = entity.speed * elapsedTime * ratio;
  entity.x += distance * entity.velX;
  entity.y += distance * entity.velY;
}

function velocityForTarget(srcX, srcY, destX, destY) {
  const hypotenuse = Math.sqrt(Math.pow(destX - srcX, 2) + Math.pow(destY - srcY, 2))
  const adjacent = destX - srcX;
  const opposite = destY - srcY;
  // [
  //  velX = cos(alpha),
  //  velY = sin(alpha),
  //  alpha
  // ]
  return [
    adjacent / hypotenuse,
    opposite / hypotenuse,
    Math.atan2(opposite / hypotenuse, adjacent / hypotenuse) + Math.PI/2,
  ];
}

function firePaintBullet(entity) {
  const x = entity.x;
  const y = entity.y;
  const [velX, velY, angle] = velocityForTarget(x, y, crosshair.x, crosshair.y);
  entities.push({
    ...createEntity('bullet', entity.group, x, y),
    angle,
    color: entity.type === 'hero' ? colorSet.homeTeam : colorSet.visitors,
    velX,
    velY,
    destX: crosshair.x,
    destY: crosshair.y
  })
}

// TODO will break down if entity is not hero, as crosshair applies to hero only
function painting(entity) {
  return entity.painting || crosshair.painting;
}

// TODO splash could be animated to quickly scale to final size
function paintSplash(x, y, color) {
  PAINT_CTX.fillStyle = color;
  const sw = rand(0.9, 1.1);
  const sh = rand(0.9, 1.1);
  const angle = rand(0, 6.28);  // in radian
  PAINT_CTX.save();
  // apply some random rotation and scaling
  PAINT_CTX.transform(
    sw, 0, 0, sh,
    x, y
  );
  PAINT_CTX.rotate(angle);
  PAINT_CTX.fill(ATLAS.splash.path);
  PAINT_CTX.restore();
}

function withinDestinationRange(entity) {
  return Math.sqrt(Math.pow(entity.destX - entity.x, 2) + Math.pow(entity.destY - entity.y, 2)) <= DISTANCE_TO_TARGET_RANGE;
}

function replenishRate() {
  return AMNO_REPLENISH_TIME;
}

function updateEntityCounters(entity) {
  switch (entity.type) {
    case 'hero':
      // update amno replenish rate
      entity.amnoReplenishTime += elapsedTime;
      const rate = replenishRate();
      if (entity.amnoReplenishTime > rate) {
        entity.paintAmno = Math.min(entity.paintAmno + Math.floor(entity.amnoReplenishTime / rate), MAX_AMNO)
        entity.amnoReplenishTime %= rate;
      }

      // update painting rate
      if (painting(entity)) {
        entity.paintTime += elapsedTime;

        if (entity.paintAmno && entity.paintTime > PAINT_RATE) {
          entity.paintTime %= PAINT_RATE;
          entity.paintAmno -= 1;
          firePaintBullet(entity);
        }
      }
      break;
    case 'bullet':
      if (withinDestinationRange(entity)) {
        // mark bullet for deletion
        entity.dead = true;
        // paint
        paintSplash(entity.destX, entity.destY, entity.color);
        // sound
        playSound(ATLAS.splash.sound);
      }
      break;
  }
};

function updateEntity(entity) {
  updateEntityPosition(entity);
  updateEntityCounters(entity);
}

function update() {
  switch (screen) {
    case GAME_SCREEN:
      countdown -= elapsedTime;
      if (countdown < 0) {
        screen = END_SCREEN;
      }
      updateHeroVelocity();
      entities.forEach(updateEntity);
      entities.slice(1).forEach((entity) => {
        const test = testAABBCollision(hero, entity);
        if (test.collide) {
          correctAABBCollision(hero, entity, test);
        }
      });
      constrainToViewport(hero);
      updateCameraWindow();
      entities.forEach(updateEntityViewportPosition);
      updateCrosshairMapPosition();
      spaceCaptured = countColors();
      // FIXME some bullets miss the target? and survive
      entities = entities.filter(entity => !entity.dead);
      break;
  }
};

// RENDER HANDLERS

function createCanvas(width, height, canvas, ctx) {
  canvas = canvas || c.cloneNode();
  canvas.width = width;
  canvas.height = height;
  ctx = canvas.getContext('2d');
  return [ctx, canvas];
}

function blit() {
  // copy backbuffer onto visible canvas, scaling it to screen dimensions
  CTX.drawImage(
    VIEWPORT,
    0, 0, VIEWPORT.width, VIEWPORT.height,
    0, 0, c.width, c.height
  );
};

function render() {
  VIEWPORT_CTX.fillStyle = '#fff';
  VIEWPORT_CTX.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

  switch (screen) {
    case TITLE_SCREEN:
      renderText('title screen', CHARSET_SIZE, CHARSET_SIZE);
      renderText(isMobile ? 'tap to start' : 'press any key', VIEWPORT.width / 2, VIEWPORT.height / 2, ALIGN_CENTER);
      if (konamiIndex === konamiCode.length) {
        renderText('konami mode on', VIEWPORT.width - CHARSET_SIZE, CHARSET_SIZE, ALIGN_RIGHT);
      }
      break;
    case GAME_SCREEN:
      VIEWPORT_CTX.drawImage(
        MAP,
        // adjust x/y offset
        viewportOffsetX, viewportOffsetY, VIEWPORT.width, VIEWPORT.height,
        0, 0, VIEWPORT.width, VIEWPORT.height
      );
      VIEWPORT_CTX.drawImage(
        PAINT,
        // adjust x/y offset
        viewportOffsetX, viewportOffsetY, VIEWPORT.width, VIEWPORT.height,
        0, 0, VIEWPORT.width, VIEWPORT.height
      );
      entities.forEach(entity => renderEntity(entity));
      renderCrosshair();
      renderCountdown();
      renderSpaceCaptured();
      renderPaintAmno();
      break;
    case END_SCREEN:
      renderText('end screen', CHARSET_SIZE, CHARSET_SIZE);
      // renderText(monetizationEarned(), TEXT.width - CHARSET_SIZE, TEXT.height - 2*CHARSET_SIZE, ALIGN_RIGHT);
      break;
  }

  blit();
};

function renderCrosshair() {
  VIEWPORT_CTX.strokeStyle = painting(hero) ? '#000' : '#fff';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 1, crosshair.view.y - 1, 2, 2);
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 6, crosshair.view.y - 6, 12, 12);
}

function renderSpaceCaptured() {
  VIEWPORT_CTX.strokeStyle = '#000';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(
    VIEWPORT.width - 100 - CHARSET_SIZE - 1, CHARSET_SIZE - 1,
    100 + 2, CHARSET_SIZE + 2
  );
  VIEWPORT_CTX.fillStyle = colorSet.neutral;
  VIEWPORT_CTX.fillRect(
    VIEWPORT.width - 100 - CHARSET_SIZE, CHARSET_SIZE,
    100, CHARSET_SIZE
  );
  VIEWPORT_CTX.fillStyle = colorSet.homeTeam;
  VIEWPORT_CTX.fillRect(
    VIEWPORT.width - spaceCaptured.homeTeam - CHARSET_SIZE, CHARSET_SIZE,
    spaceCaptured.homeTeam, CHARSET_SIZE
  );
  VIEWPORT_CTX.fillStyle = colorSet.visitors;
  VIEWPORT_CTX.fillRect(
    VIEWPORT.width - 100 - CHARSET_SIZE, CHARSET_SIZE,
    spaceCaptured.visitors, CHARSET_SIZE
  );
  //renderText(`captured: ${bluePercentage || 0}%`, VIEWPORT.width - CHARSET_SIZE, CHARSET_SIZE, ALIGN_RIGHT);
}

function renderPaintAmno() {
  VIEWPORT_CTX.strokeStyle = '#000';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(
    CHARSET_SIZE - 1, VIEWPORT.height - CHARSET_SIZE - Math.floor(MAX_AMNO/3) - 1,
    2*CHARSET_SIZE + 2, Math.floor(MAX_AMNO/3) + 2
  );
  VIEWPORT_CTX.fillStyle = colorSet.neutral;
  VIEWPORT_CTX.fillRect(CHARSET_SIZE, VIEWPORT.height - CHARSET_SIZE - Math.floor(MAX_AMNO/3), 2*CHARSET_SIZE, Math.floor(MAX_AMNO/3));
  VIEWPORT_CTX.fillStyle = colorSet.homeTeam;
  VIEWPORT_CTX.fillRect(CHARSET_SIZE, VIEWPORT.height - CHARSET_SIZE - hero.paintAmno/3, 2*CHARSET_SIZE, hero.paintAmno/3);

  // renderText(`paint: ${hero.paintAmno}`, CHARSET_SIZE, VIEWPORT.height - 2*CHARSET_SIZE);
};

function renderCountdown() {
  const minutes = Math.floor(Math.ceil(countdown) / 60);
  const seconds = Math.ceil(countdown) - minutes * 60;
  renderText(`${minutes}:${seconds <= 9 ? '0' : ''}${seconds}`, CHARSET_SIZE, CHARSET_SIZE);

};

function renderEntity(entity, ctx = VIEWPORT_CTX) {
  ctx.save();
  ctx.fillStyle = entity.color;
  ctx.translate(entity.view.x, entity.view.y);
  ctx.rotate(entity.angle);
  ctx.fill(entity.path);
  ctx.restore();
  // DEBUG
  // ctx.strokeStyle = '#f0f';
  // ctx.strokeRect(entity.view.x, entity.view.y, entity.w, entity.h);
  // if (entity.type === 'bullet') {
  //   ctx.strokeStyle = '#0f0';
  //   ctx.strokeRect(entity.destX, entity.destY, 2, 2);
  // }
};

function renderMap() {
  MAP_CTX.fillStyle = '#aaa';
  MAP_CTX.fillRect(0, 0, MAP.width, MAP.height);
  // TODO cache map by rendering static entities on the MAP canvas
  MAP_CTX.fillStyle = '#666';
  const SIZE = 40;
  for (let y = 0; y < MAP.height; y += SIZE) {
    for (let x = 0; x < MAP.width; x += 2*SIZE) {
      MAP_CTX.fillRect(x - ((y/SIZE)%2)*SIZE, y, SIZE, SIZE);
    }
  }
};

// 0-255 -> 0-f
const toHex = i => (i>>4).toString(16)

function countColors() {
  // make a scaled down version of PAINT to reduce
  // the number of pixels we have to count colors from
  MINI_PAINT_CTX.drawImage(
    PAINT,
    0, 0, PAINT.width, PAINT.height,
    0, 0, MINI_PAINT.width, MINI_PAINT.height,
  );

  const imageData = MINI_PAINT_CTX.getImageData(0, 0, MINI_PAINT.width, MINI_PAINT.height);
  const totalPixels = imageData.width * imageData.height;
  let coloredPixels = {};
  const data = imageData.data;
  for (let p = 0; p < data.length; p += 4) {
    // discard anti-aliased colors
    if (data[p+3] === 255) {
      const color = '#' + [data[p], data[p+1], data[p+2]].map(toHex).join('');
      coloredPixels[color] = (coloredPixels[color] || 0) + 1;
    }
  }
  // pixel counts to percentage of total pixels (e.g. blue = 4.2%)
  return {
    homeTeam: ((coloredPixels[colorSet.homeTeam] || 0)*100/totalPixels).toFixed(2),
    visitors: ((coloredPixels[colorSet.visitors] || 0)*100/totalPixels).toFixed(2)
  };
}

function resetPaint() {
  PAINT_CTX.clearRect(0, 0, PAINT.width, PAINT.height);
  spaceCaptured = 0;
}

// LOOP HANDLERS

function loop() {
  if (running) {
    requestId = requestAnimationFrame(loop);
    currentTime = performance.now();
    elapsedTime = (currentTime - lastTime) / 1000;
    update();
    render();
    lastTime = currentTime;
  }
};

function toggleLoop(value) {
  running = value;
  if (running) {
    lastTime = performance.now();
    loop();
  } else {
    cancelAnimationFrame(requestId);
  }
};

// EVENT HANDLERS

onload = async (e) => {
  // the real "main" of the game
  document.title = 'Inkspace';

  onresize();
  //checkMonetization();

  await initCharset(VIEWPORT_CTX);

  toggleLoop(true);
};

onresize = onrotate = function() {
  // scale canvas to fit screen while maintaining aspect ratio
  scaleToFit = Math.min(innerWidth / VIEWPORT.width, innerHeight / VIEWPORT.height);
  c.width = VIEWPORT.width * scaleToFit;
  c.height = VIEWPORT.height * scaleToFit;
  // disable smoothing on image scaling
  CTX.imageSmoothingEnabled = false;

  canvasX = (window.innerWidth - c.width) / 2;
  // fix key events not received on itch.io when game loads in full screen
  window.focus();
};

// UTILS

document.onvisibilitychange = function(e) {
  // pause loop and game timer when switching tabs
  toggleLoop(!e.target.hidden);
};

// INPUT HANDLERS

onkeydown = function(e) {
  // prevent itch.io from scrolling the page up/down
  e.preventDefault();

  if (!e.repeat) {
    switch (screen) {
      case GAME_SCREEN:
        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
          case 'KeyQ':  // French keyboard support
            hero.moveLeft = currentTime;
            break;
          case 'ArrowUp':
          case 'KeyW':
          case 'KeyZ':  // French keyboard support
            hero.moveUp = currentTime;
            break;
          case 'ArrowRight':
          case 'KeyD':
            hero.moveRight = currentTime;
            break;
          case 'ArrowDown':
          case 'KeyS':
            hero.moveDown = currentTime;
            break;
          case 'Space':
            hero.painting = currentTime;
            // preserve paintTime if mouse button was pressed first,
            // initialize to PAINT_RATE if not to fire immediately
            hero.paintTime = hero.paintTime || PAINT_RATE * 1.1;
            break;
          case 'KeyP':
            // Pause game as soon as key is pressed
            toggleLoop(!running);
            break;
        }
        break;
    }
  }
};

onkeyup = function(e) {
  switch (screen) {
    case TITLE_SCREEN:
      if (e.which !== konamiCode[konamiIndex] || konamiIndex === konamiCode.length) {
        startGame();
      } else {
        konamiIndex++;
      }
      break;
    case GAME_SCREEN:
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
        case 'KeyQ': // French keyboard support
          if (hero.moveRight) {
            // reversing right while hero moving left
            hero.moveRight = currentTime;
          }
          hero.moveLeft = 0;
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (hero.moveLeft) {
            // reversing left while hero moving right
            hero.moveLeft = currentTime;
          }
          hero.moveRight = 0;
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'KeyZ': // French keyboard support
          if (hero.moveDown) {
            // reversing down while hero moving up
            hero.moveDown = currentTime;
          }
          hero.moveUp = 0;
          break;
        case 'ArrowDown':
        case 'KeyS':
          if (hero.moveUp) {
            // reversing up while hero moving down
            hero.moveUp = currentTime;
          }
          hero.moveDown = 0;
          break;
        case 'Space':
          hero.painting = 0;
          break;
        }
      break;
    case END_SCREEN:
      switch (e.code) {
        case 'KeyT':
          open(`https://twitter.com/intent/tweet?text=viral%20marketing%20message%20https%3A%2F%2Fgoo.gl%2F${'some tiny Google url here'}`, '_blank');
          break;
        default:
          screen = TITLE_SCREEN;
          break;
      }
      break;
  }
};

// MOBILE INPUT HANDLERS

// PointerEvent is the main standard now, and has precedence over TouchEvent
// adding onmousedown/move/up triggers a MouseEvent and a PointerEvent on platforms that support both (pointer > mouse || touch)

onpointerdown = function(e) {
  e.preventDefault();
  switch (screen) {
    case GAME_SCREEN:
      crosshair.painting = currentTime;
      // preserve paintTime if Space key was pressed first,
      // initialize to PAINT_RATE if not to fire immediately
      hero.paintTime = hero.paintTime || PAINT_RATE * 1.1;
      break;
  }
};

onpointermove = function(e) {
  e.preventDefault();
  switch (screen) {
    case GAME_SCREEN:
      const [touchX, touchY] = pointerLocation(e);
      crosshair.view.x = touchX;
      crosshair.view.y = touchY;
      break;
  }
}

onpointerup = function(e) {
  e.preventDefault();
  switch (screen) {
    case TITLE_SCREEN:
      startGame();
      break;
    case GAME_SCREEN:
      crosshair.painting = 0;
      break;
    case END_SCREEN:
      screen = TITLE_SCREEN;
      break;
  }
};

// utilities
function pointerLocation(e) {
  // for multiple pointers, use e.pointerId to differentiate (on desktop, mouse is always 1, on mobile every pointer even has a different id incrementing by 1)
  // for surface area of touch contact, use e.width and e.height (in CSS pixel) mutiplied by window.devicePixelRatio (for device pixels aka canvas pixels)
  // for canvas space coordinate, use e.layerX and .layerY when e.target = c
  // { id: e.pointerId, x: e.x, y: e.y, w: e.width*window.devicePixelRatio, h: e.height*window.devicePixelRatio};
  
  const pointerInCanvas = e.target === c;

  if (pointerInCanvas) {
    // touch/click happened on canvas, layerX/layerY are already in canvas space
    return [
      Math.round(e.layerX / scaleToFit),
      Math.round(e.layerY / scaleToFit)
    ];
  }

  // touch/click happened outside of canvas (which is centered horizontally)
  // x/pageX/y/pageY are in screen space, must be offset by canvas position then scaled down
  // to be converted in canvas space
  return [
    clamp(
      Math.round(((e.x || e.pageX) - canvasX) / scaleToFit),
      0, VIEWPORT.width
    ),
    clamp(
      Math.round((e.y || e.pageY) / scaleToFit),
      0, VIEWPORT.height
    )
  ];
};
