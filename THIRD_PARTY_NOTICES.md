# Third-party notices and references

## SMK · Aphrodite sculpture assets

The sculpture edition uses a cropped/normalized 3D scan of SMK's plaster cast of Venus de Milo (KAS434), with new marble shading, original golden apple, display plinth and UI props. Source: https://open.smk.dk/artwork/image/KAS434 . The museum API record reports `public_domain: true` and Public Domain Mark 1.0 (https://creativecommons.org/publicdomain/mark/1.0/). Metadata snapshot, download URL, hash, changes and limitations are preserved in `assets/aphrodite-sculpture/README.md` and `source/smk-metadata.json`. This is not a scan of the Louvre original, a wholly original sculpture, or a museum-endorsed product. Museum guidance: https://www.smk.dk/en/article/3d-models/ .

## oh-my-design

Selected Karrot/Toss color observations and the structure of the DESIGN.md export were informed by the local oh-my-design repository, read on 2026-09-08. The prototype does not ship the full catalog, claim official brand components, or claim full OmD validation.

MIT License

Copyright (c) 2026 oh-my-design

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## OpenDesign

https://github.com/nexu-io/open-design — workflow reference, inspected 2026-09-08. The repository identifies Apache-2.0 licensing. No OpenDesign source code was copied or vendored into this prototype.

## Photography

Bundled reference images were retrieved from Unsplash's image CDN:

- `public/assets/interior.jpg`: https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1400&q=85&fit=crop
- `public/assets/chair.jpg`: https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&q=85&fit=crop
- `public/assets/living.jpg`: https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=600&q=85&fit=crop

License reference: https://unsplash.com/license . Used as prototype reference photography. Photographer attribution and depicted-property release metadata were not verified. Review these before a commercial publication. No stock image is represented as a user-owned, Blender-created or AI-generated asset. Uploaded images remain the user's responsibility.

## Runtime dependencies

`public/assets/demo-reference.jpg` is a resized JPEG of this prototype's actual rendered Form & Field page, including the stock photos above. It is a demo screenshot, not a generated design or an external brand screenshot. Crops retain the underlying photo rights caveats. Apple Vision OCR runs using the installed macOS system framework; no OCR model weights or API credentials are bundled.

Tauri: MIT / Apache-2.0. Vite, TypeScript, fflate and lucide retain their upstream license files in installed packages; consult the locked dependency versions for distribution. App source is an independent prototype; this notice does not set a new project-wide license for the user's code.

## Bundled UI libraries (official-component previews and exported React source)

The catalog previews render official component libraries inside sandboxed iframes through a locally built runtime (`scripts/build-library-runtime.mjs` → `public/assets/library-runtime.js`), and the exported ZIP's `react-source/package.json` lists the same packages. Licenses as declared by the installed packages (2026-09-10):

| Package | License |
| --- | --- |
| `@seed-design/react`, `@seed-design/css` (Daangn SEED Design) | Apache-2.0 — see NOTICE below |
| `@astryxdesign/core`, `@astryxdesign/theme-neutral` | Apache-2.0 — see NOTICE below |
| `@mui/material`, `@emotion/react`, `@emotion/styled` | MIT |
| `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@stylexjs/stylex` | MIT |
| `react`, `react-dom`, `fflate` | MIT |
| `lucide` (icons) | ISC |
| `tailwindcss` (build-time only) | MIT |

Apache License 2.0 §4 requires redistributions to carry the license text and the attribution notices below. Brand assets (logos, names, characters) of Daangn (당근마켓) or any other library vendor are not used to identify Aphrodite, and Aphrodite is not affiliated with, sponsored by, or endorsed by those companies. Component presets named "Karrot inspired" or "Toss inspired" are Aphrodite's own color/typography approximations, not the official design systems.

### NOTICE — SEED Design (`@seed-design/*`)

```
SEED Design
Copyright 2025 주식회사 당근마켓

이 소프트웨어는 Apache License 2.0에 따라 배포되며, 상업적 목적을 포함하여 자유롭게 사용, 수정, 재배포할 수 있습니다.
재배포할 때에는 Apache License 2.0 제4조에 따라 라이선스 사본을 제공하고 이 파일에 담긴 귀속 고지를 전달해야 합니다.
브랜드 리소스(로고, 상호명, 캐릭터 등)는 당근마켓의 자산이며 상표법의 보호를 받습니다. 사전 협의 없는 상업적 사용 및 당근마켓을 사칭하거나 제휴·후원·보증 관계로 오인하게 하는 사용은 허용되지 않습니다.
[당근마켓 브랜드 리소스 가이드라인]: https://app.notion.com/p/daangn/6fdd92981e4a42d8b29c89cbbba7a8b7
```

### NOTICE — Astryx Design (`@astryxdesign/*`)

The installed `@astryxdesign/core` 0.5.4 and `@astryxdesign/theme-neutral` 0.5.4 packages declare `Apache-2.0` in `package.json` but ship no `NOTICE` file (checked 2026-09-10). Their `LICENSE` text accompanies the locked dependency set; re-check for a NOTICE file when upgrading.

The full Apache License 2.0 text is available at https://www.apache.org/licenses/LICENSE-2.0 and inside each package's `LICENSE` file.
