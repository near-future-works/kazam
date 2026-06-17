# Kazam

An open-source frame for building your own design tools, and assembling them into a stack that's entirely yours.

Kazam gives a home to the single-purpose design tools that pile up on your desktop and in your GitHub. Instead of a folder of unrelated HTML files, you get one consistent place to run them, switch between them, and hand them to a teammate. Point Claude Code at the folder, describe the tool you want, and it builds it inside the frame.

Build enough of them and you're no longer collecting odds and ends — you're assembling a tool stack shaped around exactly how you or your team work, owned end to end, with nobody else's assumptions baked in.

It's named after the [Kazam! machine](https://eamesfoundation.org/work/kazam-machine/) — the rig Charles and Ray Eames built to bend plywood before the technology to do it properly existed. The machine wasn't the point. The things it let them make were.

> **Status:** early but real. The core is built — the frame, the runtime, a handful of working tools, theming, presets, and export all run today. Expect rough edges and still-changing APIs.

## Why

A few opinions sit behind this.

- **Portability.** Sharing a tool should be as easy as sharing what the tool makes. Copy, paste, send.
- **Low friction.** Getting started should take seconds, not a setup guide. Drop in a folder, run it, go.
- **Ownership.** It should run locally and be fully yours. No backend to maintain, no forced UI updates, no roadmap you didn't ask for.
- **Conversational.** You make tools by describing them to an agent, not by scaffolding a project. The hard part becomes knowing what you want, not knowing how to build it.
- **Craft.** Now that anyone can spin up a custom tool, the interesting work moves up a level: building the tools that make your output, not just the output itself.
- **Personality.** The Geocities and MySpace era was messy and alive. Designing your own tools brings some of that back.

This isn't trying to replace Figma or whatever sits at the centre of your workflow, though it might end up taking over some of the edges. It builds on the instinct to make your own tools, and gives them a shared language and a place to live and grow.

## The trade-offs

These opinions aren't free. What they cost, stated plainly:

- One self-contained file per tool keeps tools portable and trivial to share, but rules out anything that genuinely needs a build step, a package manager, or many source files. Large or complex tools will fight the format.
- Running locally with no backend means no live collaboration, no sync, and no accounts. Sharing is manual: you copy, paste, or zip.
- Owning it fully means you maintain it. No forced updates also means no automatic fixes or security patches.
- Minimal and fast means few guardrails. Accessibility, robustness, and polish are your job, not the frame's.
- Built to be thrown away means not built to last. Don't keep anything you can't afford to lose inside a tool you might delete next week.

## Who it's for

Designers and teams who already build their own tools and have nowhere coherent to keep them. The primary use is a single home for your custom and throwaway design tools. The secondary use is sharing tools and settings with your team so everyone works from the same stack and the same controls.

It isn't built for live collaboration. It is built to be copied, pasted, and shared.

### Building a stack together

A team's tools tend to encode how that team actually works. Kazam turns that into something you can build deliberately and collectively, rather than letting it scatter across people's machines.

[Near Future](https://nearfuture.works) has used this format in workshops with large design teams: a hack day where the team builds its own shared tool stack together, each person making the small tools they wish they had, then pooling them into one Kazam frame everyone keeps. It works well as collaborative ideation territory — the tools are the artefact, and the team leaves owning a stack that's unmistakably theirs.

## How it works

Kazam is a lightweight frame that loads individual tools and gives them consistent UI, settings, and import/export. Each tool is a self-contained HTML file. The frame handles everything around the tool — controls, theming, export — so each tool can stay small.

```
kazam/
├── index.html       # the frame — open this to run and switch between your tools
├── CLAUDE.md        # the contract: how agents build and modify tools here
├── frame/           # the runtime (kazam.js) that every tool shares
└── tools/           # the individual tools, one self-contained HTML file each
```

New tools are built by Claude Code reading [`CLAUDE.md`](CLAUDE.md) and following the conventions it describes, so everything stays consistent without you wiring it up by hand. [`tools/_template.html`](tools/_template.html) is the minimal starting shape.

## Getting started

Nothing to install:

1. Download the repo as a ZIP (green **Code** button on GitHub → **Download ZIP**) and unzip it. Or, if you use git: `git clone https://github.com/near-future-works/kazam.git`
2. **Double-click `index.html`** in the unzipped folder. That's the frame — it opens in your browser with all the tools, a switcher to move between them, theming, and export. Start here and pick a tool from the menu.

Each tool can also be opened on its own — double-click any file in `tools/` — but the frame is the main way in.

Then point Claude Code at the folder and ask it to build a tool. It reads `CLAUDE.md`, drops a new file into `tools/`, and the frame picks it up.

### If you're more technically inclined (optional)

None of this is required to use Kazam — skip it unless you're curious.

A couple of the frame's extras (like "Copy tool as HTML") rely on the browser reading neighbouring files, which browsers restrict when you open a page straight from disk. If a strict browser leaves the frame blank, or you want those extras, serve the folder over a tiny local web server instead. Any static server works; Python's built-in one needs no install:

```sh
python3 -m http.server 4173   # then visit http://localhost:4173/
```

There's also optional dev tooling for anyone editing the runtime itself — `npm test` for the runtime tests and `npm run typecheck` to check changes against the contract. Neither is needed to build or run tools.

## What's here

- A shared UI and design system so every tool has the same controls and interaction patterns.
- A tool switcher for moving between the tools in your collection.
- Presets you can copy to the clipboard as JSON or Markdown and paste into Claude to recreate or extend — useful for brand-specific styles.
- Unified export of outputs: copy or download as PNG and SVG, plus GIF and WebM for animated tools.
- Export and import of whole tools as self-contained HTML, to send a teammate over Slack or email.
- A starter template (`_template.html`) plus working example tools — Shape Generator, Pixelator, Image Dither, Orbits, Gradient Dither, and Letterfall (a physics-driven poster generator).
- Light and dark mode for the frame.
- Design tokens (palette, fonts, type scale) for use inside the tools you make.
- Animation support: tools can run a deterministic frame loop with a play/scrub transport.

## Roadmap

Ideas being considered, not commitments:

- Organisation-level controls and shared settings (org name, permissions).
- A path to push a tool to a live URL.
- Global settings such as an LLM token for AI-powered tools.
- Drawn-path and point-editing inputs for tools that need them.

## Contributing

Kazam is meant to be forked, copied, and made your own. If you build something worth sharing, open a pull request — or use the frame's **Copy tool as HTML** to send a friend a single self-contained file they can open anywhere. (A raw `tools/` file shared on its own will tell them where to get the runtime rather than running, so the self-contained export is the tidier hand-off.) Issues and ideas are welcome.

## License

[MIT](LICENSE) — do what you like with it.
