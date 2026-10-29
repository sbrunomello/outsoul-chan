# Image generation

## Pilot

The first pilot was generated with ImageGen from five local character references. It contains four original panels for joy, anger, dramatic sadness, and shock. The contact sheet is retained at tools/outsoul-pilot-contact.png; independent assets are stored in public/reactions/.

Prompt used:

> Create a 2 by 2 contact sheet on a fully transparent background with four separate polished anime reaction illustrations of the same original fictional adult woman, Outsoul-chan. Keep her petite but clearly adult, with a rounded face, lilac layered hair, magenta eyes, a black broken-heart clip, oversized black goth-kawaii jacket, violet/pink accents, and heart jewelry. No text, watermark, borders, background, or copied reference composition. The panels show joyful cute chibi, angry comedic manga, dramatic crying, and surprised shock, each with a distinct pose and framing.

## Generate additional sets

1. Generate one transparent 2 by 2 sheet for one emotion at a time.
2. Use python tools/split_reaction_sheet.py SHEET EMOTION public/reactions to create four separate 640px RGBA PNGs.
3. Review each image at full resolution and in a small contact sheet; automated file checks do not approve anatomy or character identity.
4. Add metadata to src/shared/reactions/manifest.json. Set approved only after visual review.
5. Run python tools/qa_reactions.py.

## Emotion set prompt records

Each following 2x2 generation used the same invariant character description from CHARACTER_DESIGN.md and requested real alpha transparency, no lettering/watermark, and four distinct poses/crops.

- **Joy:** closed-eye smile, chibi skipping, thumbs-up grin, bashful heart charm.
- **Anger:** pointing, dramatic fist, arms-crossed full-body, annoyed side-eye.
- **Dramatic sadness:** tearful close-up, sleeve wiping a tear, melodramatic floor pose, chibi crying.
- **Fear/shock:** frozen wide-eyed close-up, leaning back, startled chibi jump, surprised side glance.
- **Embarrassment:** flushed eyes averted, hand behind head, chibi behind collar, awkward peace sign. The first prompt attempt was blocked and produced no image; the successful prompt explicitly required a fully buttoned jacket and high-neck coverage.
- **Bored/judgment:** tired cheek-rest, skeptical crossed arms, slouched phone glance, unimpressed manga close-up.
- **Mockery/laughter:** hand-over-mouth laugh, shoulders shaking, cheeky pointing grin, chibi wheezing with happy tears.
- **Confidence/sigma:** low-angle chin-rest, relaxed thumbs-up, dramatic hero pose, overconfident chibi stance.

These categories are derived from the prompts used for the final image sheets. The initial mixed pilot sheet remains at tools/outsoul-pilot-contact.png; the eight category sheets remain in tools/ as generation provenance.
