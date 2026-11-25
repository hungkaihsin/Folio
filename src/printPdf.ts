import * as m from "mupdf";
import { contentCommand } from "./objects";
import { printLayout } from "./printLayout";
import type { PrintOptions, Rect } from "./types";

export function makePrintPdf(snapshot: Uint8Array, options: PrintOptions) {
  const source = m.Document.openDocument(snapshot, "application/pdf").asPDF()!;
  const output = new m.PDFDocument();
  const graft = output.newGraftMap();
  source.disableJS();
  try {
    const layout = printLayout(options, source.countPages());
    source.bake(true, true);
    const forms = new Map<
      number,
      { form: m.PDFObject; transform: m.Matrix; width: number; height: number }
    >();
    for (const side of layout.sides) {
      const resources: Record<string, m.PDFObject> = {};
      const commands: string[] = [];
      side.pages.forEach((pageNumber, cell) => {
        if (pageNumber === null) return;
        let pageForm = forms.get(pageNumber);
        if (!pageForm) {
          const page = source.loadPage(pageNumber) as m.PDFPage;
          const buffer = new m.Buffer();
          try {
            const contents = page.getObject().get("Contents");
            const append = (stream: m.PDFObject) => {
              if (!stream.isStream()) return;
              const data = stream.readStream();
              try {
                buffer.writeBuffer(data);
                buffer.write("\n");
              } finally {
                data.destroy();
              }
            };
            if (contents.isArray()) contents.forEach(append);
            else append(contents);
            const bounds = page.getBounds();
            const transform = page.getTransform();
            const dictionary: Record<string, unknown> = {
              Type: "XObject",
              Subtype: "Form",
              BBox: m.Rect.transform(bounds, m.Matrix.invert(transform)),
              Resources: graft.graftObject(
                page.getObject().getInheritable("Resources"),
              ),
            };
            const group = page.getObject().get("Group");
            if (!group.isNull()) dictionary.Group = graft.graftObject(group);
            pageForm = {
              form: output.addStream(buffer, dictionary),
              transform,
              width: bounds[2] - bounds[0],
              height: bounds[3] - bounds[1],
            };
            forms.set(pageNumber, pageForm);
          } finally {
            buffer.destroy();
            page.destroy();
          }
        }
        const cells = side.pages.length;
        const cellWidth = (layout.width - options.margin * 2) / cells;
        const gutter = cells === 2 ? options.margin : 0;
        const availableWidth = cellWidth - gutter / 2;
        const availableHeight = layout.height - options.margin * 2;
        const scale = Math.min(
          availableWidth / pageForm.width,
          availableHeight / pageForm.height,
        );
        const x =
          options.margin +
          cell * cellWidth +
          (cellWidth - pageForm.width * scale) / 2;
        const y =
          options.margin + (availableHeight - pageForm.height * scale) / 2;
        const placement: m.Matrix = [scale, 0, 0, scale, x, y];
        const matrix = m.Matrix.concat(
          m.Matrix.concat(pageForm.transform, placement),
          [1, 0, 0, -1, 0, layout.height],
        );
        const name = `Page${pageNumber}`;
        resources[name] = pageForm.form;
        commands.push(contentCommand(matrix, name));
      });
      output.insertPage(
        -1,
        output.addPage(
          [0, 0, layout.width, layout.height],
          0,
          { XObject: resources },
          commands.join("\n"),
        ),
      );
    }
    const buffer = output.saveToBuffer("garbage=4,compress");
    try {
      return { bytes: buffer.asUint8Array().slice(), ...layout };
    } finally {
      buffer.destroy();
    }
  } finally {
    graft.destroy();
    output.destroy();
    source.destroy();
  }
}
