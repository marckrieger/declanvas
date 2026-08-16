import { CanvasRenderError } from "./errors.js";
import type {
  AlignItems,
  BoxStyle,
  CanvasNode,
  CanvasScene,
  ContainerNode,
  DefiniteLength,
  ImageNode,
  Length,
  ObjectPosition,
  RenderOptions,
  TextNode,
  TextStyle,
} from "./types.js";

interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface AutoEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

interface LayoutBox {
  node: CanvasNode;
  x: number;
  y: number;
  width: number;
  height: number;
  padding: Edges;
  border: number;
  lines?: readonly string[];
  children: LayoutBox[];
}

interface Measurement {
  width: number;
  height: number;
  padding: Edges;
  border: number;
  lines?: readonly string[];
}

interface Assets {
  images: Map<ImageNode, HTMLImageElement>;
}

interface ItemMeasurement {
  node: CanvasNode;
  measured: Measurement;
  margin: Edges;
  autoMargin: AutoEdges;
  main: number;
  cross: number;
  mainStartMargin: number;
  mainEndMargin: number;
  crossStartMargin: number;
  crossEndMargin: number;
}

const ZERO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };
const EPSILON = 0.000_001;

export async function renderCanvas(
  scene: CanvasScene,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  validateScene(scene, options);
  const doc = options.document ?? globalThis.document;
  if (!doc) {
    throw new CanvasRenderError(
      "INVALID_SCENE",
      "renderCanvas requires a browser Document or options.document.",
    );
  }

  const canvas = doc.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new CanvasRenderError("CONTEXT_UNAVAILABLE", "Canvas 2D context is unavailable.");
  }

  const pixelRatio = options.pixelRatio ?? doc.defaultView?.devicePixelRatio ?? 1;
  const assets = await loadAssets(scene.children, doc);
  await loadFonts(scene.children, doc);

  canvas.width = Math.round(scene.width * pixelRatio);
  canvas.height = Math.round(scene.height * pixelRatio);
  canvas.style.width = `${scene.width}px`;
  canvas.style.height = `${scene.height}px`;
  context.scale(pixelRatio, pixelRatio);

  if (scene.backgroundColor) {
    context.fillStyle = scene.backgroundColor;
    context.fillRect(0, 0, scene.width, scene.height);
  }

  const root: ContainerNode = {
    type: "container",
    ...(scene.style ? { style: scene.style } : {}),
    children: scene.children,
  };
  const layout = layoutNode(root, context, assets, scene.width, scene.height, scene.width, scene.height);
  paintBox(context, layout, assets);
  return canvas;
}

function validateScene(scene: CanvasScene, options: RenderOptions): void {
  if (!scene || typeof scene !== "object") invalid("The scene must be an object.");
  positive(scene.width, "scene.width");
  positive(scene.height, "scene.height");
  if (options.pixelRatio !== undefined) positive(options.pixelRatio, "options.pixelRatio");
  if (!Array.isArray(scene.children)) invalid("scene.children must be an array.");
  validateStyle(scene.style, "scene.style");
  scene.children.forEach((node, index) => validateNode(node, `scene.children[${index}]`));
}

function validateNode(node: CanvasNode, path: string): void {
  if (!node || typeof node !== "object") invalid(`${path} must be an object.`);
  validateStyle(node.style, `${path}.style`);
  if (node.type === "container") {
    if (!Array.isArray(node.children)) invalid(`${path}.children must be an array.`);
    node.children.forEach((child, index) => validateNode(child, `${path}.children[${index}]`));
  } else if (node.type === "text") {
    if (typeof node.text !== "string") invalid(`${path}.text must be a string.`);
    if (node.style?.fontSize !== undefined) positive(node.style.fontSize, `${path}.style.fontSize`);
    if (node.style?.lineHeight !== undefined) positive(node.style.lineHeight, `${path}.style.lineHeight`);
    if (node.style?.maxLines !== undefined) positiveInteger(node.style.maxLines, `${path}.style.maxLines`);
  } else if (node.type === "image") {
    if (typeof node.src !== "string" && !isImageElement(node.src)) {
      invalid(`${path}.src must be a URL string or HTMLImageElement.`);
    }
    if (typeof node.src === "string" && node.src.length === 0) invalid(`${path}.src cannot be empty.`);
  } else {
    invalid(`${path}.type is not a supported node type.`);
  }
}

