# User Guide — {{PROJECT_NAME}}

## What it is

{{PRODUCT_SUMMARY}}

## How to use it

{{USAGE_GUIDE}}

## Configuration

{{CONFIGURATION}}

<!-- skill:block:userguide-currency -->
## Keeping this guide current

This guide describes the product as it behaves today. It is a living document: it is
updated in the same change as the behaviour it describes.

- A user-visible change updates the section it affects — what the product is, how it is
  used, or which options exist.
- A new, renamed, or removed configuration option is added, renamed, or removed here in
  the same commit, with its type, default, accepted values, and effect. An option that
  exists in the code and not in this guide is an undocumented feature; an option
  described here that the code no longer has is a stale instruction.
- `What it is` stays at most three lines. Details belong in the sections below.
- When the guide and the product disagree, fix the wrong one in the same change; never
  leave the contradiction in place.
- A change that alters what a user does or configures without updating this guide is
  incomplete, and review treats it as a defect.

This document is self-contained: it is distributed on its own, so it never links to the
repository's internal documentation.
<!-- skill:end:userguide-currency -->
