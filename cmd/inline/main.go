package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/net/html"
)

type Decl struct {
	Prop  string `json:"prop"`
	Value string `json:"value"`
}

type IR map[string][]Decl

func loadIR(path string) IR {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading IR file %q: %v\n", path, err)
		os.Exit(1)
	}
	var ir IR
	if err := json.Unmarshal(data, &ir); err != nil {
		fmt.Fprintf(os.Stderr, "error parsing IR JSON: %v\n", err)
		os.Exit(1)
	}
	return ir
}

type prop struct{ key, val string }

func expandLogical(p, v string) []prop {
	switch p {
	case "margin-inline":
		return []prop{{"margin-left", v}, {"margin-right", v}}
	case "margin-block":
		return []prop{{"margin-top", v}, {"margin-bottom", v}}
	case "padding-inline":
		return []prop{{"padding-left", v}, {"padding-right", v}}
	case "padding-block":
		return []prop{{"padding-top", v}, {"padding-bottom", v}}
	case "inset-inline":
		return []prop{{"left", v}, {"right", v}}
	case "inset-block":
		return []prop{{"top", v}, {"bottom", v}}
	case "border-inline-width":
		return []prop{{"border-left-width", v}, {"border-right-width", v}}
	case "border-block-width":
		return []prop{{"border-top-width", v}, {"border-bottom-width", v}}
	}
	return []prop{{p, v}}
}

func resolveClasses(ir IR, classes []string) string {
	type entry struct{ key, val string }
	order := []entry{}
	index := map[string]int{}

	for _, cls := range classes {
		decls, ok := ir[cls]
		if !ok {
			continue
		}
		for _, d := range decls {
			for _, ex := range expandLogical(d.Prop, d.Value) {
				if idx, exists := index[ex.key]; exists {
					order[idx].val = ex.val
				} else {
					index[ex.key] = len(order)
					order = append(order, entry{ex.key, ex.val})
				}
			}
		}
	}

	parts := make([]string, len(order))
	for i, e := range order {
		parts[i] = e.key + ":" + e.val
	}
	return strings.Join(parts, ";")
}

func processNode(ir IR, n *html.Node) {
	if n.Type == html.ElementNode {
		var classVal string
		var hasClass bool

		for _, a := range n.Attr {
			if a.Key == "class" {
				classVal = a.Val
				hasClass = true
				break
			}
		}

		if hasClass {
			allClasses := strings.Fields(classVal)
			var twClasses, unknownClasses []string

			for _, c := range allClasses {
				if _, ok := ir[c]; ok {
					twClasses = append(twClasses, c)
				} else {
					unknownClasses = append(unknownClasses, c)
				}
			}

			inlined := resolveClasses(ir, twClasses)
			var newAttrs []html.Attribute
			styleExists := false

			for _, a := range n.Attr {
				switch a.Key {
				case "class":
					continue
				case "style":
					if inlined != "" {
						a.Val = inlined + ";" + a.Val
					}
					styleExists = true
					newAttrs = append(newAttrs, a)
				default:
					newAttrs = append(newAttrs, a)
				}
			}

			if !styleExists && inlined != "" {
				newAttrs = append(newAttrs, html.Attribute{Key: "style", Val: inlined})
			}
			if len(unknownClasses) > 0 {
				newAttrs = append(newAttrs, html.Attribute{
					Key:   "class",
					Val:   strings.Join(unknownClasses, " "),
				})
			}
			n.Attr = newAttrs
		}
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		processNode(ir, c)
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: inline <path-to-tailwind-ir.json>")
		os.Exit(1)
	}

	ir := loadIR(os.Args[1])

	var buf bytes.Buffer
	io.Copy(&buf, os.Stdin)

	doc, err := html.Parse(&buf)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error parsing HTML: %v\n", err)
		os.Exit(1)
	}

	processNode(ir, doc)
	html.Render(os.Stdout, doc)
}
