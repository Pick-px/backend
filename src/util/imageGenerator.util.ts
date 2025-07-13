import { createCanvas } from 'canvas';
import * as sharp from 'sharp';

type Pixel = {
  x: number;
  y: number;
  color: string;
};

export async function generatorPixelToImg(
  pixels: Pixel[],
  height: number,
  width: number
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  pixels.map(({ x, y, color }) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  });
  const originalBuffer = canvas.toBuffer('image/png', { compressionLevel: 0 });
  const resizedBuffer = await sharp(originalBuffer)
    .resize(512, 512, {
      fit: 'contain', // 'contain', 'cover' 등도 가능
      kernel: sharp.kernel.nearest, // 👈 픽셀 기반 확대
    })
    .png()
    .toBuffer();
  return resizedBuffer;
  // return originalBuffer;
}
