package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"

	"golang.org/x/net/html"
)

func extractClasses(r io.Reader) []string {
	doc, _ := html.Parse(r)

	seen := map[string]bool{}
	var out []string

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for _, a := range n.Attr {
				if a.Key == "class" {
					for _, c := range strings.Fields(a.Val) {
						if !seen[c] {
							seen[c] = true
							out = append(out, c)
						}
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}

	walk(doc)
	return out
}

func main() {
	var buf bytes.Buffer
	io.Copy(&buf, os.Stdin)

	classes := extractClasses(&buf)

	enc := json.NewEncoder(os.Stdout)
	enc.Encode(classes)
}