function validateStyle(style: BoxStyle | undefined, path: string): void {
  if (!style) return;
  const values = style as BoxStyle & Record<string, unknown>;
  const lengths: readonly (keyof BoxStyle)[] = [
    "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
    "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "flexBasis",
  ];
  for (const key of lengths) {
    const value = style[key];
    if (value !== undefined && !validLength(value)) invalid(`${path}.${key} is not a valid length.`);
  }
  for (const key of ["borderWidth", "borderRadius", "flexGrow", "flexShrink"] as const) {
    const value = style[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      invalid(`${path}.${key} must be a finite non-negative number.`);
    }
  }
  if (style.opacity !== undefined && (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1)) {
    invalid(`${path}.opacity must be between 0 and 1.`);
  }
  if (values.gap !== undefined && !validDefiniteLength(values.gap)) invalid(`${path}.gap is not a valid length.`);
  enumValue(values.boxSizing, ["content-box", "border-box"], `${path}.boxSizing`);
  enumValue(values.overflow, ["visible", "hidden"], `${path}.overflow`);
  enumValue(values.alignSelf, ["flex-start", "center", "flex-end", "stretch"], `${path}.alignSelf`);
  enumValue(values.flexDirection, ["row", "column"], `${path}.flexDirection`);
  enumValue(values.justifyContent, [
    "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly",
  ], `${path}.justifyContent`);
  enumValue(values.alignItems, ["flex-start", "center", "flex-end", "stretch"], `${path}.alignItems`);
  enumValue(values.fontStyle, ["normal", "italic", "oblique"], `${path}.fontStyle`);
  enumValue(values.textAlign, ["left", "center", "right", "start", "end"], `${path}.textAlign`);
  enumValue(values.whiteSpace, ["normal", "nowrap"], `${path}.whiteSpace`);
  enumValue(values.wordBreak, ["normal", "break-word"], `${path}.wordBreak`);
  enumValue(values.textOverflow, ["clip", "ellipsis"], `${path}.textOverflow`);
  enumValue(values.objectFit, ["fill", "contain", "cover", "none", "scale-down"], `${path}.objectFit`);
  if (values.objectPosition !== undefined && !validObjectPosition(values.objectPosition)) {
    invalid(`${path}.objectPosition is not valid.`);
  }
}

function validLength(value: unknown): value is Length {
  return (typeof value === "number" && Number.isFinite(value) && value >= 0)
    || value === "auto"
    || (typeof value === "string" && /^\d+(?:\.\d+)?%$/.test(value));
}

function validDefiniteLength(value: unknown): value is DefiniteLength {
  return validLength(value) && value !== "auto";
}

function enumValue(value: unknown, choices: readonly string[], path: string): void {
  if (value !== undefined && (typeof value !== "string" || !choices.includes(value))) {
    invalid(`${path} must be one of: ${choices.join(", ")}.`);
  }
}

function validObjectPosition(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return [
    "top left", "top", "top right", "left", "center", "right",
    "bottom left", "bottom", "bottom right",
  ].includes(value) || /^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(value);
}

function positive(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) invalid(`${path} must be a finite positive number.`);
}

function positiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) invalid(`${path} must be a positive integer.`);
}

function invalid(message: string): never {
  throw new CanvasRenderError("INVALID_SCENE", message);
}

function isImageElement(value: unknown): value is HTMLImageElement {
  return typeof value === "object" && value !== null && "naturalWidth" in value && "naturalHeight" in value;
}

