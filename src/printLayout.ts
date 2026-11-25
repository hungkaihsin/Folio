import type { PrintOptions } from "./types";

export type PrintSide = {
  pages: (number | null)[];
  sheet: number;
  face: "single" | "front" | "back";
};
const paperSizes = {
  A4: [595.276, 841.89],
  A3: [841.89, 1190.551],
  Letter: [612, 792],
};

export function printLayout(options: PrintOptions, count: number) {
  const pages = options.pages;
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > 2000 ||
    new Set(pages).size !== pages.length ||
    pages.some((page) => !Number.isInteger(page) || page < 0 || page >= count)
  ) {
    throw new Error("Choose valid pages to print.");
  }
  if (
    !["normal", "booklet"].includes(options.layout) ||
    !Object.hasOwn(paperSizes, options.paper) ||
    !["portrait", "landscape"].includes(options.orientation) ||
    !["left", "right"].includes(options.binding) ||
    !["both", "front", "back"].includes(options.sides) ||
    !["simplex", "shortEdge", "longEdge"].includes(options.duplex) ||
    typeof options.reverse !== "boolean" ||
    !Number.isFinite(options.margin) ||
    options.margin < 0 ||
    options.margin > 72 ||
    !Number.isInteger(options.copies) ||
    options.copies < 1 ||
    options.copies > 999
  ) {
    throw new Error("Choose valid print settings.");
  }
  const landscape =
    options.layout === "booklet" || options.orientation === "landscape";
  const [short, long] = paperSizes[options.paper];
  const [width, height] = landscape ? [long, short] : [short, long];
  const sides: PrintSide[] = [];
  let blanks = 0;
  if (options.layout === "normal") {
    pages.forEach((page, index) =>
      sides.push({ pages: [page], sheet: index + 1, face: "single" }),
    );
  } else {
    const padded: (number | null)[] = pages.slice();
    while (padded.length % 4) {
      padded.push(null);
      blanks++;
    }
    for (let sheet = 0; sheet < padded.length / 4; sheet++) {
      const front = [padded[padded.length - 1 - sheet * 2], padded[sheet * 2]];
      const back = [
        padded[sheet * 2 + 1],
        padded[padded.length - 2 - sheet * 2],
      ];
      if (options.binding === "right") {
        front.reverse();
        back.reverse();
      }
      if (options.sides !== "back")
        sides.push({ pages: front, sheet: sheet + 1, face: "front" });
      if (options.sides !== "front")
        sides.push({ pages: back, sheet: sheet + 1, face: "back" });
    }
  }
  if (options.reverse) sides.reverse();
  const duplex =
    options.layout === "booklet" && options.sides !== "both"
      ? "simplex"
      : options.duplex;
  return { width, height, landscape, sides, blanks, duplex };
}
