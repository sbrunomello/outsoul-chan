# Visual QA

## Technical checks

Run python tools/qa_reactions.py. It checks PNG integrity, RGBA mode, alpha transparency, minimum size, file size, hash integrity, duplicate IDs/files, exactly four entries per emotion, and perceptual near-duplicates. It also writes tools/reaction-contact-sheet.png.

## Art review

Inspect each image individually for anatomy, face/eye alignment, hair and clothing continuity, the broken-heart clip, cut-off composition, artifacts, pseudo-text, and legibility at comment size. The contact sheet is a review aid only and is not an app asset.

## Current result

All 32 final catalog images passed a visual review of identity, expression, pose, and panel isolation. Their technical PNG checks pass. Review detected neighboring-panel slivers in an early crop pass; all 32 files were re-split with an inner margin and detached edge-fragment cleanup before approval. This review does not validate live Reddit hosting or native comment rendering.
