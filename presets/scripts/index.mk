CURRENT_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
ROOT_DIR := $(abspath $(CURRENT_DIR)../..)

include $(CURRENT_DIR)clean.mk
include $(CURRENT_DIR)coverage.mk
include $(CURRENT_DIR)fix.mk
include $(CURRENT_DIR)lint.mk
include $(CURRENT_DIR)publish.mk
include $(CURRENT_DIR)refresh.mk
include $(CURRENT_DIR)release.mk
include $(CURRENT_DIR)test.mk
