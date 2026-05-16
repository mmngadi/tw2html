const fs = require("fs");
const postcss = require("postcss");
const { parse, converter, formatRgb } = require("culori");

const outPath = process.argv[2];
if (!outPath) {
  process.stderr.write("usage: extract-ir.js <output-path>\n");
  process.exit(1);
}

const css = fs.readFileSync("out.css", "utf8");
if (!css.trim()) {
  fs.writeFileSync(outPath, "{}");
  process.exit(0);
}

const root = postcss.parse(css);
const toRgb = converter("rgb");

// --- Step 1: Collect CSS variable definitions from :root / :host ---
const vars = {};

const varSelectors = new Set([
  ":root",
  ":root, :host",
  "*, ::before, ::after, ::backdrop",
  "*, ::after, ::before, ::backdrop, ::file-selector-button",
]);
let varSelectorSeen = new Set();

root.walk((node) => {
  if (node.type === "rule") {
    const sel = node.selector.trim();
    if (varSelectors.has(sel) && !varSelectorSeen.has(sel)) {
      varSelectorSeen.add(sel);
      node.walkDecls(/^--/, (d) => {
        if (d.value.trim() !== "initial") {
          vars[d.prop] = d.value.trim();
        }
      });
    }
  }
});

// --- Step 2: Resolve var() references ---
function resolveValue(value, depth = 0) {
  if (depth > 10) return value;
  if (!value.includes("var(")) return value;
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\s*\)/g,
    (match, varName, fallback) => {
      if (vars[varName] !== undefined)
        return resolveValue(vars[varName], depth + 1);
      if (fallback !== undefined)
        return resolveValue(fallback.trim(), depth + 1);
      return match;
    },
  );
}

// --- Step 3: Evaluate calc() ---
function resolveCalc(value) {
  return value.replace(/calc\(([^)]+)\)/g, (match, expr) => {
    if (expr.includes("var(")) return match;
    try {
      const unitMatch = expr.match(/[\d.]+([a-z%]+)/i);
      const unit = unitMatch ? unitMatch[1] : "";
      const numericExpr = expr.replace(/([\d.]+)[a-z%]+/gi, "$1").trim();
      const result = Function('"use strict"; return (' + numericExpr + ")")();
      if (Number.isFinite(result)) return parseFloat(result.toFixed(4)) + unit;
    } catch (_) {}
    return match;
  });
}

// --- Step 4: Convert oklch() / oklab() / lch() / lab() to rgb() ---
function resolveColor(value) {
  // Match color functions that email clients don't support
  return value.replace(/(?:oklch|oklab|lch|lab|color)\([^)]+\)/g, (match) => {
    try {
      const parsed = parse(match);
      if (!parsed) return match;
      const converted = toRgb(parsed);
      if (!converted) return match;
      const r = Math.min(255, Math.max(0, Math.round(converted.r * 255)));
      const g = Math.min(255, Math.max(0, Math.round(converted.g * 255)));
      const b = Math.min(255, Math.max(0, Math.round(converted.b * 255)));
      return "rgb(" + r + "," + g + "," + b + ")";
    } catch (_) {
      return match;
    }
  });
}

function collapseShadow(prop, value) {
  if (!prop.includes("shadow") && prop !== "box-shadow") return value;
  // If every comma-separated part is a zero shadow, collapse to none
  const parts = value.split(",").map((s) => s.trim());
  if (parts.every((p) => p === "0 0 #0000" || p === "none" || p === "")) {
    return "none";
  }
  return value;
}

// --- Step 5: Build IR from class rules ---
function normalizeSelector(sel) {
  return sel.replace(/^\./, "").replace(/\\/g, "");
}

const ir = {};

root.walkRules((rule) => {
  const sel = rule.selector.trim();
  if (!sel.startsWith(".")) return;
  if (
    sel.includes(":") ||
    sel.includes(" ") ||
    sel.includes(">") ||
    sel.includes("+") ||
    sel.includes("~")
  )
    return;

  const normalized = normalizeSelector(sel);
  const decls = [];

  rule.walkDecls((d) => {
    if (d.prop.startsWith("--")) return;
    let resolved = d.value.trim();
    // Loop until stable — handles chained var() references
    for (let i = 0; i < 5; i++) {
      const next = resolveColor(resolveCalc(resolveValue(resolved)));
      if (next === resolved) break;
      resolved = next;
    }
    resolved = collapseShadow(d.prop, resolved);
    decls.push({ prop: d.prop, value: resolved });
  });

  if (decls.length) {
    ir[normalized] = decls;
  }
});

fs.writeFileSync(outPath, JSON.stringify(ir, null, 2));
