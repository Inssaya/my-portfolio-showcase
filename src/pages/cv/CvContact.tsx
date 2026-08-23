import { useEffect } from "react";
import CvAppShell from "@/components/cv/CvAppShell";
import ContactSection from "@/components/ContactSection";

/** Same form, same `messages` table as the portfolio's own contact section —
 *  just reachable from inside the CV builder's own menu too, so a visitor
 *  never has to leave the app to ask a question. */
const CvContact = () => {
  useEffect(() => {
    document.title = "CV Builder — Contact";
  }, []);

  return (
    <CvAppShell>
      <ContactSection />
    </CvAppShell>
  );
};

export default CvContact;
