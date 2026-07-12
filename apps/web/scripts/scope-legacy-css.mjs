import fs from "node:fs";

const path = "src/domains/platform/legacy/portal-legacy.css";
let css = fs.readFileSync(path, "utf8");

css = css.replace(/^    ([^{]+)\{/gm, (match, selector) => {
  if (selector.includes(".legacy-portal-host")) return match;
  const parts = selector.split(",").map((s) => {
    s = s.trim();
    if (!s || s.startsWith(".legacy-portal-host")) return s;
    if (s.startsWith("body.")) return `.legacy-portal-host${s.slice(4)}`;
    if (s.startsWith("body ")) return `.legacy-portal-host ${s.slice(5)}`;
    if (s === "body" || s === "html" || s === ":root") return ".legacy-portal-host";
    return `.legacy-portal-host ${s}`;
  });
  return `    ${parts.join(", ")} {`;
});

fs.writeFileSync(path, css);
console.log("Scoped legacy CSS");
