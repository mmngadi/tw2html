const fs = require("fs");
const path = require("path");
const os = require("os");

process.chdir(__dirname);

const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");

const classes = JSON.parse(fs.readFileSync(0, "utf8"));

if (classes.length === 0) {
  fs.writeFileSync("out.css", "");
  process.exit(0);
}

const tmpHtml = path.join(os.tmpdir(), `tw-ir-${process.pid}.html`);
fs.writeFileSync(tmpHtml, `<div class="${classes.join(" ")}"></div>`);

// In Tailwind v4, content scanning is configured via @source in the CSS,
// not via the PostCSS plugin options (that option is silently ignored).
const cssInput = `@import "tailwindcss";\n@source "${tmpHtml}";`;
const inputCss = path.join(__dirname, "input.css");

(async () => {
  try {
    const result = await postcss([tailwind()]).process(cssInput, { from: inputCss });
    fs.writeFileSync("out.css", result.css);
  } catch (err) {
    process.stderr.write(`build-ir.js error: ${err.message}\n`);
    process.exit(1);
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
  }
})();
