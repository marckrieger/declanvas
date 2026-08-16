export type Percentage = `${number}%`;
export type Length = number | Percentage | "auto";
export type DefiniteLength = number | Percentage;
export type BoxSizing = "content-box" | "border-box";
export type FlexDirection = "row" | "column";
export type JustifyContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type AlignItems = "flex-start" | "center" | "flex-end" | "stretch";
export type ObjectFit = "fill" | "contain" | "cover" | "none" | "scale-down";
export type ObjectPositionKeyword =
  | "top left"
  | "top"
  | "top right"
  | "left"
  | "center"
  | "right"
  | "bottom left"
  | "bottom"
  | "bottom right";
export type ObjectPosition = ObjectPositionKeyword | `${number}% ${number}%`;
export type CanvasTextAlign = "left" | "center" | "right" | "start" | "end";

export interface BoxStyle {
  width?: Length;
  height?: Length;
  minWidth?: DefiniteLength;
  maxWidth?: DefiniteLength;
  minHeight?: DefiniteLength;
  maxHeight?: DefiniteLength;
  margin?: Length;
  marginTop?: Length;
  marginRight?: Length;
  marginBottom?: Length;
  marginLeft?: Length;
  padding?: DefiniteLength;
  paddingTop?: DefiniteLength;
  paddingRight?: DefiniteLength;
  paddingBottom?: DefiniteLength;
  paddingLeft?: DefiniteLength;
  boxSizing?: BoxSizing;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  overflow?: "visible" | "hidden";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Length;
  alignSelf?: AlignItems;
}

export interface ContainerStyle extends BoxStyle {
  flexDirection?: FlexDirection;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  gap?: DefiniteLength;
}

export interface TextStyle extends BoxStyle {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic" | "oblique";
  lineHeight?: number;
  textAlign?: CanvasTextAlign;
  whiteSpace?: "normal" | "nowrap";
  wordBreak?: "normal" | "break-word";
  maxLines?: number;
  textOverflow?: "clip" | "ellipsis";
}

export interface ImageStyle extends BoxStyle {
  objectFit?: ObjectFit;
  objectPosition?: ObjectPosition;
}

export interface ContainerNode {
  type: "container";
  style?: ContainerStyle;
  children: readonly CanvasNode[];
}

export interface TextNode {
  type: "text";
  text: string;
  style?: TextStyle;
}

export interface ImageNode {
  type: "image";
  src: string | HTMLImageElement;
  crossOrigin?: "anonymous" | "use-credentials";
  style?: ImageStyle;
}

export type CanvasNode = ContainerNode | TextNode | ImageNode;

export interface CanvasScene {
  width: number;
  height: number;
  backgroundColor?: string;
  style?: Omit<ContainerStyle, "width" | "height" | "margin" | "marginTop" | "marginRight" | "marginBottom" | "marginLeft">;
  children: readonly CanvasNode[];
}

export interface RenderOptions {
  pixelRatio?: number;
  document?: Document;
}
