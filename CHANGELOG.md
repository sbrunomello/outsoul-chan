# Changelog

## Unreleased

- Replaced install-time sample post behavior with safety-verified comment and post triggers.
- Added invocation, conservative spontaneous-candidate, response-contract, cooldown, deduplication, and daily-limit logic.
- Added Gemini REST integration, safe fallback, subreddit settings, and a global secret declaration.
- Generated and visually reviewed the complete 32-image library (4 unique images for each of 8 emotions), with a manifest, hashes, contact sheet, and technical reaction image QA.
- Added implementation and playtest documentation.

## Known incomplete work

- Reddit-hosted media URLs require the moderator sync action on the configured playtest subreddit.
- No playtest has been run; the exact test community is not configured.
- Native Devvit media rendering and live Gemini behavior are unverified.
