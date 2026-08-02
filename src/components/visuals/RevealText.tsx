import { motion } from "framer-motion";
import { ElementType } from "react";

interface RevealTextProps {
  text: string;
  className?: string;
  as?: ElementType;
  /** Seconds before the first word starts moving. */
  delay?: number;
  /** Seconds between consecutive words. */
  stagger?: number;
  once?: boolean;
}

/**
 * Reveals a line word by word, each word rising out of its own clipping mask.
 * Used for headings and lead paragraphs so copy arrives with rhythm instead of
 * fading in as one block.
 */
const RevealText = ({
  text,
  className = "",
  as: Tag = "p",
  delay = 0,
  stagger = 0.045,
  once = true,
}: RevealTextProps) => {
  const words = text.split(" ");

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <motion.span
        aria-hidden="true"
        initial="hidden"
        whileInView="show"
        viewport={{ once, margin: "-80px" }}
        variants={{ show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        className="inline"
      >
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: "110%", opacity: 0 },
                show: {
                  y: 0,
                  opacity: 1,
                  transition: { duration: 0.7, ease: [0.33, 1, 0.68, 1] },
                },
              }}
            >
              {word}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
};

export default RevealText;
