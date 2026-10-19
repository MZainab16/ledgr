import { marked } from "marked";
import DOMPurify from "dompurify";

export function money(total, currency) {
  if (total == null) return "";
  const n = Number(total);
  const formatted = n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!currency || currency === "NGN") return `₦${formatted}`;
  return `${currency} ${formatted}`;
}

export function niceDate(d) {
  if (!d) return "";
  const date = new Date(d.length === 10 ? d + "T12:00:00" : d);
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// Assistant replies can contain simple markdown (tables, bold). Clean it before showing.
export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text ?? "", { breaks: true }));
}
