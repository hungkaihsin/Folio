export type PageAnnotation = {
  index: number;
  type: string;
  contents: string;
};
export function isComment(annotation: Pick<PageAnnotation, "type">) {
  return annotation.type === "Text" || annotation.type === "FreeText";
}
export function splitAnnotations(annotations: PageAnnotation[]) {
  return {
    comments: annotations.filter(isComment),
    markup: annotations.filter((annotation) => !isComment(annotation)),
  };
}
