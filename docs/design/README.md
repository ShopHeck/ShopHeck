# Design directions

Three proposed directions for the app's visual system and dashboard IA, each
presented as working dashboard / round timer / weight screens alongside a
faithful recreation of the shipping build.

Open `preview.html` in a browser. Nothing to install; the page is self-contained.

| | Direction | Idea | Colour strategy |
|---|---|---|---|
| 00 | What ships today | Baseline for comparison | Stock Tailwind orange, seven ad-hoc accents |
| 01 | Tale of the Tape | The app as the official record of your camp | Full palette, editorial: manila, ink, one stamp |
| 02 | Instrument | A readout, not a feed | Restrained: tinted graphite, brass under 10% |
| 03 | Corner | Sixty seconds on the stool | Committed: the surface colour is the state |

Direction 03 is the only one that changes the information architecture (six tabs
to four, ten dashboard sections to four). The other two are visual systems that
sit on top of the current structure.

## Rebuilding

`preview.html` is generated. Edit `preview.src.html`, then:

```sh
npm install          # needs @fontsource/inter for the inlined faces
node docs/design/build-preview.mjs
```

The build step exists because the page is meant to survive being copied
anywhere, including hosts that block external font requests, so Inter ships
inside the document as base64 `woff2` rather than as a CDN link. Everything
else in the page is hand-written HTML and CSS with no dependencies.