async function loadAssets(nodes: readonly CanvasNode[], doc: Document): Promise<Assets> {
  const images = new Map<ImageNode, HTMLImageElement>();
  const jobs: Promise<void>[] = [];
  visitNodes(nodes, (node) => {
    if (node.type !== "image") return;
    jobs.push(loadImage(node, doc).then((image) => { images.set(node, image); }));
  });
  await Promise.all(jobs);
  return { images };
}

async function loadImage(node: ImageNode, doc: Document): Promise<HTMLImageElement> {
  const image = typeof node.src === "string" ? doc.createElement("img") : node.src;
  if (typeof node.src === "string") {
    if (node.crossOrigin) image.crossOrigin = node.crossOrigin;
    image.src = node.src;
  }
  if (image.complete) {
    if (image.naturalWidth > 0) return image;
    throw new CanvasRenderError("IMAGE_LOAD_FAILED", `Failed to load image: ${displaySource(node.src)}`);
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const onLoad = (): void => {
      cleanup();
      if (image.naturalWidth > 0) resolve(image);
      else rejectImage();
    };
    const rejectImage = (): void => {
      cleanup();
      reject(new CanvasRenderError("IMAGE_LOAD_FAILED", `Failed to load image: ${displaySource(node.src)}`));
    };
    const onError = (): void => rejectImage();
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });
}

async function loadFonts(nodes: readonly CanvasNode[], doc: Document): Promise<void> {
  if (!doc.fonts) return;
  const requests = new Map<string, string>();
  visitNodes(nodes, (node) => {
    if (node.type === "text") requests.set(fontString(node.style), node.text);
  });
  try {
    await Promise.all([...requests].map(([font, text]) => doc.fonts.load(font, text)));
  } catch (cause) {
    throw new CanvasRenderError("FONT_LOAD_FAILED", "Failed to load a requested font.", { cause });
  }
}

function visitNodes(nodes: readonly CanvasNode[], visitor: (node: CanvasNode) => void): void {
  for (const node of nodes) {
    visitor(node);
    if (node.type === "container") visitNodes(node.children, visitor);
  }
}

function displaySource(source: string | HTMLImageElement): string {
  return typeof source === "string" ? source : source.currentSrc || source.src || "HTMLImageElement";
}

function layoutNode(
  node: CanvasNode,
  context: CanvasRenderingContext2D,
  assets: Assets,
  parentWidth: number | undefined,
  parentHeight: number | undefined,
  forcedWidth?: number,
  forcedHeight?: number,
): LayoutBox {
  const measured = measureNode(node, context, assets, parentWidth, parentHeight, forcedWidth, forcedHeight);
  const box: LayoutBox = {
    node,
    x: 0,
    y: 0,
    width: measured.width,
    height: measured.height,
    padding: measured.padding,
    border: measured.border,
    ...(measured.lines ? { lines: measured.lines } : {}),
    children: [],
  };
  if (node.type === "container") layoutChildren(box, node, context, assets);
  return box;
}

