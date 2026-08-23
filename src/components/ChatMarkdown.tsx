import { ReactNode } from "react";

/**
 * Renders the markdown-lite that language models actually emit — paragraphs,
 * "- " and "1. " lists, and **bold** — as real elements.
 *
 * Shared by the portfolio assistant and the CV builder. Both relay raw model
 * text, so without this a numbered list arrives as literal asterisks and digits.
 * Deliberately not a full markdown parser: the model is instructed to use only
 * these forms, and a parser would pull in a dependency plus an HTML-injection
 * surface for a handful of tags.
 */

/** Renders "**bold**" spans within a single line. */
function renderInline(text: string): ReactNode[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((segment, i) => (i % 2 === 1 ? <strong key={i}>{segment}</strong> : segment));
}

interface ChatMarkdownProps {
  content: string;
  /** Extra classes for the wrapper, e.g. to tune spacing per surface. */
  className?: string;
}

const ChatMarkdown = ({ content, className = "space-y-2" }: ChatMarkdownProps) => {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listTag: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listTag || listItems.length === 0) return;
    const ListTag = listTag;
    blocks.push(
      <ListTag
        key={blocks.length}
        className={
          ListTag === "ul"
            ? "list-disc space-y-1 pl-4"
            : "list-decimal space-y-1 pl-4"
        }
      >
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ListTag>,
    );
    listItems = [];
    listTag = null;
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)/);
    const numbered = line.match(/^\d+\.\s+(.*)/);
    if (bullet) {
      if (listTag !== "ul") flushList();
      listTag = "ul";
      listItems.push(bullet[1]);
    } else if (numbered) {
      if (listTag !== "ol") flushList();
      listTag = "ol";
      listItems.push(numbered[1]);
    } else {
      flushList();
      blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className={className}>{blocks}</div>;
};

export default ChatMarkdown;
