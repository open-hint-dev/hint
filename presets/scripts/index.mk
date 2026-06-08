PRESET_SCRIPTS_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
MONOREPO_ROOT ?= $(abspath $(PRESET_SCRIPTS_DIR)/../..)
PACKAGE_DIR ?= $(CURDIR)
PACKAGE_JSON ?= $(PACKAGE_DIR)/package.json
PACKAGE_MANAGER ?= yarn
RELEASE_ROOT ?= $(MONOREPO_ROOT)/release
PACKAGE_NAME ?= $(shell node -e 'const fs = require("node:fs"); const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (typeof manifest.name !== "string" || manifest.name.trim() === "") throw new Error("package.json must contain a non-empty string name"); process.stdout.write(manifest.name);' "$(PACKAGE_JSON)")

ifeq ($(strip $(PACKAGE_NAME)),)
$(error Unable to read a non-empty package name from "$(PACKAGE_JSON)")
endif

RELEASE_DIR ?= $(RELEASE_ROOT)/$(PACKAGE_NAME)

include $(PRESET_SCRIPTS_DIR)/build.mk
include $(PRESET_SCRIPTS_DIR)/test.mk
include $(PRESET_SCRIPTS_DIR)/release.mk

.DEFAULT_GOAL :=