function measureNode(
  node: CanvasNode,
  context: CanvasRenderingContext2D,
  assets: Assets,
  parentWidth: number | undefined,
  parentHeight: number | undefined,
  forcedWidth?: number,
  forcedHeight?: number,
): Measurement {
  const style = node.style ?? {};
  const border = style.borderWidth ?? 0;
  const padding = resolvePadding(style, parentWidth, parentHeight);
  const horizontalChrome = padding.left + padding.right + border * 2;
  const verticalChrome = padding.top + padding.bottom + border * 2;
  const declaredWidth = forcedWidth ?? toBorderSize(style.width, style, parentWidth, horizontalChrome);
  const declaredHeight = forcedHeight ?? toBorderSize(style.height, style, parentHeight, verticalChrome);
  const contentWidth = declaredWidth === undefined ? undefined : Math.max(0, declaredWidth - horizontalChrome);
  const contentHeight = declaredHeight === undefined ? undefined : Math.max(0, declaredHeight - verticalChrome);

  let naturalWidth = 0;
  let naturalHeight = 0;
  let lines: readonly string[] | undefined;

  if (node.type === "text") {
    const text = measureTextNode(context, node, contentWidth);
    naturalWidth = text.width;
    naturalHeight = text.height;
    lines = text.lines;
  } else if (node.type === "image") {
    const image = assets.images.get(node);
    naturalWidth = image?.naturalWidth ?? 0;
    naturalHeight = image?.naturalHeight ?? 0;
    if (contentWidth !== undefined && declaredHeight === undefined && naturalWidth > 0) {
      naturalHeight = contentWidth * naturalHeight / naturalWidth;
    } else if (contentHeight !== undefined && declaredWidth === undefined && naturalHeight > 0) {
      naturalWidth = contentHeight * naturalWidth / naturalHeight;
    }
  } else {
    const intrinsic = measureContainerContent(node, context, assets, contentWidth, contentHeight);
    naturalWidth = intrinsic.width;
    naturalHeight = intrinsic.height;
  }

  let width = declaredWidth ?? naturalWidth + horizontalChrome;
  let height = declaredHeight ?? naturalHeight + verticalChrome;
  width = constrainBorderSize(width, "width", style, parentWidth, horizontalChrome);
  height = constrainBorderSize(height, "height", style, parentHeight, verticalChrome);

  if (node.type === "image" && naturalWidth > 0 && naturalHeight > 0) {
    const widthAuto = style.width === undefined || style.width === "auto";
    const heightAuto = style.height === undefined || style.height === "auto";
    if (heightAuto) {
      height = constrainBorderSize(
        Math.max(0, width - horizontalChrome) * naturalHeight / naturalWidth + verticalChrome,
        "height",
        style,
        parentHeight,
        verticalChrome,
      );
    }
    if (widthAuto && Math.abs(Math.max(0, height - verticalChrome) - naturalHeight) > EPSILON) {
      width = constrainBorderSize(
        Math.max(0, height - verticalChrome) * naturalWidth / naturalHeight + horizontalChrome,
        "width",
        style,
        parentWidth,
        horizontalChrome,
      );
    }
  }

  if (node.type === "text" && declaredWidth === undefined && width !== naturalWidth + horizontalChrome) {
    const remeasured = measureTextNode(context, node, Math.max(0, width - horizontalChrome));
    lines = remeasured.lines;
    if (declaredHeight === undefined) height = remeasured.height + verticalChrome;
  }

  return { width, height, padding, border, ...(lines ? { lines } : {}) };
}

function measureContainerContent(
  node: ContainerNode,
  context: CanvasRenderingContext2D,
  assets: Assets,
  contentWidth: number | undefined,
  contentHeight: number | undefined,
): { width: number; height: number } {
  const row = (node.style?.flexDirection ?? "column") === "row";
  const gap = resolveDefinite(node.style?.gap, row ? contentWidth : contentHeight) ?? 0;
  let main = 0;
  let cross = 0;
  node.children.forEach((child, index) => {
    const measured = measureNode(child, context, assets, contentWidth, contentHeight);
    const { edges } = resolveMargin(child.style, contentWidth, contentHeight);
    const itemMain = row ? measured.width + edges.left + edges.right : measured.height + edges.top + edges.bottom;
    const itemCross = row ? measured.height + edges.top + edges.bottom : measured.width + edges.left + edges.right;
    main += itemMain + (index > 0 ? gap : 0);
    cross = Math.max(cross, itemCross);
  });
  return row ? { width: main, height: cross } : { width: cross, height: main };
}

