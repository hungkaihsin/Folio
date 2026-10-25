export type Rect = [number, number, number, number];
export type Point = [number, number];
export type RGB = [number, number, number];
export interface TextLine {
  id: number;
  text: string;
  rect: Rect;
  origin: Point;
  size: number;
  font: string;
  color: RGB;
  horizontal: boolean;
}
export interface PageInfo {
  width: number;
  height: number;
}
export interface DocumentInfo {
  pages: PageInfo[];
  canUndo: boolean;
  canRedo: boolean;
  position: number;
  title: string;
  editable: boolean;
}
export interface RenderedPage {
  png: Uint8Array;
  width: number;
  height: number;
  lines: TextLine[];
  annotations: { index: number; type: string; contents: string }[];
  widgets: {
    index: number;
    name: string;
    value: string;
    type: string;
    readonly: boolean;
    options: string[];
  }[];
}
export type Edit =
  | { kind: "replace"; page: number; line: number; text: string; size?: number }
  | {
      kind: "text";
      page: number;
      point: Point;
      text: string;
      size: number;
      color: RGB;
      font?: string;
    }
  | { kind: "highlight" | "rectangle"; page: number; rect: Rect; color: RGB }
  | { kind: "ink"; page: number; points: Point[]; color: RGB; width: number }
  | {
      kind: "image";
      page: number;
      point: Point;
      bytes: Uint8Array;
      width: number;
    }
  | { kind: "note"; page: number; point: Point; text: string }
  | { kind: "rotate"; page: number }
  | { kind: "delete" | "duplicate" | "blank"; page: number }
  | { kind: "move"; page: number; to: number }
  | { kind: "merge"; bytes: Uint8Array }
  | { kind: "removeAnnotation"; page: number; index: number }
  | { kind: "form"; page: number; index: number; value: string };
