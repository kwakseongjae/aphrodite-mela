# Bringing HTML onto a board

The engine turns HTML into an ordinary free page when the person presses an import control. The screen wiring comes later. An OS open event can supply an input, but only the person's press can record a change. Finder's HTML association waits for that screen.

A paste or a desktop drop brings the HTML alone. Siblings come only through the desktop open panel. Native drops stay disabled. Before wiring native drops, test Tauri's asset scope before the drop, after the drop and after grant expiry. Tauri otherwise extends that scope to dropped paths independently of the grant.

## What comes along

A folder contributes its top-level HTML and HTM documents in filename order. The title names each page, followed by its filename or the numbered default. A numeric viewport width uses the ordinary 240–3,200 pixel range. Other viewports use the 1,440 pixel desktop preset. A byte-order mark takes precedence over an HTML meta charset. A UTF-16 meta label without a BOM means UTF-8. Undecodable bytes become replacement characters.

The panel gives the shell a five-minute grant pinned to an open directory. A handed-over symlink is refused. References can reach visible files inside that directory and its subfolders. Hidden components, absolute paths, file URLs and escaping links are refused. Absolute symlinks need the same spelling of the granted root. Remote references stay in the source and are counted. Importing makes no network requests.

- Images, posters, audio and video sources, valid srcset and image-set candidates, and CSS URLs can bring PNG, JPEG, GIF, WebP, MP4, WebM, Ogg, WAV, MP3, WOFF, WOFF2, TTF and OTF files. The board stores their bytes by SHA-256. Pages use its ordinary media references. Fonts reach frames through typed data URLs, up to 8 MiB. The desktop asset scope excludes fonts. MP3s retain their audio type and export extension. Their internal filename gives Tauri a binary fallback for supported headers it cannot identify.
- Enabled, non-alternate CSS stylesheets can be inlined. Only leading, top-level imports are followed. The engine keeps cascade conditions, decodes a sheet before wrapping it and leaves scoped namespaces in their sheet. A parse failure, an unsafe rewritten closing tag or a change of base for a skipped relative reference can keep a sheet external.
- Local JS, MJS and CJS files can be inlined as classic HTML scripts. Async, deferred, module, nomodule, integrity-protected and foreign-namespace scripts stay external. The inline element must reparse to the intended text and closing boundary. Scripts use the same frame wall as any free page.

## Limits and result

| Limit | Engine behavior |
| --- | --- |
| Folder scan | Examine up to 4,096 entries. A larger folder is refused with `folder_limit`. Keep the first 128 eligible document names in sort order and count the rest. |
| References | Follow up to 500 local references per page and up to 32 leading imports per sheet, to three further levels. Each stylesheet name is read at most once per import. |
| Bytes | Allow up to 6,000,000 bytes per text file and 2,000,000 UTF-16 units per page. An import can read 128 MiB including media and copy 100 MiB of media. Rust checks the held file's size before reading or copying and also applies these aggregate ceilings to the grant. |
| Diagnostics | Retain up to 128 reference issues and 128 document issues. Overflow counts include omitted document names. Each retained issue has a name and a reason code. |
| Board and library | Up to 30 items including the starter. The final change checks the live board after pending typing is saved, including the ordinary project budget, library capacity and history reserve. |

The result names the pages and siblings actually brought, gives the count and original bytes of distinct sibling contents, and counts remote references. Unaccepted copies are released from private upload storage. A sibling whose real bytes the person supplies can go out with a previously received board again. A pasted hash leaves its existing export restriction intact. One undo removes the imported pages and their media references together. Published bytes remain available for redo and for other boards.