function layoutChildren(
  box: LayoutBox,
  node: ContainerNode,
  context: CanvasRenderingContext2D,
  assets: Assets,
): void {
  const style = node.style ?? {};
  const row = (style.flexDirection ?? "column") === "row";
  const contentWidth = Math.max(0, box.width - box.padding.left - box.padding.right - box.border * 2);
  const contentHeight = Math.max(0, box.height - box.padding.top - box.padding.bottom - box.border * 2);
  const contentMain = row ? contentWidth : contentHeight;
  const contentCross = row ? contentHeight : contentWidth;
  const gap = resolveDefinite(style.gap, contentMain) ?? 0;

  const items: ItemMeasurement[] = node.children.map((child) => {
    const margin = resolveMargin(child.style, contentWidth, contentHeight);
    const align = child.style?.alignSelf ?? style.alignItems ?? "stretch";
    const crossAuto = row
      ? child.style?.height === undefined || child.style.height === "auto"
      : child.style?.width === undefined || child.style.width === "auto";
    const availableCross = Math.max(0, contentCross - (row
      ? margin.edges.top + margin.edges.bottom
      : margin.edges.left + margin.edges.right));
    const measured = measureNode(
      child,
      context,
      assets,
      contentWidth,
      contentHeight,
      !row && align === "stretch" && crossAuto ? availableCross : undefined,
      row && align === "stretch" && crossAuto ? availableCross : undefined,
    );
    const basis = resolveLength(child.style?.flexBasis, contentMain);
    return {
      node: child,
      measured,
      margin: margin.edges,
      autoMargin: margin.auto,
      main: basis ?? (row ? measured.width : measured.height),
      cross: row ? measured.height : measured.width,
      mainStartMargin: row ? margin.edges.left : margin.edges.top,
      mainEndMargin: row ? margin.edges.right : margin.edges.bottom,
      crossStartMargin: row ? margin.edges.top : margin.edges.left,
      crossEndMargin: row ? margin.edges.bottom : margin.edges.right,
    };
  });

  const totalGap = Math.max(0, items.length - 1) * gap;
  const occupied = items.reduce((sum, item) => sum + item.main + item.mainStartMargin + item.mainEndMargin, totalGap);
  let free = contentMain - occupied;
  const autoMainCount = items.reduce((count, item) => count
    + Number(row ? item.autoMargin.left : item.autoMargin.top)
    + Number(row ? item.autoMargin.right : item.autoMargin.bottom), 0);

  if (free > 0 && autoMainCount > 0) {
    const share = free / autoMainCount;
    for (const item of items) {
      if (row ? item.autoMargin.left : item.autoMargin.top) item.mainStartMargin = share;
      if (row ? item.autoMargin.right : item.autoMargin.bottom) item.mainEndMargin = share;
    }
    free = 0;
  } else if (free > 0) {
    const grow = items.reduce((sum, item) => sum + (item.node.style?.flexGrow ?? 0), 0);
    if (grow > 0) {
      for (const item of items) item.main += free * (item.node.style?.flexGrow ?? 0) / grow;
      free = 0;
    }
  } else if (free < 0) {
    const shrinkWeight = items.reduce(
      (sum, item) => sum + item.main * (item.node.style?.flexShrink ?? 1),
      0,
    );
    if (shrinkWeight > 0) {
      for (const item of items) {
        const weight = item.main * (item.node.style?.flexShrink ?? 1);
        item.main = Math.max(0, item.main + free * weight / shrinkWeight);
      }
      free = 0;
    }
  }

  for (const item of items) {
    const align = item.node.style?.alignSelf ?? style.alignItems ?? "stretch";
    const crossAuto = row
      ? item.node.style?.height === undefined || item.node.style.height === "auto"
      : item.node.style?.width === undefined || item.node.style.width === "auto";
    const availableCross = Math.max(0, contentCross - item.crossStartMargin - item.crossEndMargin);
    const constrained = measureNode(
      item.node,
      context,
      assets,
      contentWidth,
      contentHeight,
      row ? item.main : align === "stretch" && crossAuto ? availableCross : undefined,
      row ? align === "stretch" && crossAuto ? availableCross : undefined : item.main,
    );
    item.main = row ? constrained.width : constrained.height;
    item.cross = row ? constrained.height : constrained.width;
  }

  const used = items.reduce((sum, item) => sum + item.main + item.mainStartMargin + item.mainEndMargin, totalGap);
  const remaining = Math.max(0, contentMain - used);
  const distribution = justify(style.justifyContent ?? "flex-start", remaining, items.length);
  let cursor = distribution.start;

  for (const item of items) {
    cursor += item.mainStartMargin;
    const align = item.node.style?.alignSelf ?? style.alignItems ?? "stretch";
    const crossAuto = row
      ? item.node.style?.height === undefined || item.node.style.height === "auto"
      : item.node.style?.width === undefined || item.node.style.width === "auto";
    const availableCross = Math.max(0, contentCross - item.crossStartMargin - item.crossEndMargin);
    const assignedCross = align === "stretch" && crossAuto ? availableCross : Math.min(item.cross, availableCross);
    const child = layoutNode(
      item.node,
      context,
      assets,
      contentWidth,
      contentHeight,
      row ? item.main : assignedCross,
      row ? assignedCross : item.main,
    );
    const crossOffset = alignOffset(align, contentCross, row ? child.height : child.width, item.crossStartMargin, item.crossEndMargin);
    child.x = box.border + box.padding.left + (row ? cursor : crossOffset);
    child.y = box.border + box.padding.top + (row ? crossOffset : cursor);
    box.children.push(child);
    cursor += item.main + item.mainEndMargin + gap + distribution.between;
  }
}

