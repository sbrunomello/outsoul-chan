# Outsoul-chan

Devvit Web app for an experimental Reddit mascot. The server handles verified Reddit triggers, rate limits, safe Gemini responses, and moderator-gated reaction media provisioning.

## Architecture

- src/shared/outsoul.ts: response contract, interaction modes, candidate filter, fallback, and reaction selection rules.
- src/server/core/: Gemini REST adapter, character prompt, trigger policy, and cached Reddit media selection.
- src/server/core/post-perception.ts: ordered Reddit image/gallery retrieval, image limits, six-hour scene cache, and structured Gemini multimodal decisions.
- src/server/routes/triggers.ts: safety-verified onCommentCreate and onPostCreate handlers.
- src/server/routes/api.ts: moderator-only media provisioning for approved PNGs.
- public/reactions/: 32 separate transparent PNG reaction assets.
- src/shared/reactions/manifest.json: emotion, style, intensity, approval, and SHA-256 catalog.
- src/client/: concise Outsoul-chan intro and explicit moderator action to sync assets to Reddit.

## Safe behavior

Defaults are INVOCATION_ONLY, dryRun=true, spontaneous replies disabled, and no authorized subreddit configured. A trigger is ignored unless its subreddit exactly matches allowedSubreddit. For the current playtest, set this to `japan_outsoul` in that installation's subreddit settings. No Gemini key is included in the repo.

Text-only Gemini requests receive a limited 5,000-character excerpt; visual post requests include up to four verified PNG/JPEG/WebP images (10 MB total) with title and body. Gemini returns validated visual observations, uncertain interpretations, a scene summary, and the contextual decision. If image retrieval or validation fails, the visual path sends no reply and makes no image-analysis claim. Analyses are cached by post ID for six hours. Replies are capped per user/day, spontaneous replies per day, and by a user cooldown.

## Fetch Domains

The server requests these exact HTTPS hosts:

- `generativelanguage.googleapis.com` — send bounded text and image bytes to Gemini for the response and structured scene analysis.
- `i.redd.it` — retrieve the original bytes of Reddit-hosted image posts.
- `preview.redd.it` — retrieve ordered gallery image bytes returned by Reddit's post metadata.
- `external-preview.redd.it` — retrieve Reddit-generated preview images for eligible image links.
- `i.redditmedia.com` and `preview.redditmedia.com` — retrieve legacy Reddit-hosted image variants where returned by the post media API.

Reddit reviews requested fetch domains on upload/playtest. A successful upload does not confirm runtime approval or network access; the approved list is visible in the app's Developer Settings.

## Install and validate

The checkout uses Devvit 0.15.1, Vite 8, React 19, and Node 24.17 in this environment.

See [docs/POST_PERCEPTION.md](docs/POST_PERCEPTION.md) for media domain requests, size/resolution limits, GIF/video extension boundary, and multimodal test coverage.

~~~powershell
npm install
npm run type-check
npm run lint
npm test
npm run build
~~~

## Configure a private playtest

1. The authorized playtest is `r/japan_outsoul`; latest successful playtest version was `v0.0.1.27`.
2. Set the exact test community in that installation's subreddit settings under allowedSubreddit (`japan_outsoul`).
3. Keep dryRun enabled for simulated events.
4. Set a Gemini secret only if needed with npx devvit settings set geminiApiKey.
5. A moderator uses the Open Outsoul-chan setup menu item, then opens the setup post and selects Sincronizar reações. The server checks the configured subreddit, moderator role, approval flag, and image SHA-256 before uploading; Reddit-hosted media IDs/URLs are cached in Redis.
6. Verify logs and test directly before turning off dry run. Keep spontaneous replies disabled while the direct path is under review.

## Visual library

Install local asset tooling with pip install -r requirements-assets.txt. Run python tools/qa_reactions.py to validate all manifest PNGs and rebuild tools/reaction-contact-sheet.png. Asset generation, transparent-panel splitting, and visual review notes are in docs/IMAGE_GENERATION.md and docs/VISUAL_QA.md.

## Commands

~~~powershell
npm run dev
npm run build
npx devvit playtest
npx devvit settings list
npx devvit settings set geminiApiKey
~~~

The prior development installation was `v0.0.1.7` in `r/outsoul_chan_dev`. The current authorized playtest target is `r/japan_outsoul`.
