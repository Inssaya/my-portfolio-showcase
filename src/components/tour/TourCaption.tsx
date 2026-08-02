import { motion } from "framer-motion";

interface TourCaptionProps {
  /** The part already spoken. */
  revealed: string;
  /** The rest, kept in the layout so the line never reflows as it fills. */
  pending: string;
}

/**
 * The narration caption.
 *
 * Both halves of the sentence are always rendered — the unspoken part simply
 * sits at low opacity. Appending characters to a growing string would reflow
 * the paragraph on almost every frame, which reads as jitter; holding the full
 * text and changing only colour keeps every word in its final position from
 * the first frame.
 *
 * Screen readers get the whole sentence at once, since revealing it character
 * by character to a screen reader would be unusable.
 */
const TourCaption = ({ revealed, pending }: TourCaptionProps) => (
  <motion.p
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.45, ease: [0.33, 1, 0.68, 1] }}
    className="mx-auto max-w-2xl text-center font-sora text-xl font-medium leading-relaxed tracking-tight md:text-3xl md:leading-relaxed"
  >
    <span className="sr-only">{revealed + pending}</span>
    <span aria-hidden="true">
      <span className="text-foreground">{revealed}</span>
      <span className="text-foreground/25">{pending}</span>
    </span>
  </motion.p>
);

export default TourCaption;
