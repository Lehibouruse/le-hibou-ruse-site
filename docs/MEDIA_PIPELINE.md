# Le Hibou Rusé — Media Pipeline v2

## Goal
Produce vertical finance videos as a controllable pipeline rather than a one-shot AI video generation.

## Core rule
One spoken idea = one visual idea. Storytelling visual > mascot > decoration > text.

## Airtable cockpit
- Content Pipeline: parent video, script, validation, master.
- Profils vidéo: immutable production style/config. Default: HIBOU_VIRAL_V1.
- Scènes vidéo: one record per shot, including narration, visual concept, prompt, candidates, QC score, selected path, timing and zoom.
- Jobs: CREATE_VIDEO and REGENERATE_SCENE are the control queue.
- Social Performance: feedback loop after publication.

## Production sequence
1. Plan 15–25 scenes, typically 1.5–2.5 seconds each.
2. Save the scene plan before image generation.
3. Generate 2–3 independent image candidates per scene using a shared style lock.
4. Score each candidate with vision QC; retain only candidates above the profile threshold.
5. Regenerate weak scenes only, max two automatic retries by default.
6. Generate one natural French voice track.
7. Assemble selected stills with hard cuts and stable 2–4% Ken Burns zoom. No random movement.
8. Master defaults to no commercial music. Dynasty is only mixed when an authorized audio file is supplied; otherwise keep music cues for platform-library addition.
9. Technical QC, tests/build, then push media only to a hibou-review branch.
10. Human review remains mandatory before any public publishing.

## Vercel discipline
Media draft branches are always hibou-review/* and are excluded from Vercel deployments. Main now has an ignoreCommand so media-only, workflow-only and worker-only commits do not create needless Vercel builds. Changes under app/components/public or production config still deploy normally.

## Character lock
When the owl is useful: same face, yellow eyes, gold monocle, black tuxedo, tall slim full-body silhouette, black shoes, intelligent slightly mischievous expression. The owl is not a filler shot.

## Regenerating one scene
Create a REGENERATE_SCENE Job with the target scene record ID in parameters. The worker must only generate and QC candidates for that scene, update its Airtable row, and stop for human review.

## Safety
No social publishing is triggered by the media worker. social_prepare is dry-run only. No secret is stored in Airtable.


## ChatGPT control channel
A dedicated GitHub Actions workflow can be woken from the persistent GitHub issue **HIBOU MEDIA CONTROL**. A comment beginning with `/wake-media` runs the bounded worker with an allowlist restricted to `CREATE_VIDEO` and `REGENERATE_SCENE`.

This makes the chat control loop deterministic:
1. ChatGPT writes/updates the Content Pipeline record.
2. ChatGPT creates a bounded Job in Airtable.
3. ChatGPT posts `/wake-media` to the control issue.
4. GitHub Actions claims only a media Job, renders outside Vercel deployment branches, and writes progress back to Airtable.
5. ChatGPT can inspect scenes/QC and request one-scene regeneration without rerendering the whole creative plan.

The media control wake never processes commerce, book delivery, site updates, or social publishing.
