import type { CanvasProps, CanvasElement, Direction, Orientation, Point, TextProps } from './types.js'

export type { CanvasProps, CanvasElement, ContainerProps, TextProps, ImageProps, Direction, Orientation, Point } from './types.js'

const DEFAULT_FONTSIZE = 50

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates an HTMLCanvasElement and draws all elements onto it.
 *
 * Returns a Promise because images must be preloaded before drawing so that
 * (a) they actually appear, and (b) missing width/height can be inferred from
 * the image's natural aspect ratio.
 *
 * **Browser only** — relies on `document` and `Image`. For Node.js use a
 * compatible canvas implementation such as `node-canvas` and provide the
 * context directly.
 */
export async function createCanvas({
  elements,
  width = 1024,
  height = 1024,
  backgroundColor = 'transparent',
  grid = false,
}: CanvasProps): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context not supported')

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, width, height)
  context.fillStyle = 'black'

  // Preload every image referenced anywhere in the element tree so we have
  // natural dimensions available synchronously during layout & drawing.
  const imageCache = await preloadImages(elements)

  if (!grid) {
    drawElements(context, elements, imageCache)
    return canvas
  }

  // Draw the first tile to measure its bounding box, then tile across the canvas.
  const tileEnd = drawElements(context, elements, imageCache, { x: 0, y: 0 })

  const firstElement = elements[0]
  const contentOrigin: Point = {
    x: firstElement?.kind === 'container' ? (firstElement.origin?.x ?? 0) : 0,
    y: firstElement?.kind === 'container' ? (firstElement.origin?.y ?? 0) : 0,
  }

  const tileWidth = tileEnd.x - contentOrigin.x
  const tileHeight = tileEnd.y - contentOrigin.y

  if (tileWidth === 0 || tileHeight === 0) return canvas

  for (let row = 0; row * tileHeight < height; row++) {
    for (let col = 0; col * tileWidth < width; col++) {
      if (row === 0 && col === 0) continue
      drawElements(context, elements, imageCache, { x: col * tileWidth, y: row * tileHeight })
    }
  }

  return canvas
}

// ---------------------------------------------------------------------------
// Image preloading
// ---------------------------------------------------------------------------

type ImageCache = Map<string, HTMLImageElement>

