import { describe, expect, it, vi } from "vitest";
import { CanvasRenderError, renderCanvas } from "../src/index.js";
import type { CanvasScene } from "../src/index.js";

class FakeContext {
  font = "";
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  globalAlpha = 1;
  lineWidth = 1;
  textBaseline: CanvasTextBaseline = "alphabetic";
  textAlign: CanvasTextAlign = "start";
  readonly calls: Array<{ name: string; args: unknown[] }> = [];

  private record(name: string, ...args: unknown[]): void { this.calls.push({ name, args }); }
  save(): void { this.record("save"); }
  restore(): void { this.record("restore"); }
  scale(x: number, y: number): void { this.record("scale", x, y); }
  translate(x: number, y: number): void { this.record("translate", x, y); }
  fillRect(...args: number[]): void { this.record("fillRect", ...args); }
  beginPath(): void { this.record("beginPath"); }
  roundRect(...args: unknown[]): void { this.record("roundRect", ...args); }
  fill(): void { this.record("fill"); }
  stroke(): void { this.record("stroke"); }
  clip(): void { this.record("clip"); }
  fillText(...args: unknown[]): void { this.record("fillText", ...args); }
  drawImage(...args: unknown[]): void { this.record("drawImage", ...args); }
  measureText(text: string): TextMetrics { return { width: text.length * 10 } as TextMetrics; }
}

class FakeCanvas {
  width = 0;
  height = 0;
  style = { width: "", height: "" };
  constructor(readonly context: FakeContext | null) {}
  getContext(kind: string): FakeContext | null { return kind === "2d" ? this.context : null; }
}

function environment(options: { context?: FakeContext | null; fontLoad?: ReturnType<typeof vi.fn> } = {}) {
  const context = options.context === undefined ? new FakeContext() : options.context;
  const canvas = new FakeCanvas(context);
  const fontLoad = options.fontLoad ?? vi.fn().mockResolvedValue([]);
  const document = {
    defaultView: { devicePixelRatio: 2 },
    fonts: { load: fontLoad },
    createElement: vi.fn((tag: string) => {
      if (tag === "canvas") return canvas;
      throw new Error(`Unexpected element: ${tag}`);
    }),
  } as unknown as Document;
  return { canvas, context, document, fontLoad };
}

function loadedImage(width: number, height: number): HTMLImageElement {
  return {
    complete: true,
    naturalWidth: width,
    naturalHeight: height,
    currentSrc: "",
    src: "memory:image",
  } as HTMLImageElement;
}