function justify(value: string, free: number, count: number): { start: number; between: number } {
  if (count === 0) return { start: 0, between: 0 };
  switch (value) {
    case "center": return { start: free / 2, between: 0 };
    case "flex-end": return { start: free, between: 0 };
    case "space-between": return { start: 0, between: count > 1 ? free / (count - 1) : 0 };
    case "space-around": return { start: free / count / 2, between: free / count };
    case "space-evenly": return { start: free / (count + 1), between: free / (count + 1) };
    default: return { start: 0, between: 0 };
  }
}

function alignOffset(
  align: AlignItems,
  available: number,
  size: number,
  startMargin: number,
  endMargin: number,
): number {
  const room = Math.max(0, available - size - startMargin - endMargin);
  if (align === "center") return startMargin + room / 2;
  if (align === "flex-end") return startMargin + room;
  return startMargin;
}

function measureTextNode(
  context: CanvasRenderingContext2D,
  node: TextNode,
  maxWidth: number | undefined,
): { width: number; height: number; lines: readonly string[] } {
  const style = node.style ?? {};
  context.save();
  context.font = fontString(style);
  const canWrap = style.whiteSpace !== "nowrap" && maxWidth !== undefined;
  let lines = canWrap
    ? wrapText(context, node.text, Math.max(0, maxWidth), style.wordBreak ?? "normal")
    : node.text.split("\n");
  const wasTruncated = style.maxLines !== undefined && lines.length > style.maxLines;
  if (style.maxLines !== undefined) lines = lines.slice(0, style.maxLines);
  if (wasTruncated && style.textOverflow === "ellipsis" && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = ellipsize(context, lines[last] ?? "", maxWidth ?? Infinity);
  }
  if (style.textOverflow === "ellipsis" && maxWidth !== undefined) {
    lines = lines.map((line) => context.measureText(line).width > maxWidth
      ? ellipsize(context, line, maxWidth)
      : line);
  }
  const width = lines.reduce((largest, line) => Math.max(largest, context.measureText(line).width), 0);
  context.restore();
  const fontSize = style.fontSize ?? 16;
  const lineHeight = style.lineHeight ?? fontSize * 1.2;
  return { width: maxWidth === undefined ? width : Math.min(width, maxWidth), height: lines.length * lineHeight, lines };
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  wordBreak: "normal" | "break-word",
): string[] {
  if (maxWidth <= 0) return text.length > 0 ? [""] : [];
  const output: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) output.push(line);
      if (context.measureText(word).width <= maxWidth || wordBreak === "normal") {
        line = word;
      } else {
        const pieces = breakWord(context, word, maxWidth);
        output.push(...pieces.slice(0, -1));
        line = pieces.at(-1) ?? "";
      }
    }
    output.push(line);
  }
  return output;
}

