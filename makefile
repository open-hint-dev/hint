ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

PACKAGE_MANAGER ?= yarn
TURBO_COMMAND   ?= $(PACKAGE_MANAGER) turbo
TURBO_ARGS      ?=
INSTALL_ARGS    ?= --immutable
CLEAN_COMMAND   ?= rm -rf
CLEAN_PATHS     ?= .turbo coverage release

SHELL := /bin/sh

.DEFAULT_GOAL := help

.PHONY: help install check test coverage lint fix refresh refresh-react release clean

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  install        install the locked workspace dependencies"
	@echo "  check          run lint and tests"
	@echo "  test           run package tests"
	@echo "  coverage       run package tests with coverage"
	@echo "  lint           check package lint rules"
	@echo "  fix            apply package ESLint fixes"
	@echo "  refresh        format and fix packages"
	@echo "  refresh-react  run React-specific refresh tasks"
	@echo "  release        publish eligible packages through their package release targets"
	@echo "  clean          remove root-generated caches and release artifacts"

install:
	cd "$(ROOT_DIR)" && $(PACKAGE_MANAGER) install $(INSTALL_ARGS)

test:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) test $(TURBO_ARGS)

coverage:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) coverage $(TURBO_ARGS)

lint:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) lint $(TURBO_ARGS)

fix:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) fix $(TURBO_ARGS)

refresh:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) refresh $(TURBO_ARGS)

refresh-react:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) refresh-react $(TURBO_ARGS)

check:
	$(MAKE) lint
	$(MAKE) test

release:
	cd "$(ROOT_DIR)" && $(TURBO_COMMAND) release --force $(TURBO_ARGS)

clean:
	@if [ -z "$(CLEAN_PATHS)" ]; then \
		echo "error: CLEAN_PATHS is empty" >&2; exit 1; \
	fi
	@for p in $(CLEAN_PATHS); do \
		case "$$p" in \
			/*|/) \
				echo "error: refusing absolute path: $$p" >&2; exit 1;; \
			.|..) \
				echo "error: refusing unsafe path: $$p" >&2; exit 1;; \
			../*|*/../*|*/..) \
				echo "error: refusing path with .. segment: $$p" >&2; exit 1;; \
		esac; \
	done
	@for p in $(CLEAN_PATHS); do \
		$(CLEAN_COMMAND) "$(ROOT_DIR)$$p"; \
	done
