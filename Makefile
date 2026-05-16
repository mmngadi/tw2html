.PHONY: all build deps clean

all: deps build

deps:
	cd js && npm install
	go mod tidy

build:
	mkdir -p bin
	go build -o bin/extract ./cmd/extract
	go build -o bin/inline ./cmd/inline
	chmod +x inline.sh

clean:
	rm -rf bin js/node_modules js/out.css