describe("renderCanvas", () => {
  it("returns a DPR-scaled canvas and paints the scene background", async () => {
    const env = environment();
    const result = await renderCanvas(
      { width: 100, height: 50, backgroundColor: "red", children: [] },
      { document: env.document },
    );

    expect(result).toBe(env.canvas);
    expect(env.canvas).toMatchObject({ width: 200, height: 100, style: { width: "100px", height: "50px" } });
    expect(env.context?.calls).toContainEqual({ name: "scale", args: [2, 2] });
    expect(env.context?.calls).toContainEqual({ name: "fillRect", args: [0, 0, 100, 50] });
  });

  it("lays out a centered, space-between row", async () => {
    const env = environment();
    const scene = {
      width: 100,
      height: 50,
      style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
      children: [
        { type: "container", style: { width: 20, height: 20 }, children: [] },
        { type: "container", style: { width: 20, height: 20 }, children: [] },
      ],
    } satisfies CanvasScene;

    await renderCanvas(scene, { document: env.document, pixelRatio: 1 });
    const translations = env.context?.calls.filter((call) => call.name === "translate").map((call) => call.args);
    expect(translations).toEqual([[0, 0], [0, 15], [80, 15]]);
  });

  it("applies padding, gap, percentages, and flex growth", async () => {
    const env = environment();
    const scene = {
      width: 200,
      height: 60,
      style: { flexDirection: "row", padding: 10, gap: 10 },
      children: [
        { type: "container", style: { width: "25%", flexGrow: 1 }, children: [] },
        { type: "container", style: { width: 20, flexGrow: 1 }, children: [] },
      ],
    } satisfies CanvasScene;

    await renderCanvas(scene, { document: env.document, pixelRatio: 1 });
    const translations = env.context?.calls.filter((call) => call.name === "translate").map((call) => call.args);
    expect(translations?.[1]).toEqual([10, 10]);
    expect(translations?.[2]?.[0]).toBeGreaterThan(100);
  });

  it("wraps text, respects maxLines, and adds an ellipsis", async () => {
    const env = environment();
    await renderCanvas({
      width: 80,
      height: 60,
      children: [{
        type: "text",
        text: "one two three four",
        style: { width: 70, fontSize: 10, maxLines: 2, textOverflow: "ellipsis" },
      }],
    }, { document: env.document, pixelRatio: 1 });

    const texts = env.context?.calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    expect(texts).toEqual(["one two", "three…"]);
    expect(env.fontLoad).toHaveBeenCalledWith("normal normal 10px sans-serif", "one two three four");
  });

  it("remeasures auto-height text at a stretched column width", async () => {
    const env = environment();
    await renderCanvas({
      width: 50,
      height: 100,
      children: [
        { type: "text", text: "one two three", style: { fontSize: 10 } },
        { type: "container", style: { height: 10 }, children: [] },
      ],
    }, { document: env.document, pixelRatio: 1 });

    const translations = env.context?.calls.filter((call) => call.name === "translate").map((call) => call.args);
    expect(translations?.[2]).toEqual([0, 36]);
  });

  it("retains the remeasured height of a row item after its text wraps", async () => {
    const env = environment();
    await renderCanvas({
      width: 200,
      height: 200,
      style: { flexDirection: "row", alignItems: "center" },
      children: [
        {
          type: "container",
          style: { flexGrow: 1, gap: 10 },
          children: [
            {
              type: "text",
              text: "one two three",
              style: { width: "100%", fontSize: 10, lineHeight: 12 },
            },
            { type: "text", text: "sub", style: { fontSize: 10, lineHeight: 12 } },
          ],
        },
        {
          type: "container",
          style: { width: 100, height: 100, flexShrink: 0 },
          children: [],
        },
      ],
    }, { document: env.document, pixelRatio: 1 });

    const translations = env.context?.calls
      .filter((call) => call.name === "translate")
      .map((call) => call.args);
    expect(translations?.[1]).toEqual([0, 77]);
    expect(translations?.[3]).toEqual([0, 34]);
  });

  it("contains and positions an image inside its content box", async () => {
    const env = environment();
    const image = loadedImage(200, 100);
    await renderCanvas({
      width: 100,
      height: 100,
      children: [{
        type: "image",
        src: image,
        style: { width: 100, height: 100, objectFit: "contain", objectPosition: "bottom right" },
      }],
    }, { document: env.document, pixelRatio: 1 });

    const draw = env.context?.calls.find((call) => call.name === "drawImage");
    expect(draw?.args.slice(1)).toEqual([0, 50, 100, 50]);
  });

  it("preserves intrinsic image ratio when max dimensions constrain an auto size", async () => {
    const env = environment();
    const image = loadedImage(200, 100);
    await renderCanvas({
      width: 200,
      height: 100,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [{ type: "image", src: image, style: { maxWidth: 100, objectFit: "contain" } }],
    }, { document: env.document, pixelRatio: 1 });

    const draw = env.context?.calls.find((call) => call.name === "drawImage");
    expect(draw?.args.slice(1)).toEqual([0, 0, 100, 50]);
  });

  it("clips rounded boxes and paints their border", async () => {
    const env = environment();
    await renderCanvas({
      width: 40,
      height: 40,
      children: [{
        type: "container",
        style: { width: 20, height: 20, borderWidth: 2, borderRadius: 4, overflow: "hidden" },
        children: [],
      }],
    }, { document: env.document, pixelRatio: 1 });

    expect(env.context?.calls.some((call) => call.name === "stroke")).toBe(true);
    expect(env.context?.calls.some((call) => call.name === "clip")).toBe(true);
  });

  it("rejects invalid scenes and missing contexts with typed errors", async () => {
    const env = environment();
    await expect(renderCanvas({ width: 0, height: 10, children: [] }, { document: env.document }))
      .rejects.toMatchObject({ code: "INVALID_SCENE" });

    const noContext = environment({ context: null });
    await expect(renderCanvas({ width: 10, height: 10, children: [] }, { document: noContext.document }))
      .rejects.toEqual(expect.any(CanvasRenderError));
    await expect(renderCanvas({ width: 10, height: 10, children: [] }, { document: noContext.document }))
      .rejects.toMatchObject({ code: "CONTEXT_UNAVAILABLE" });
  });

  it("rejects invalid runtime style values and already-failed images", async () => {
    const env = environment();
    await expect(renderCanvas({
      width: 10,
      height: 10,
      style: { gap: "auto" as never },
      children: [],
    }, { document: env.document })).rejects.toMatchObject({ code: "INVALID_SCENE" });

    await expect(renderCanvas({
      width: 10,
      height: 10,
      children: [{ type: "image", src: loadedImage(0, 0) }],
    }, { document: env.document })).rejects.toMatchObject({ code: "IMAGE_LOAD_FAILED" });
  });

  it("turns font-loading rejection into a CanvasRenderError", async () => {
    const fontLoad = vi.fn().mockRejectedValue(new Error("font network error"));
    const env = environment({ fontLoad });
    await expect(renderCanvas({
      width: 10,
      height: 10,
      children: [{ type: "text", text: "x", style: { fontFamily: "Remote" } }],
    }, { document: env.document })).rejects.toMatchObject({ code: "FONT_LOAD_FAILED" });
  });

  const directions = ["row", "column"] as const;
  const justifications = [
    "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly",
  ] as const;
  const alignments = ["flex-start", "center", "flex-end", "stretch"] as const;

  for (const flexDirection of directions) {
    for (const justifyContent of justifications) {
      for (const alignItems of alignments) {
        it(`lays out ${flexDirection} / ${justifyContent} / ${alignItems}`, async () => {
          const env = environment();
          await renderCanvas({
            width: 100,
            height: 100,
            style: { flexDirection, justifyContent, alignItems },
            children: [
              { type: "container", style: { width: 10, height: 20 }, children: [] },
              { type: "container", style: { width: 10, height: 20 }, children: [] },
            ],
          }, { document: env.document, pixelRatio: 1 });

          const translations = env.context?.calls
            .filter((call) => call.name === "translate")
            .slice(1)
            .map((call) => call.args as number[][][number]) ?? [];
          const free = flexDirection === "row" ? 80 : 60;
          const itemMain = flexDirection === "row" ? 10 : 20;
          const starts = {
            "flex-start": [0, itemMain],
            center: [free / 2, free / 2 + itemMain],
            "flex-end": [free, free + itemMain],
            "space-between": [0, free + itemMain],
            "space-around": [free / 4, free * 3 / 4 + itemMain],
            "space-evenly": [free / 3, free * 2 / 3 + itemMain],
          }[justifyContent];
          const itemCross = flexDirection === "row" ? 20 : 10;
          const cross = alignItems === "center" ? (100 - itemCross) / 2
            : alignItems === "flex-end" ? 100 - itemCross : 0;

          translations.forEach((translation, index) => {
            const expected = flexDirection === "row"
              ? [starts[index], cross]
              : [cross, starts[index]];
            expect(translation[0]).toBeCloseTo(expected[0] ?? 0);
            expect(translation[1]).toBeCloseTo(expected[1] ?? 0);
          });
        });
      }
    }
  }

  it("distributes flex growth in proportion to grow factors", async () => {
    const env = environment();
    await renderCanvas({
      width: 200,
      height: 40,
      style: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
      children: [
        { type: "container", style: { width: 20, height: 10, flexGrow: 1 }, children: [] },
        { type: "container", style: { width: 20, height: 10, flexGrow: 2 }, children: [] },
      ],
    }, { document: env.document, pixelRatio: 1 });

    const translations = env.context?.calls.filter((call) => call.name === "translate");
    expect(translations?.[2]?.args).toEqual([80, 0]);
  });

  it("distributes flex shrink using scaled shrink factors", async () => {
    const env = environment();
    await renderCanvas({
      width: 100,
      height: 40,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [
        { type: "container", style: { width: 80, height: 10, flexShrink: 1 }, children: [] },
        { type: "container", style: { width: 80, height: 10, flexShrink: 3 }, children: [] },
      ],
    }, { document: env.document, pixelRatio: 1 });

    const translations = env.context?.calls.filter((call) => call.name === "translate");
    expect(translations?.[2]?.args).toEqual([65, 0]);
  });

  it("uses flex basis and main-axis auto margins", async () => {
    const basisEnv = environment();
    await renderCanvas({
      width: 100,
      height: 40,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [
        { type: "container", style: { width: 20, height: 10, flexBasis: 60, flexShrink: 0 }, children: [] },
        { type: "container", style: { width: 20, height: 10, flexShrink: 0 }, children: [] },
      ],
    }, { document: basisEnv.document, pixelRatio: 1 });
    expect(basisEnv.context?.calls.filter((call) => call.name === "translate")[2]?.args).toEqual([60, 0]);

    const marginEnv = environment();
    await renderCanvas({
      width: 100,
      height: 40,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [
        { type: "container", style: { width: 20, height: 10, marginLeft: "auto" }, children: [] },
        { type: "container", style: { width: 20, height: 10 }, children: [] },
      ],
    }, { document: marginEnv.document, pixelRatio: 1 });
    const translations = marginEnv.context?.calls.filter((call) => call.name === "translate");
    expect(translations?.[1]?.args).toEqual([60, 0]);
    expect(translations?.[2]?.args).toEqual([80, 0]);
  });

  it("supports alignSelf overrides and cross-axis stretch", async () => {
    const overrideEnv = environment();
    await renderCanvas({
      width: 100,
      height: 100,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [{
        type: "container",
        style: { width: 10, height: 20, alignSelf: "flex-end" },
        children: [],
      }],
    }, { document: overrideEnv.document, pixelRatio: 1 });
    expect(overrideEnv.context?.calls.filter((call) => call.name === "translate")[1]?.args).toEqual([0, 80]);

    const stretchEnv = environment();
    await renderCanvas({
      width: 100,
      height: 100,
      style: { flexDirection: "row", alignItems: "stretch" },
      children: [{
        type: "container",
        style: { width: 20, backgroundColor: "red" },
        children: [],
      }],
    }, { document: stretchEnv.document, pixelRatio: 1 });
    expect(stretchEnv.context?.calls).toContainEqual({ name: "roundRect", args: [0, 0, 20, 100, 0] });
  });

  it("resolves percentages, min/max constraints, and box sizing", async () => {
    const percentEnv = environment();
    await renderCanvas({
      width: 200,
      height: 100,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [
        { type: "container", style: { width: "50%", height: "50%", maxWidth: 80 }, children: [] },
        { type: "container", style: { width: 10, height: 10, minWidth: 30 }, children: [] },
      ],
    }, { document: percentEnv.document, pixelRatio: 1 });
    expect(percentEnv.context?.calls.filter((call) => call.name === "translate")[2]?.args).toEqual([80, 0]);

    const boxEnv = environment();
    await renderCanvas({
      width: 100,
      height: 50,
      style: { flexDirection: "row", alignItems: "flex-start" },
      children: [
        {
          type: "container",
          style: { width: 20, height: 10, padding: 5, borderWidth: 2, boxSizing: "content-box" },
          children: [],
        },
        {
          type: "container",
          style: { width: 20, height: 20, padding: 5, borderWidth: 2, boxSizing: "border-box" },
          children: [],
        },
      ],
    }, { document: boxEnv.document, pixelRatio: 1 });
    expect(boxEnv.context?.calls.filter((call) => call.name === "translate")[2]?.args).toEqual([34, 0]);
  });

  it("supports nowrap, break-word, text alignment, and clipping overflow", async () => {
    const env = environment();
    await renderCanvas({
      width: 100,
      height: 100,
      children: [
        {
          type: "text",
          text: "abcdefgh",
          style: { width: 30, fontSize: 10, whiteSpace: "nowrap", textOverflow: "ellipsis" },
        },
        {
          type: "text",
          text: "abcdefgh",
          style: { width: 30, fontSize: 10, wordBreak: "break-word", maxLines: 2 },
        },
        {
          type: "text",
          text: "x",
          style: { width: 30, fontSize: 10, textAlign: "right", overflow: "hidden" },
        },
      ],
    }, { document: env.document, pixelRatio: 1 });

    const texts = env.context?.calls.filter((call) => call.name === "fillText").map((call) => call.args);
    expect(texts).toEqual([
      ["ab…", 0, 0],
      ["abc", 0, 0],
      ["def", 0, 12],
      ["x", 30, 0],
    ]);
    expect(env.context?.calls.some((call) => call.name === "clip")).toBe(true);
  });

  for (const [objectFit, expected] of [
    ["fill", [0, 0, 100, 100]],
    ["contain", [0, 25, 100, 50]],
    ["cover", [-50, 0, 200, 100]],
    ["none", [-50, 0, 200, 100]],
    ["scale-down", [0, 25, 100, 50]],
  ] as const) {
    it(`renders image objectFit: ${objectFit}`, async () => {
      const env = environment();
      await renderCanvas({
        width: 100,
        height: 100,
        children: [{
          type: "image",
          src: loadedImage(200, 100),
          style: { width: 100, height: 100, objectFit },
        }],
      }, { document: env.document, pixelRatio: 1 });
      expect(env.context?.calls.find((call) => call.name === "drawImage")?.args.slice(1)).toEqual(expected);
    });
  }
});
