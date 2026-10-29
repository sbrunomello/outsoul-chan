# Playtest

## Safe defaults

The app starts in INVOCATION_ONLY with dryRun=true, spontaneous replies disabled, and no authorized subreddit configured. No automatic response is published until a moderator explicitly sets the exact test subreddit and disables dry run. The currently authorized playtest target is `r/japan_outsoul`.

## Current delivery status

The latest successful playtest upload to `r/japan_outsoul` ended with `Playtest ready` at `v0.0.1.27`.

Set `allowedSubreddit=japan_outsoul` in the `r/japan_outsoul` installation settings. The exact match is required to enable triggers in that community.

The multimodal implementation is locally tested with mocked image bytes and model responses. Its manifest requests the Reddit image hosts listed in `docs/POST_PERCEPTION.md`, and the CLI accepted the updated manifest in `v0.0.1.7`. This does not confirm that Reddit approved every host or that live media fetches succeed. Confirm those separately before turning off dry run.

## Preparation

1. The app is playtested in `r/japan_outsoul`.
2. Set allowedSubreddit to `japan_outsoul` in that installation's subreddit settings.
3. Leave dryRun enabled and create simulated invocations. Check structured logs without sending conversation text.
4. Set the global secret with npx devvit settings set geminiApiKey only when the test API key is ready.
5. Verify local build and tests.
6. After review, a moderator may disable dry run for the dedicated test community; keep spontaneous replies disabled until direct replies and limits are observed.

## Scenarios

Test !outsoul without/with a prompt, flirt, anime question, joke, praise, bot provocation, duplicate event, rate limit, missing Gemini key, malformed Gemini JSON, rejected image, and text-only fallback. Also confirm posts without a lightweight humor signal and posts containing sensitive topics are ignored.

## Commands

~~~powershell
npm install
npm run type-check
npm run lint
npm test
npm run build
npx devvit playtest
~~~

Playtest installation was delivered; trigger execution after the authorization fix, Gemini responses, Reddit media upload, and native comment rendering still require confirmation in Reddit.
