# declanvas

A small, dependency-free TypeScript library for rendering declarative, Flexbox-inspired layouts to an `HTMLCanvasElement`.

## Install

```sh
npm install declanvas
```

## Version 0.2 rewrite

Version 0.2 is a complete rewrite with a new typed scene model and an ESM-only package. It replaces the 0.1 `createCanvas` API with `renderCanvas`; nodes now use `type`, `style`, and `children` instead of the earlier `kind` and `elements` shape.

## Example

```ts
import { renderCanvas, type CanvasScene } from "declanvas";

const scene = {
  width: 1200,
  height: 630,
  backgroundColor: "#f7f7f8",
  style: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 32,
    padding: 48,
  },
  children: [
    {
      type: "container",
      style: { flexGrow: 1, gap: 16 },
      children: [
        {
          type: "text",
          text: "Build canvases declaratively.",
          style: {
            width: "100%",
            color: "#161618",
            fontFamily: "Inter, sans-serif",
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 64,
            maxLines: 2,
            textOverflow: "ellipsis",
          },
        },
        {
          type: "text",
          text: "Typed objects in, HTMLCanvasElement out.",
          style: { color: "#65656b", fontSize: 24 },
        },
      ],
    },
    {
      type: "image",
      src: "/product.png",
      crossOrigin: "anonymous",
      style: {
        width: 360,
        height: 360,
        maxWidth: "40%",
        objectFit: "contain",
        objectPosition: "center",
      },
    },
  ],
} satisfies CanvasScene;

const canvas = await renderCanvas(scene);
document.body.append(canvas);
```

## API

### `renderCanvas(scene, options?)`

Returns a `Promise<HTMLCanvasElement>`. Rendering waits for image URLs and fonts registered in `document.fonts`. The promise rejects with `CanvasRenderError` if validation or asset loading fails.

`options.pixelRatio` overrides `devicePixelRatio`. `options.document` is useful for rendering against another browser document.

### Nodes

- `container` lays out its children in a `row` or `column`.
- `text` measures, wraps, truncates, and paints styled text.
- `image` accepts a URL or an existing `HTMLImageElement` and supports CSS-like object fitting.

Every node is a box. Sizes accept non-negative pixel numbers, percentage strings such as `"50%"`, and `"auto"` where applicable. The box model supports padding, margins, min/max sizes, backgrounds, uniform borders, rounded corners, opacity, and clipping.

## Layout behavior

The layout engine intentionally implements a useful subset of Flexbox:

- `flexDirection`: `row` or `column`
- `justifyContent`: `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, or `space-evenly`
- `alignItems` and `alignSelf`: `flex-start`, `center`, `flex-end`, or `stretch`
- `gap`, `flexGrow`, `flexShrink`, and `flexBasis`
- Auto margins on the main axis

It does not implement wrapping, reverse directions, `order`, positioned layout, margin collapsing, CSS inheritance, or the complete CSS sizing algorithm. Percentages resolve against the corresponding parent content dimension; a percentage whose parent dimension is not yet definite behaves as `auto`.

Numeric dimensions use logical CSS pixels. The returned canvas has logical CSS dimensions and a high-resolution backing store.

## Development

```sh
npm run typecheck
npm test
npm run build
```
