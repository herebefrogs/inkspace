import { isMobile } from './mobile';
import { checkMonetization, isMonetizationEnabled } from './monetization';
import { loadSongs, playSound, playSong } from './sound';
import { initSpeech } from './speech';
import { save, load } from './storage';
import { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT, CHARSET_SIZE, initCharset, renderText } from './text';
import { clamp, getRandSeed, setRandSeed, lerp, loadImg, randInt } from './utils';
import TILESET from '../img/tileset.webp';


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
let bluePercentage = 0;
let hue = 0;

const ATLAS = {
  hero: {
    move: [
      { x: 0, y: 0, w: 16, h: 18 },
      { x: 16, y: 0, w: 16, h: 18 },
      { x: 32, y: 0, w: 16, h: 18 },
      { x: 48, y: 0, w: 16, h: 18 },
      { x: 64, y: 0, w: 16, h: 18 },
    ],
    speed: 100,
  },
  foe: {
    'move': [
      { x: 0, y: 0, w: 16, h: 18 },
    ],
    speed: 0,
  },
};
const FRAME_DURATION = 0.1; // duration of 1 animation frame, in seconds
let tileset;   // characters sprite, embedded as a base64 encoded dataurl by build script

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

function startGame() {
  // setRandSeed(getRandSeed());
  // if (isMonetizationEnabled()) { unlockExtraContent() }
  konamiIndex = 0;
  countdown = 60;
  viewportOffsetX = viewportOffsetY = 0;
  hero = createEntity('hero', VIEWPORT.width / 2, VIEWPORT.height / 2);
  entities = [
    hero,
    // createEntity('foe', 10, 10),
    // createEntity('foe', 630 - 16, 10),
    // createEntity('foe', 630 - 16, 470 - 18),
    // createEntity('foe', 300, 200),
    // createEntity('foe', 400, 300),
    // createEntity('foe', 500, 400),
    // createEntity('foe', 10, 470 - 18),
    // createEntity('foe', 100, 100),
    // createEntity('foe', 100, 118),
    // createEntity('foe', 116, 118),
    // createEntity('foe', 116, 100),
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

  test.collide = entity1.x < test.entity2MaxX
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

function createEntity(type, x = 0, y = 0) {
  const action = 'move';
  const sprite = ATLAS[type][action][0];
  return {
    action,
    frame: 0,
    frameTime: 0,
    h: sprite.h,
    moveDown: 0,
    moveLeft: 0,
    moveRight: 0,
    moveUp: 0,
    // coordinates in VIEWPORT space (MAP - VIEWPORT offset)
    view: {},
    velX: 0,
    velY: 0,
    speed: ATLAS[type].speed,
    type,
    w: sprite.w,
    // coordinates in MAP space
    x,
    y,
  };
};

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
  // update position
  const ratio = entity.velX && entity.velY ? DIAGONAL_VELOCITY_DRAG : 1;
  const distance = entity.speed * elapsedTime * ratio;
  entity.x += distance * entity.velX;
  entity.y += distance * entity.velY;

  // TODO: this should be in its own function as it's sometime affected by the entity state (dead, dying, moving...)
  // update animation frame
  entity.frameTime += elapsedTime;
  if (entity.frameTime > FRAME_DURATION) {
    entity.frameTime -= FRAME_DURATION;
    entity.frame += 1;
    entity.frame %= ATLAS[entity.type][entity.action].length;
  }
};

function painting() {
  return hero.paintTime || crosshair.paintTime;
}

function paintSplash() {
  hue = (hue + 1) % 360;
  PAINT_CTX.fillStyle = `hsl(${hue} 90% 50%)`;
  const offsetX = randInt(-10, 10);
  const offsetY = randInt(-10, 10);
  const width = randInt(5, 20);
  const height = randInt(5, 20);
  PAINT_CTX.fillRect(crosshair.x + offsetX, crosshair.y + offsetY, width, height);
}

function update() {
  switch (screen) {
    case GAME_SCREEN:
      // countdown -= elapsedTime;
      if (countdown < 0) {
        screen = END_SCREEN;
      }
      updateHeroVelocity();
      entities.forEach(updateEntityPosition);
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
      if (painting()) {
        paintSplash();
      }
      bluePercentage = countColors();
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
      renderText('game screen', CHARSET_SIZE, CHARSET_SIZE);
      //renderCountdown();
      renderText(`captured: ${bluePercentage || 0}%`, VIEWPORT.width - CHARSET_SIZE, CHARSET_SIZE, ALIGN_RIGHT);
      entities.forEach(entity => renderEntity(entity));
      renderCrosshair();
      break;
    case END_SCREEN:
      renderText('end screen', CHARSET_SIZE, CHARSET_SIZE);
      // renderText(monetizationEarned(), TEXT.width - CHARSET_SIZE, TEXT.height - 2*CHARSET_SIZE, ALIGN_RIGHT);
      break;
  }

  blit();
};

function renderCrosshair() {
  VIEWPORT_CTX.strokeStyle = painting() ? '#000' : '#fff';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 1, crosshair.view.y - 1, 2, 2);
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 6, crosshair.view.y - 6, 12, 12);

}

function renderCountdown() {
  const minutes = Math.floor(Math.ceil(countdown) / 60);
  const seconds = Math.ceil(countdown) - minutes * 60;
  renderText(`${minutes}:${seconds <= 9 ? '0' : ''}${seconds}`, VIEWPORT.width - CHARSET_SIZE, CHARSET_SIZE, ALIGN_RIGHT);

};

function renderEntity(entity, ctx = VIEWPORT_CTX) {
  const sprite = ATLAS[entity.type][entity.action][entity.frame];
  // TODO skip draw if image outside of visible canvas
  ctx.drawImage(
    tileset,
    sprite.x, sprite.y, sprite.w, sprite.h,
    entity.view.x, entity.view.y, sprite.w, sprite.h
  );
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
  // make a scaled down version of PAINT
  // to reduce the number of pixels we have to count colors on
  MINI_PAINT_CTX.drawImage(
    PAINT,
    0, 0, PAINT.width, PAINT.height,
    0, 0, MINI_PAINT.width, MINI_PAINT.height,
  );

  const imageData = MINI_PAINT_CTX.getImageData(0, 0, MINI_PAINT.width, MINI_PAINT.height);
  const totalPixels = imageData.width * imageData.height;
  let coloredPixels = 0;
  const data = imageData.data;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p+3] >= 250) {
      coloredPixels += 1;
    }
  }
  // pixel counts to percentage of total pixels (e.g. blue = 4.2%)
  return (coloredPixels*100/totalPixels).toFixed(2);
}

function resetPaint() {
  PAINT_CTX.clearRect(0, 0, PAINT.width, PAINT.height);
  bluePercentage = 0;
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
  document.title = 'Game Jam Boilerplate';

  onresize();
  //checkMonetization();

  await initCharset(VIEWPORT_CTX);
  tileset = await loadImg(TILESET);
  // speak = await initSpeech();

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
            hero.paintTime = currentTime;
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
          hero.paintTime = 0;
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
      crosshair.paintTime = currentTime;
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
      crosshair.paintTime = 0;
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
