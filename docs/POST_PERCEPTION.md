# Multimodal post perception

`PostPerceptionService` is the static-image and gallery boundary for post understanding. `PostCreate`/`CommentCreate` event metadata identifies likely media. For direct invocation comments, the server also hydrates the parent post by ID because the comment event may omit its `post` snapshot; it reads the official Devvit `Post.gallery` list and falls back to ordered `galleryImages`/`mediaUrls` from the event. It downloads the image bytes and sends them to Gemini together with the post title, body, and relevant invocation context.

Gemini returns a validated structure containing directly visible observations, apparent actions, humor elements, uncertain interpretations, confidence, a short scene summary, and the response/reaction decision. The scene and decision come from the same multimodal request; the prompt requires the model to establish the scene first and ground the decision in that scene. If the bytes cannot be retrieved or validated, the service returns no visual decision. The text and metadata are never represented as a completed visual analysis.

## Limits and failure behavior

- Maximum four images per post, retaining gallery order.
- PNG, JPEG, and WebP signatures are accepted. GIF and video bytes are intentionally not decoded by this first version.
- Each image is limited to 2.5 MB; each gallery to 10 MB.
- Images over 8,192 pixels on either edge or over 12 megapixels are rejected.
- Devvit post lookup timeout is 2 seconds; image download timeout is 3.5 seconds per request; Gemini timeout is 8 seconds.
- Gemini retries one time for network errors, HTTP 408, 429, or 5xx with a short jittered delay; billing and request errors such as 402/404 are not retried.
- Redirects are followed at most twice and each target must remain HTTPS on an approved media hostname.
- Successful structured analyses are cached by post ID for six hours. Redis stores the scene and decision, not image bytes.
- A failed image, unsupported format, unsafe host, oversized payload, or invalid model response fails closed for visual posts.
- Gemini error logs include the HTTP status, provider status, and a short sanitized provider message to distinguish billing, model, and service errors. They never include the API key or prompt/image payload.

`devvit.json` requests HTTP access for Gemini and the Reddit image hosts `i.redd.it`, `preview.redd.it`, `external-preview.redd.it`, `i.redditmedia.com`, and `preview.redditmedia.com`. Devvit's domain review is still controlled by Reddit; local manifest validation and a successful app upload do not prove that each runtime fetch host was approved or reachable.

## Animated media extension

`AnimatedMediaFrameAnalyzer` defines a future boundary for GIF and video analysis. It returns ordered frames with frame indexes and timestamps. No frame extraction is implemented yet, and animated media is not passed to the static-image analyzer.

## Simulated coverage

`src/server/core/post-perception.test.ts` uses synthetic PNG, JPEG, and WebP byte headers and mocked Reddit fetch/model boundaries. It verifies that changing the image bytes changes the scene and response even when the title is only `💀`, gallery order is preserved, cache hits avoid re-fetching, supported formats are recognized, and missing or unsafe images do not produce a visual claim. This does not replace an authenticated Reddit media fetch or a live Gemini test.
