import {
  ChatCircleText,
  Highlighter,
  PencilSimple,
  Trash,
  Plus,
} from "@phosphor-icons/react";
import { splitAnnotations, type PageAnnotation } from "./annotations";
import { tr } from "./i18n";

export function AnnotationPanel({
  mode,
  annotations,
  busy,
  editable,
  onRemove,
  onComment,
}: {
  mode: "comments" | "markup";
  annotations: PageAnnotation[];
  busy: boolean;
  editable: boolean;
  onRemove: (index: number) => void;
  onComment: () => void;
}) {
  const items = splitAnnotations(annotations)[mode];
  const comments = mode === "comments";
  return (
    <section
      className="review-panel"
      aria-label={tr(comments ? "Page comments" : "Page markup")}
    >
      <div className="review-heading">
        <div>
          <div className="section-label">{tr("This page")}</div>
          <h2>{tr(comments ? "Comments" : "Markup")}</h2>
        </div>
        <span className="review-count">{items.length}</span>
      </div>
      <p className="inspector-copy">
        {tr(
          comments
            ? "Only comments you add appear here."
            : "Highlights and drawings stay separate from comments.",
        )}
      </p>
      {comments && (
        <button
          type="button"
          className="button subtle add-comment-button"
          disabled={busy || !editable}
          onClick={onComment}
        >
          <Plus size={16} />
          {tr("Add a comment")}
        </button>
      )}
      {items.length ? (
        <div className="review-list">
          {items.map((a) => {
            const Icon = comments
              ? ChatCircleText
              : a.type === "Highlight"
                ? Highlighter
                : PencilSimple;
            return (
              <article
                className={`annotation-item ${comments ? "comment-item" : "markup-item"}`}
                key={a.index}
                data-annotation-type={a.type}
              >
                <div
                  className={`annotation-glyph ${a.type === "Highlight" ? "highlight-glyph" : ""}`}
                >
                  <Icon size={17} />
                </div>
                <div className="annotation-body">
                  <span className="annotation-type">
                    {tr(comments ? "Comment" : a.type)}
                  </span>
                  {comments ? (
                    <p>{a.contents || tr("Empty comment")}</p>
                  ) : a.contents ? (
                    <details className="annotation-details">
                      <summary>{tr("Existing annotation text")}</summary>
                      <p>{a.contents}</p>
                    </details>
                  ) : (
                    <span className="markup-caption">
                      {tr(
                        a.type === "Highlight"
                          ? "Text highlight"
                          : "Page markup",
                      )}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button remove-annotation"
                  title={`${tr("Remove annotation")} ${a.index + 1}`}
                  aria-label={`Remove annotation ${a.index + 1}`}
                  disabled={busy || !editable}
                  onClick={() => onRemove(a.index)}
                >
                  <Trash size={15} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-panel review-empty">
          {comments ? <ChatCircleText size={27} /> : <Highlighter size={27} />}
          <p>{tr(comments ? "No comments yet." : "No markup yet.")}</p>
          <span>
            {tr(
              comments
                ? "Choose Comment, then click the page to write a note."
                : "Select text with Highlight, or use a drawing tool.",
            )}
          </span>
        </div>
      )}
    </section>
  );
}
