export type CanvasRenderErrorCode =
  | "INVALID_SCENE"
  | "IMAGE_LOAD_FAILED"
  | "FONT_LOAD_FAILED"
  | "CONTEXT_UNAVAILABLE";

export class CanvasRenderError extends Error {
  readonly code: CanvasRenderErrorCode;
  override readonly cause?: unknown;

  constructor(code: CanvasRenderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CanvasRenderError";
    this.code = code;
    if (options && "cause" in options) this.cause = options.cause;
  }
}
