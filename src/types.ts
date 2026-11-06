export type Rect = [number, number, number, number];
export type Quad = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface TextSelection {
  text: string;
  quads: Quad[];
  start: Point;
  end: Point;
}
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
  objectId?: string;
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
  focusObjectId?: string;
}
export interface RenderedPage {
  png: Uint8Array;
  width: number;
  height: number;
  lines: TextLine[];
  objects: PageObject[];
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
  | {
      kind: "replace";
      page: number;
      line: number;
      text: string;
      size?: number;
      font?: string;
      allowSubstitution?: boolean;
      fitOriginal?: boolean;
      color?: RGB;
    }
  | {
      kind: "text";
      page: number;
      point: Point;
      text: string;
      size: number;
      color: RGB;
      font?: string;
      allowSubstitution?: boolean;
    }
  | {
      kind: "highlightText";
      page: number;
      start: Point;
      end: Point;
      color: RGB;
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
  | { kind: "objectTransform"; page: number; id: string; rect: Rect }
  | { kind: "objectRotate"; page: number; id: string; degrees: number }
  | { kind: "objectPaste"; page: number; point: Point; bytes: Uint8Array }
  | {
      kind: "objectText";
      page: number;
      id: string;
      text: string;
      size: number;
      color: RGB;
      font?: string;
      width?: number;
      allowSubstitution?: boolean;
    }
  | { kind: "objectDelete"; page: number; id: string }
  | { kind: "form"; page: number; index: number; value: string };

export type PageObject = {
  id: string;
  kind:
    | "text"
    | "image"
    | "highlight"
    | "rectangle"
    | "ink"
    | "note"
    | "annotation";
  rect: Rect;
  text?: string;
  size?: number;
  color?: RGB;
  font?: string;
  wrapWidth?: number;
  sourceFont?: string;
  actualFonts?: string[];
  baseline?: Point;
  rotation?: number;
};
export type ClipboardContent =
  | { kind: "text"; text: string }
  | { kind: "image"; bytes: Uint8Array }
  | { kind: "object"; bytes: Uint8Array; text?: string; png?: Uint8Array };
export type ExportFormat = "pdf" | "png" | "jpeg" | "txt";
export type ExportOptions = {
  format: ExportFormat;
  pages: number[];
  scale?: number;
  quality?: number;
};
export type ExportedFile = {
  name: string;
  extension: string;
  mime: string;
  bytes: Uint8Array;
};

export interface FontReport {
  requestedFont: string;
  usedFonts: string[];
  substitutedCharacters: string[];
  preserved: boolean;
  size?: number;
  width?: number;
  availableWidth?: number;
  overflow?: boolean;
  browserFonts?: { id: string; name: string; bytes?: Uint8Array }[];
}
export type FontQuery = {
  page: number;
  line?: number;
  objectId?: string;
  text: string;
  font?: string;
  size?: number;
  fitOriginal?: boolean;
  revision?: number;
  browserFonts?: boolean;
  knownFonts?: string[];
};
