# declanvas

Declarative layout engine for HTML Canvas. Compose text, images, and containers using a simple element tree — no imperative draw calls needed.

Useful for generating textures for 3D objects, dynamic thumbnails, OG images, or anywhere you need programmatic canvas rendering with layout control.

[Demo on CodePen](https://codepen.io/collection/PojRrj)

## Install

```bash
npm install declanvas
```

## Usage

```typescript
import { createCanvas } from 'declanvas'

const canvas = await createCanvas({
  width: 1024,
  height: 1024,
  backgroundColor: 'white',
  elements: [
    {
      kind: 'container',
      padding: 40,
      gap: 16,
      children: [
        { kind: 'text', text: 'Hello', fontSize: 72, fontWeight: 'bold' },
        { kind: 'text', text: 'World', fontSize: 48, color: '#666' },
        { kind: 'image', src: '/logo.png', width: 200 },
      ],
    },
  ],
})

document.body.appendChild(canvas)
```

## Elements

### Container

Groups child elements with layout control.

```typescript
{
  kind: 'container',
  children: CanvasElement[],
  direction?: 'row' | 'column',  // default: 'column'
  orientation?: Orientation,      // default: 'topLeft'
  origin?: { x: number, y: number },
  gap?: number,
  padding?: number,
}
```

### Text

Renders a string with configurable font properties.

```typescript
{
  kind: 'text',
  text: string,
  fontSize?: number,       // default: 50
  fontWeight?: 'bold' | 'normal',
  fontFamily?: string,     // default: 'Arial'
  color?: string,
}
```

### Image

Draws an image. At least one dimension is required — the other is inferred from the aspect ratio.

```typescript
{
  kind: 'image',
  src: string,
  width?: number,
  height?: number,
}
```

## Layout

Elements are laid out using two properties on containers:

- **`direction`** — `'column'` (vertical, default) or `'row'` (horizontal)
- **`orientation`** — controls which corner elements anchor to:
  - `'topLeft'` — elements grow right/down (default)
  - `'topRight'` — anchored to right edge, grow left/down
  - `'bottomLeft'` — anchored to bottom, grow right/up
  - `'bottomRight'` — anchored to bottom-right, grow left/up

<img width="1568" height="755" alt="image" src="https://github.com/user-attachments/assets/e481c700-e2ef-4575-ba57-65f7f0dcda19" />


## Grid mode

Set `grid: true` to tile the element tree across the entire canvas:

```typescript
const canvas = await createCanvas({
  width: 2048,
  height: 2048,
  grid: true,
  elements: [
    {
      kind: 'container',
      padding: 20,
      children: [
        { kind: 'image', src: '/tile.png', width: 100 },
      ],
    },
  ],
})
```

## Three.js example

```typescript
import { createCanvas } from 'declanvas'
import * as THREE from 'three'

const canvas = await createCanvas({
  width: 2048,
  height: 2048,
  backgroundColor: 'white',
  elements: [
    {
      kind: 'container',
      padding: 50,
      gap: 20,
      children: [
        { kind: 'text', text: 'Product Label', fontSize: 80, fontWeight: 'bold' },
        { kind: 'image', src: '/brand-logo.png', width: 400 },
      ],
    },
  ],
})

const texture = new THREE.CanvasTexture(canvas)
const material = new THREE.MeshStandardMaterial({ map: texture })
```

## API

### `createCanvas(props: CanvasProps): Promise<HTMLCanvasElement>`

The single entry point. Returns a promise that resolves once all images are loaded and the canvas is fully drawn.

| Property | Type | Default | Description |
|---|---|---|---|
| `elements` | `ContainerProps[]` | required | Root containers to render |
| `width` | `number` | `1024` | Canvas width in pixels |
| `height` | `number` | `1024` | Canvas height in pixels |
| `backgroundColor` | `string` | `'transparent'` | Fill color for the canvas background |
| `grid` | `boolean` | `false` | Tile the content to fill the canvas |

## Browser only

declanvas uses `document.createElement('canvas')` and `new Image()` under the hood. It runs in any modern browser but does not work in Node.js without a canvas polyfill like `node-canvas`.

## License

MIT
