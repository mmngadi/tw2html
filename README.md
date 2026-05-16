# tw2html

A CLI tool that takes HTML using Tailwind CSS v4 utility classes and outputs HTML with fully inlined, email-safe styles — no class attributes, no CSS variables, no external stylesheets.

```bash
echo '<div class="p-4 bg-red-500 font-bold">Hello</div>' | tw2html
```

```html
<html><head></head><body>
  <div style="padding:1rem;background-color:rgb(251,44,54);font-weight:700">Hello</div>
</body></html>
```

---

## What problem it solves

Email clients (Gmail, Outlook, Apple Mail) do not support:

- External or embedded stylesheets
- CSS custom properties (`var(--color-red-500)`)
- Modern color spaces (`oklch()`, `oklab()`)
- CSS logical properties (`margin-inline`, `padding-block`)
- Tailwind's utility class names

`tw2html` bridges the gap. You write HTML with Tailwind classes as you normally would, pipe it through `tw2html`, and get back HTML that renders correctly in email clients — with concrete `rgb()` colors, physical margin/padding properties, and everything inlined on the element.

---

## How it works

The pipeline has four steps orchestrated by `inline.sh`:

```
stdin HTML
  → bin/extract          parse HTML, emit unique class names as JSON
  → js/build-ir.js       run Tailwind v4 via PostCSS, generate CSS for only those classes
  → js/extract-ir.js     resolve var(), calc(), oklch() → build a flat IR JSON map
  → bin/inline           inline styles, deduplicate props, expand logical properties → stdout
```

**Step 1 — extract** (`cmd/extract/`, Go): parses the input HTML and emits a deduplicated JSON array of every Tailwind class name found.

**Step 2 — build IR** (`js/build-ir.js`, Node): writes a temp HTML file, runs Tailwind v4 through PostCSS using `@source` to generate only the CSS needed for those exact classes.

**Step 3 — parse IR** (`js/extract-ir.js`, Node): walks the generated CSS, collects CSS variable definitions from `:root`, recursively resolves all `var()` references, evaluates `calc()` expressions, converts `oklch()`/`oklab()` colors to `rgb()` using [culori](https://culorijs.org/), and writes a flat JSON map of `{ "class-name": [{ prop, value }] }`.

**Step 4 — inline** (`cmd/inline/`, Go): walks the HTML tree, resolves each element's classes against the IR, deduplicates declarations (last value wins, matching CSS cascade), expands logical properties to physical equivalents, and writes the final HTML to stdout.

---

## Requirements

| Dependency | Version |
|---|---|
| Go | 1.25+ |
| Node.js | 18+ |
| npm | 8+ |

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mmngadi/tw2html.git
cd tw2html
```

### 2. Install dependencies and build

```bash
make
```

This runs `npm install` in the `js/` directory and compiles both Go binaries into `bin/`.

### 3. Symlink for global use

```bash
sudo ln -s "$(pwd)/inline.sh" /usr/local/bin/tw2html
```

Verify it works:

```bash
which tw2html
echo '<div class="p-4 text-white bg-blue-600">hello</div>' | tw2html
```

> **Note:** the symlink points to the project directory. Do not move or delete the project folder after symlinking — the binaries and Node scripts need to stay in place. If you move the project, remove the old symlink and re-run the `ln -s` command from the new location.

---

## Usage

### Pipe HTML directly

```bash
echo '<div class="p-4 bg-red-500 text-white rounded-lg">Hello</div>' | tw2html
```

### Transform a file

```bash
tw2html < email-template.html > email-ready.html
```

### Compose with other tools

```bash
cat template.html | tw2html | mail -s "Newsletter" recipient@example.com
```

---

## Project structure

```
tw2html/
├── cmd/
│   ├── extract/        Go binary — extracts class names from HTML
│   │   └── main.go
│   └── inline/         Go binary — inlines resolved styles into HTML
│       └── main.go
├── js/
│   ├── build-ir.js     Node — generates CSS via Tailwind v4 PostCSS
│   ├── extract-ir.js   Node — resolves variables and builds IR JSON
│   ├── input.css       Tailwind entry point (@import "tailwindcss")
│   └── package.json
├── bin/                compiled Go binaries (after make build)
├── inline.sh           orchestration script / entry point
└── Makefile
```

---

## Makefile targets

```bash
make          # install deps + build binaries (default)
make deps     # npm install + go mod tidy
make build    # compile Go binaries only
make clean    # remove bin/, node_modules, out.css
```

---

## Limitations

- **Tailwind v4 only.** The `@source` directive used to drive class scanning is a v4 feature.
- **Static classes only.** Dynamically constructed class names (e.g. `` `bg-${color}-500` ``) are not scanned — they won't appear in the output.
- **Pseudo-class variants are stripped.** `hover:bg-red-500`, `focus:ring-2` etc. have no meaning in email and are dropped.
- **`transition-*` and `animation` properties** are inlined as-is but ignored by most email clients.
- **Requires Node at runtime.** Tailwind's CSS generation happens via Node on every invocation. For high-volume use, consider pre-building an IR cache for a known set of classes.
