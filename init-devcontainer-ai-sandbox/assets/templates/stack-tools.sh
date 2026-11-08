#!/usr/bin/env bash
# Stack tooling for {{PROJECT_NAME}} inside the AI sandbox image.
# Runs as root during the image build. Keep it idempotent and non-interactive.
set -eux

{{STACK_TOOLS}}