function collectImageSrcs(elements: CanvasElement[], srcs: Set<string>): void {
  for (const el of elements) {
    if (el.kind === 'image') {
      srcs.add(el.src)
    } else if (el.kind === 'container') {
      collectImageSrcs(el.children, srcs)
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

async function preloadImages(elements: CanvasElement[]): Promise<ImageCache> {
  const srcs = new Set<string>()
  collectImageSrcs(elements, srcs)

  const entries = await Promise.all(
    [...srcs].map(async (src) => {
      const img = await loadImage(src)
      return [src, img] as const
    }),
  )

  return new Map(entries)
}

function resolveImageDimensions(
  element: { width?: number; height?: number },
  img: HTMLImageElement,
): { width: number; height: number } {
  const aspectRatio = img.naturalWidth / img.naturalHeight

  if (element.width !== undefined && element.height !== undefined) {
    return { width: element.width, height: element.height }
  }
  if (element.width !== undefined) {
    return { width: element.width, height: Math.round(element.width / aspectRatio) }
  }
  if (element.height !== undefined) {
    return { width: Math.round(element.height * aspectRatio), height: element.height }
  }
  return { width: img.naturalWidth, height: img.naturalHeight }
}

// ---------------------------------------------------------------------------
// Layout & drawing
// ---------------------------------------------------------------------------

function drawElements(
  context: CanvasRenderingContext2D,
  elements: CanvasElement[],
  imageCache: ImageCache,
  origin: Point = { x: 0, y: 0 },
  orientation: Orientation = 'topLeft',
  direction: Direction = 'column',
  gap: number = 0,
): Point {
  const accOffset: Point = { x: origin.x, y: origin.y }

  // Main-axis step: determines whether the accumulator advances positively or
  // negatively. Bottom orientations reverse the Y axis, right orientations
  // reverse the X axis.
  const ySign = (orientation === 'bottomLeft' || orientation === 'bottomRight') ? -1 : 1
  const xSign = (orientation === 'topRight' || orientation === 'bottomRight') ? -1 : 1
  const mainSign = direction === 'column' ? ySign : xSign

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]!
    const isLast = i === elements.length - 1

    switch (element.kind) {
      case 'container': {
        if (element.children.length > 0) {
          const padding = element.padding ?? 0
          const childOrientation = element.orientation ?? orientation
          const cYSign = (childOrientation === 'bottomLeft' || childOrientation === 'bottomRight') ? -1 : 1
          const cXSign = (childOrientation === 'topRight' || childOrientation === 'bottomRight') ? -1 : 1

          const baseOrigin: Point = element.origin
            ? { x: origin.x + element.origin.x, y: origin.y + element.origin.y }
            : direction === 'column'
              ? { x: origin.x, y: accOffset.y }
              : { x: accOffset.x, y: origin.y }

          const paddedOrigin: Point = {
            x: baseOrigin.x + cXSign * padding,
            y: baseOrigin.y + cYSign * padding,
          }

          const childEnd = drawElements(
            context,
            element.children,
            imageCache,
            paddedOrigin,
            childOrientation,
            element.direction ?? 'column',
            element.gap ?? 0,
          )

          const containerEnd: Point = {
            x: childEnd.x + cXSign * padding,
            y: childEnd.y + cYSign * padding,
          }

          if (direction === 'column') {
            accOffset.x = Math.max(accOffset.x, containerEnd.x)
            accOffset.y = containerEnd.y
          } else {
            accOffset.x = containerEnd.x
            accOffset.y = Math.max(accOffset.y, containerEnd.y)
          }
        }
        break
      }

      case 'image': {
        const img = imageCache.get(element.src)
        if (!img) break

        const { width: imgW, height: imgH } = resolveImageDimensions(element, img)
        const drawOrigin = resolveDrawOrigin(origin, imgW, imgH, accOffset, orientation, direction)

        context.drawImage(img, drawOrigin.x, drawOrigin.y, imgW, imgH)

        if (direction === 'column') {
          accOffset.x = Math.max(accOffset.x, origin.x + imgW)
          accOffset.y += mainSign * imgH
        } else {
          accOffset.x += mainSign * imgW
          accOffset.y = Math.max(accOffset.y, origin.y + imgH)
        }
        break
      }

      case 'text': {
        const fontSize = element.fontSize ?? DEFAULT_FONTSIZE
        const resolved: TextProps = { ...element, fontSize }

        const { x: textWidth, y: textHeight } = getTextMetrics(context, resolved)
        const drawOrigin = resolveDrawOrigin(origin, textWidth, textHeight, accOffset, orientation, direction)

        drawText(context, drawOrigin, resolved.text, fontSize, resolved.fontFamily, resolved.fontWeight, resolved.color)

        if (direction === 'column') {
          accOffset.x = Math.max(accOffset.x, origin.x + textWidth)
          accOffset.y += mainSign * textHeight
        } else {
          accOffset.x += mainSign * textWidth
          accOffset.y = Math.max(accOffset.y, origin.y + textHeight)
        }
        break
      }
    }

    if (!isLast && gap > 0) {
      if (direction === 'column') {
        accOffset.y += mainSign * gap
      } else {
        accOffset.x += mainSign * gap
      }
    }
  }

  return accOffset
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Translates logical layout position (origin + accumulated offset + orientation)
 * into the actual pixel coordinate to pass to the canvas draw call.
 */
function resolveDrawOrigin(
  origin: Point,
  width: number,
  height: number,
  accOffset: Point,
  orientation: Orientation,
  direction: Direction,
): Point {
  const map: Record<Direction, Record<Orientation, Point>> = {
    column: {
      topLeft:     { x: origin.x,          y: accOffset.y          },
      topRight:    { x: origin.x - width,  y: accOffset.y          },
      bottomLeft:  { x: origin.x,          y: accOffset.y - height },
      bottomRight: { x: origin.x - width,  y: accOffset.y - height },
    },
    row: {
      topLeft:     { x: accOffset.x,         y: origin.y          },
      topRight:    { x: accOffset.x - width, y: origin.y          },
      bottomLeft:  { x: accOffset.x,         y: origin.y - height },
      bottomRight: { x: accOffset.x - width, y: origin.y - height },
    },
  }

  return map[direction][orientation]
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function getTextMetrics(context: CanvasRenderingContext2D, element: TextProps): Point {
  context.font = `${element.fontWeight ?? ''} ${element.fontSize}px ${element.fontFamily ?? 'Arial'}`.trim()
  const metrics = context.measureText(element.text)
  return {
    x: metrics.width,
    y: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
  }
}

function drawText(
  context: CanvasRenderingContext2D,
  origin: Point,
  text: string,
  fontSize: number,
  fontFamily: string = 'Arial',
  fontWeight: string = '',
  color?: string,
): void {
  context.save()
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`.trim()
  if (color) context.fillStyle = color
  const metrics = context.measureText(text)
  const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
  context.fillText(text, origin.x, origin.y + textHeight)
  context.restore()
}
