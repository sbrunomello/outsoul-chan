# Privacy notice — Outsoul-chan

Last updated: 2026-10-28

Outsoul-chan is an experimental Reddit app used in communities where moderators install it. This notice describes the data handled by the app when it processes a post or comment.

## Information processed

When the app considers a reply, it receives Reddit event data such as the post or comment text, the post and comment identifiers, the community name, and the author's Reddit username/account type. For direct replies, it may also read a limited number of parent comments to understand the conversation. The app can read the post title, body, and Reddit-hosted image URLs when visual understanding is enabled.

If Gemini is enabled, the relevant prompt and conversation context are sent to Google's Gemini API. For image posts, the post title, relevant text/context, and up to four retrieved Reddit-hosted images are sent for visual analysis. Google processes requests under the terms and data handling rules for the API account configured by the app operator. Those rules can depend on the account's billing and service tier; users should avoid putting private or sensitive information in public Reddit posts or comments.

## Storage and retention

The app uses the installation's Devvit Redis storage for short-lived operational data: duplicate-event identifiers (up to 24 hours), reply counters/cooldowns (up to 48 hours), recent reply context (bounded and temporary), and a structured image-scene/reply result cache (six hours). It does not store downloaded image bytes in Redis. Reddit posts and comments published by the app remain subject to Reddit's own storage, visibility, and deletion controls.

Operational logs may include Reddit event identifiers, community name, decision reason, model name, latency, token counts when supplied by Gemini, and reply length. The app does not intentionally log full post/comment bodies or the Gemini API key. Reddit/Devvit may retain platform logs according to its own policies.

## Choices and contact

Community moderators control whether the app is installed and which interaction modes are enabled. Users can choose not to address the bot; public Reddit content remains governed by Reddit's privacy policy and the community's rules. For questions about this app's data handling, contact the moderators of [r/japan_outsoul](https://www.reddit.com/r/japan_outsoul/).

This notice covers the Outsoul-chan Devvit app only. Google's and Reddit's own privacy notices also apply to their services.