function breakWord(context: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const character of word) {
    if (piece && context.measureText(piece + character).width > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const ellipsis = "…";
  if (context.measureText(text + ellipsis).width <= maxWidth) return text + ellipsis;
  let result = text;
  while (result && context.measureText(result + ellipsis).width > maxWidth) result = result.slice(0, -1);
  return context.measureText(ellipsis).width <= maxWidth ? result + ellipsis : "";
}

function fontString(style: TextStyle | undefined): string {
  const fontStyle = style?.fontStyle ?? "normal";
  const weight = style?.fontWeight ?? "normal";
  const size = style?.fontSize ?? 16;
  const family = style?.fontFamily ?? "sans-serif";
  return `${fontStyle} ${weight} ${size}px ${family}`;
}

function paintBox(context: CanvasRenderingContext2D, box: LayoutBox, assets: Assets): void {
  const style = box.node.style ?? {};
  context.save();
  context.translate(box.x, box.y);
  context.globalAlpha *= style.opacity ?? 1;

  roundedRect(context, 0, 0, box.width, box.height, style.borderRadius ?? 0);
  if (style.backgroundColor) {
    context.fillStyle = style.backgroundColor;
    context.fill();
  }
  if (box.border > 0) {
    context.save();
    context.lineWidth = box.border;
    context.strokeStyle = style.borderColor ?? "#000";
    roundedRect(
      context,
      box.border / 2,
      box.border / 2,
      Math.max(0, box.width - box.border),
      Math.max(0, box.height - box.border),
      Math.max(0, (style.borderRadius ?? 0) - box.border / 2),
    );
    context.stroke();
    context.restore();
  }
  if (style.overflow === "hidden") {
    roundedRect(context, 0, 0, box.width, box.height, style.borderRadius ?? 0);
    context.clip();
  }

  const contentX = box.border + box.padding.left;
  const contentY = box.border + box.padding.top;
  const contentWidth = Math.max(0, box.width - box.border * 2 - box.padding.left - box.padding.right);
  const contentHeight = Math.max(0, box.height - box.border * 2 - box.padding.top - box.padding.bottom);

  if (box.node.type === "text") {
    paintText(context, box.node, box.lines ?? [], contentX, contentY, contentWidth);
  } else if (box.node.type === "image") {
    const image = assets.images.get(box.node);
    if (image) paintImage(context, box.node, image, contentX, contentY, contentWidth, contentHeight);
  }
  for (const child of box.children) paintBox(context, child, assets);
  context.restore();
}

function paintText(
  context: CanvasRenderingContext2D,
  node: TextNode,
  lines: readonly string[],
  x: number,
  y: number,
  width: number,
): void {
  const style = node.style ?? {};
  context.font = fontString(style);
  context.fillStyle = style.color ?? "#000";
  context.textBaseline = "top";
  context.textAlign = style.textAlign ?? "left";
  const lineHeight = style.lineHeight ?? (style.fontSize ?? 16) * 1.2;
  const alignedX = context.textAlign === "center"
    ? x + width / 2
    : context.textAlign === "right" || context.textAlign === "end" ? x + width : x;
  lines.forEach((line, index) => context.fillText(line, alignedX, y + index * lineHeight));
}

function paintImage(
  context: CanvasRenderingContext2D,
  node: ImageNode,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const fit = node.style?.objectFit ?? "fill";
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  let drawWidth = width;
  let drawHeight = height;
  if (fit !== "fill" && naturalWidth > 0 && naturalHeight > 0) {
    const contain = Math.min(width / naturalWidth, height / naturalHeight);
    const cover = Math.max(width / naturalWidth, height / naturalHeight);
    const scale = fit === "contain" ? contain
      : fit === "cover" ? cover
      : fit === "scale-down" ? Math.min(1, contain)
      : 1;
    drawWidth = naturalWidth * scale;
    drawHeight = naturalHeight * scale;
  }
  const position = parseObjectPosition(node.style?.objectPosition ?? "center");
  const drawX = x + (width - drawWidth) * position.x;
  const drawY = y + (height - drawHeight) * position.y;
  context.save();
  roundedRect(context, x, y, width, height, 0);
  context.clip();
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

function parseObjectPosition(position: ObjectPosition): { x: number; y: number } {
  if (position.includes("%")) {
    const [x = "50%", y = "50%"] = position.split(" ");
    return { x: Number.parseFloat(x) / 100, y: Number.parseFloat(y) / 100 };
  }
  const x = position.includes("left") ? 0 : position.includes("right") ? 1 : 0.5;
  const y = position.includes("top") ? 0 : position.includes("bottom") ? 1 : 0.5;
  return { x, y };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(Math.max(0, radius), width / 2, height / 2));
}

function resolvePadding(style: BoxStyle, parentWidth?: number, parentHeight?: number): Edges {
  const horizontalBase = resolveDefinite(style.padding, parentWidth) ?? 0;
  const verticalBase = resolveDefinite(style.padding, parentHeight) ?? 0;
  return {
    top: resolveDefinite(style.paddingTop, parentHeight) ?? verticalBase,
    right: resolveDefinite(style.paddingRight, parentWidth) ?? horizontalBase,
    bottom: resolveDefinite(style.paddingBottom, parentHeight) ?? verticalBase,
    left: resolveDefinite(style.paddingLeft, parentWidth) ?? horizontalBase,
  };
}

function resolveMargin(
  style: BoxStyle | undefined,
  parentWidth?: number,
  parentHeight?: number,
): { edges: Edges; auto: AutoEdges } {
  const shorthand = style?.margin;
  const values = {
    top: style?.marginTop ?? shorthand,
    right: style?.marginRight ?? shorthand,
    bottom: style?.marginBottom ?? shorthand,
    left: style?.marginLeft ?? shorthand,
  };
  return {
    edges: {
      top: resolveLength(values.top, parentHeight) ?? 0,
      right: resolveLength(values.right, parentWidth) ?? 0,
      bottom: resolveLength(values.bottom, parentHeight) ?? 0,
      left: resolveLength(values.left, parentWidth) ?? 0,
    },
    auto: {
      top: values.top === "auto",
      right: values.right === "auto",
      bottom: values.bottom === "auto",
      left: values.left === "auto",
    },
  };
}

function resolveDefinite(value: DefiniteLength | undefined, reference?: number): number | undefined {
  return resolveLength(value, reference);
}

function resolveLength(value: Length | undefined, reference?: number): number | undefined {
  if (value === undefined || value === "auto") return undefined;
  if (typeof value === "number") return value;
  return reference === undefined ? undefined : Number.parseFloat(value) / 100 * reference;
}

function toBorderSize(
  value: Length | undefined,
  style: BoxStyle,
  reference: number | undefined,
  chrome: number,
): number | undefined {
  const resolved = resolveLength(value, reference);
  if (resolved === undefined) return undefined;
  return style.boxSizing === "border-box" ? Math.max(chrome, resolved) : resolved + chrome;
}

function constrainBorderSize(
  size: number,
  axis: "width" | "height",
  style: BoxStyle,
  reference: number | undefined,
  chrome: number,
): number {
  const minValue = axis === "width" ? style.minWidth : style.minHeight;
  const maxValue = axis === "width" ? style.maxWidth : style.maxHeight;
  const min = toBorderSize(minValue, style, reference, chrome);
  const max = toBorderSize(maxValue, style, reference, chrome);
  return Math.max(chrome, min ?? 0, Math.min(size, max ?? Infinity));
}
