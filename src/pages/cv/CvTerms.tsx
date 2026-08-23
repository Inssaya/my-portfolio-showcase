import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";

/**
 * Terms & privacy note for the CV builder.
 *
 * Short and honest rather than boilerplate, because that is what a free beta
 * actually calls for: what is stored, why, and what to expect while it costs
 * nothing. Linked from the sign-up checkbox in CvSignUp.tsx.
 */
const CvTerms = () => {
  useEffect(() => {
    document.title = "CV Builder — Terms & Privacy";
  }, []);

  return (
    <div className="min-h-[100svh] bg-background">
      <Navigation />
      <MobileNav />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-28">
        <h1 className="font-sora text-2xl font-bold md:text-3xl">Terms &amp; Privacy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 font-sora text-base font-semibold text-foreground">
              What this is
            </h2>
            <p>
              The CV builder is a free beta. It uses an AI assistant to interview you or read a CV
              you provide, and renders a designed PDF from what you tell it. It is not a paid
              product today, and features or limits may change as it develops.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-sora text-base font-semibold text-foreground">
              What is stored
            </h2>
            <p>
              Your account (name, email) is managed by Supabase Auth. The CV you build — the text
              you provide, any file or photo you upload, and the conversation used to write it — is
              stored so you can come back to it and so the service can be improved. Nothing is sold
              or shared with third parties beyond the infrastructure that runs the service (Supabase
              for accounts, OpenAI for the writing itself).
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-sora text-base font-semibold text-foreground">Your CV</h2>
            <p>
              You are responsible for the accuracy of what appears on your finished CV. The
              assistant is instructed to work only from what you tell it, but you should read the
              result before using it — treat it as a draft you review, not a final document you
              trust blindly.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-sora text-base font-semibold text-foreground">Contact</h2>
            <p>
              Questions about your data or this service:{" "}
              <a href="mailto:yassinsinif4@gmail.com" className="text-accent underline">
                yassinsinif4@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <Link to="/cv-builder/signup" className="mt-10 inline-block text-sm font-semibold text-accent hover:underline">
          ← Back to sign up
        </Link>
      </main>
    </div>
  );
};

export default CvTerms;
