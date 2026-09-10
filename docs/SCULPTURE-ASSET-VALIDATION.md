# Sculpture asset validation — 2026-09-09

## Scope completed

Approved marble Aphrodite + golden apple direction translated into an editable Blender scene and portable GLB, eight static transparent state renders, sprite atlas and manifest. Brand kit now displays these real renders instead of the older Pearl mascot. No stored project data, DS tokens or review status was changed.

Blender MCP was not connected. Local Blender 5.1.2 background execution was used instead; no credentials, model generation service or third-party paid credits were used. Shadow Git snapshot before edits: `21879bbc958ec711ff4e7ffb8d885fa3b1bca05c` (separate shadow repository, not a user git commit).

## Iteration and evidence

1. Imported and validated the museum STL: 137,087 vertices, approximately 13 MB; source retained unchanged.
2. Four 384px angle renders established scan orientation. First crop was too torso-heavy for UI use.
3. Recropped above the chest, recentered the bust, preserved carved face/hair. This is an editorial cropped scan, not the generated concept's hand-held-apple statue.
4. Rendered eight 512px RGBA states and 1200px hero in Cycles. Same camera, framing, baseline and body geometry across states.
5. Real UI review found welcome/Get Vibe too similar. Added a gold orbit and sparkle to Get Vibe, rerendered.
6. Exported GLB: glTF 2, 847,124 bytes, 6 meshes, 46,452 triangles, one apple transform animation, no external URI dependencies. Blender procedural bump is not included in portable PBR appearance.
7. Motion preview: 60 Blender-rendered frames at 30fps, 2 seconds. Slight camera movement plus animated apple; no facial rig or full statue pose animation.
8. Unit suite: 38 tests passed, including sprite dimensions, RGBA encoding, manifest coordinate mapping and escaped accessible state labels. Web production build passed, with existing large JS chunk warning.
9. In-app browser: started dev server on 127.0.0.1:1421, opened Choose design system → Aphrodite brand kit, inspected hero and all eight labelled states. Original six-page Moa project was present and preserved. This is browser UI verification, not a rebuilt native app verification.

## Remaining release gates

- Refine scan eyelids, lips, hair and cropped edge to match the aspirational premium reference; current set is v1, not final sculpt quality.
- Welcome and Get Vibe differ through props, not facial acting. Review status always needs text. Check state recognition with users, not only a visual inspection.
- Create small apple-only icons; these detailed busts are for onboarding/brand/empty-state surfaces, not 24px toolbar controls.
- Bake marble texture for GLB parity, validate target real-time renderer and memory, then consider LODs.
- Live state dispatch, native onboarding and optional reduced-motion-aware playback are not integrated. Current gallery is static by design.
- Rebuild/sign/notarize/distribute and verify a fresh native installation separately. No claim that downloading the assets validates desktop installation.

## Reproduction

See `assets/aphrodite-sculpture/README.md`. Build script recreates geometry and renders; package script builds atlas/video and copies durable source models. Do not cycle state atlas cells as animation frames.
