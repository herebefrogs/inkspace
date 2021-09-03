import { loadImg } from './utils';

// available alphabet (must match characters in the alphabet sprite exactly)
// U = up arrow
// D = down arrow
// L = left arrow
// R = right arrow
// T = teapot icon
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789.:!-%,/';

export const ALIGN_LEFT = 'start';
export const ALIGN_CENTER = 'center';
export const ALIGN_RIGHT = 'end';

// alphabet sprite, embedded as a base64 encoded dataurl by build script
import CHARSET from '../img/charset.webp';
export const CHARSET_SIZE = 8; // in px
let charset;
let ctx;

export const initCharset = async (canvasContext) => {
  ctx = canvasContext;
  charset = await loadImg(CHARSET);
}

/**
 * Render a message on the canvas context using a pixelart alphabet sprite
 * @param {*} msg 
 * @param {*} ctx 
 * @param {*} x 
 * @param {*} y 
 * @param {*} align 
 * @param {*} scale 
 */
export function renderBitmapText(msg, x, y, align = ALIGN_LEFT, scale = 1) {
  const SCALED_SIZE = scale * CHARSET_SIZE;
  const MSG_WIDTH = msg.length * SCALED_SIZE + (msg.length - 1) * scale;
  const ALIGN_OFFSET = align === ALIGN_RIGHT ? MSG_WIDTH :
                       align === ALIGN_CENTER ? MSG_WIDTH / 2 :
                       0;
  [...msg].forEach((c, i) => {
    ctx.drawImage(
      charset,
      // TODO could memoize the characters index or hardcode a lookup table
      ALPHABET.indexOf(c) * CHARSET_SIZE, 0, CHARSET_SIZE, CHARSET_SIZE,
      Math.floor(x + i * scale * (CHARSET_SIZE + 1) - ALIGN_OFFSET), y, Math.floor(SCALED_SIZE), Math.floor(SCALED_SIZE)
    );
  });
};

export function renderText(msg, x, y, align = ALIGN_LEFT, scale = 1, color) {
  const fontSize = Math.round(16 * scale)
  ctx.font = `bold italic ${fontSize}px Impact`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle'
  if (!color) {
    const textSize = ctx.measureText(msg);
    const gradient = ctx.createLinearGradient(x - textSize.width/2,y + textSize.fontBoundingBoxAscent, x+textSize.width/2, y+textSize.fontBoundingBoxDescent);
    gradient.addColorStop(0, '#0b6');
    gradient.addColorStop(0.33, '#ab0');
    gradient.addColorStop(0.66, '#b08');
    gradient.addColorStop(1, '#81a');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fillText(msg, x, y);
  ctx.lineWidth = 2
  ctx.strokeStyle = '#000';
  ctx.strokeText(msg, x, y)
}
