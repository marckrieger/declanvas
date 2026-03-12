export interface CanvasProps {
  elements: ContainerProps[]
  width?: number
  height?: number
  backgroundColor?: string
  /** If true, the elements are tiled in a 2D grid to fill the canvas. */
  grid?: boolean
}

export interface ContainerProps {
  kind: 'container'
  children: CanvasElement[]
  origin?: Point
  direction?: Direction
  orientation?: Orientation
  gap?: number
  padding?: number
}

export interface TextProps {
  kind: 'text'
  text: string
  fontSize?: number
  fontWeight?: 'bold' | 'normal'
  fontFamily?: string
  color?: string
}

/**
 * At least one of width or height must be provided.
 * The missing dimension is inferred automatically from the image's natural
 * aspect ratio. If both are provided the image is stretched to fit exactly.
 */
export type ImageProps = {
  kind: 'image'
  src: string
} & ({ width: number; height?: number } | { width?: number; height: number })

export type CanvasElement = ContainerProps | TextProps | ImageProps

export type Direction = 'row' | 'column'

/**
 * Controls which corner elements are anchored to within their container.
 * Affects both the draw origin and the direction elements grow toward.
 *
 * - `topLeft`: standard top-left, elements grow right/down (default)
 * - `topRight`: anchored to right edge, elements grow left/down
 * - `bottomLeft`: anchored to bottom-left, elements grow right/up
 * - `bottomRight`: anchored to bottom-right, elements grow left/up
 */
export type Orientation = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export type Point = {
  x: number
  y: number
}
