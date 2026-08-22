import { adminData, slugify } from "@/lib/admin-data";

/**
 * Builds the grounding digest the assistant is allowed to answer from.
 *
 * This is assembled from `admin-data.ts` rather than written by hand, so the
 * assistant can never drift out of step with the site: edit the content once
 * and both the pages and the answers change together.
 */
export function buildProfileDigest(): string {
  const hero = adminData.getHero();
  const about = adminData.getAbout();
  const experience = adminData.getExperience();
  const skills = adminData.getSkills();
  const education = adminData.getEducation();
  const certificates = adminData.getCertificates();
  const projects = adminData.getProjects();
  const links = adminData.getSocialLinks();

  const lines: string[] = [];

  lines.push("## Identity");
  lines.push(`Name: Yassine Sinif`);
  lines.push(`Focus: ${hero.subtitle}`);
  lines.push(`Summary: ${hero.description}`);
  lines.push(`Location: ${links.location}`);
  lines.push(`Email: ${links.email}`);
  if (links.phone) lines.push(`Phone: ${links.phone}`);
  if (links.github) lines.push(`GitHub: ${links.github}`);
  if (links.linkedin) lines.push(`LinkedIn: ${links.linkedin}`);

  lines.push("\n## About");
  for (const card of about) {
    lines.push(`${card.title}: ${card.content.replace(/\n/g, "; ")}`);
  }

  lines.push("\n## Experience");
  for (const role of experience) {
    lines.push(`### ${role.title} — ${role.company} (${role.period}), ${role.location}`);
    for (const bullet of role.bullets) lines.push(`- ${bullet}`);
  }

  lines.push("\n## Skills");
  for (const group of skills) {
    lines.push(`${group.title}: ${group.skills.join(", ")}`);
  }

  lines.push("\n## Education");
  for (const item of education) {
    lines.push(`${item.title} — ${item.institution} (${item.period}). ${item.description}`);
  }

  lines.push("\n## Certifications");
  for (const cert of certificates) lines.push(`- ${cert.name} — ${cert.issuer}`);

  lines.push("\n## Projects");
  for (const project of projects) {
    lines.push(
      `### ${project.title} [slug: ${slugify(project.title)}]\n` +
        `Status: ${project.status === "En cours" ? "In progress" : "Completed"}. ` +
        `Type: ${project.category === "Personnel" ? "Personal" : "Academic"}. ` +
        `Tech: ${project.tech.join(", ")}.\n` +
        `${project.longDescription ?? project.description}`,
    );
  }

  return lines.join("\n");
}

/**
 * The assistant's instructions.
 *
 * The grounding rule is stated first and repeated in the constraints because
 * an invented job title or an imagined project is far more damaging here than
 * an unhelpful "I don't know" — a recruiter may check.
 */
export function buildSystemPrompt(digest: string, tourContext: string | null): string {
  return [
    "You are the assistant on Yassine Sinif's portfolio. You speak about him in the third person to visitors, who are usually recruiters or engineers evaluating him for an internship.",
    "",
    "RULES",
    "1. Answer ONLY from the profile data below. It is the complete and only source of truth about Yassine.",
    "2. If the data does not contain the answer, say so plainly and offer his CV or his email. Never guess a date, a job title, a technology or a result.",
    "3. Default to two or three sentences. Exception: a broad question like \"what has he built\" or \"what are his projects\" — there, list 4-6 representative projects (one line each), then state the total project count and that the rest are in the Projects section on the page. You already have the full list, so summarize it — never end with a passive hedge like \"let me know if you'd like to see more\".",
    "4. Never invent metrics, company names, or claims of seniority.",
    "5. When a visitor asks for the CV, call the send_cv tool rather than describing where to find it.",
    "6. Write in the visitor's language if they write in French or Arabic; otherwise English.",
    "7. Visitors are often non-technical recruiters. For each project, lead with what it actually does in plain words before naming its tech stack. You can use **bold** for names and \"- \" for list items — they render properly in this chat.",
    "",
    "PROFILE DATA",
    digest,
    ...(tourContext ? ["", "CURRENT CONTEXT", tourContext] : []),
  ].join("\n");
}
