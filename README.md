# Kazam

An open-source home for the small design tools you build for yourself — and a way to gather them into a stack that's entirely yours.

Kazam gives a home to the single-purpose design tools that pile up on your desktop and in your folders. Instead of a scattering of unrelated HTML files, you get one consistent place to run them, switch between them, and hand them to a teammate. Point your AI coding agent at the folder, describe the tool you want, and it builds it for you.

Build a few and you're no longer collecting odds and ends — you're assembling a set of tools shaped around exactly how you and your team work, owned end to end, with nobody else's assumptions baked in.

It's named after the [Kazam! machine](https://eamesfoundation.org/work/kazam-machine/) — the rig Charles and Ray Eames built to bend plywood before the technology to do it properly existed. The machine wasn't the point. The things it let them make were.

> **Status:** early but real. The core works today — the frame, theming, presets, export, and a handful of example tools all run. Expect rough edges and things that may still change.

## Why

A few simple ideas sit behind this.

- **Portability.** Sharing a tool should be as easy as sharing what it makes. Copy, paste, send.
- **Low friction.** Getting started should take seconds. Drop in a folder, open it, go.
- **Ownership.** It runs on your own machine and it's fully yours. No account, no sign-in, nothing to keep paying for.
- **Conversational.** You make tools by describing them to an agent, not by writing code yourself. The hard part becomes knowing what you want.
- **Craft.** Now that anyone can spin up a custom tool, the interesting work moves up a level: building the tools that shape your output, not just the output.
- **Personality.** The early web was messy and alive. Designing your own tools brings some of that back.

This isn't trying to replace Figma or whatever sits at the centre of your day. It builds on the instinct to make your own little tools, and gives them a shared language and a place to live and grow.

## Who it's for

Designers and teams who like building their own small tools and have nowhere tidy to keep them. The main use is a single home for your custom and throwaway design tools. The second is sharing tools and settings with your team, so everyone works from the same set and the same controls.

It isn't built for live collaboration. It's built to be copied, pasted, and shared.

### Building a stack together

A team's tools tend to capture how that team actually works. Kazam turns that into something you can build on purpose and together, rather than letting it scatter across people's laptops.

[Near Future](https://nearfuture.works) has used this format in workshops with large design teams: a hack day where everyone builds the small tools they wish they had, then pools them into one Kazam frame the team keeps. The tools are the artefact, and the team leaves owning a set that's unmistakably theirs.

## How it works

Kazam is a lightweight frame that loads individual tools and gives them consistent controls, settings, and import/export. Each tool is a single self-contained HTML file. The frame handles everything around the tool — controls, theming, export — so each tool can stay small.

```
kazam/
├── index.html       # your frame — open this to run and switch between your tools
├── CLAUDE.md        # the guide your agent reads to build and edit tools here
├── frame/           # the shared machinery every tool uses
├── tools/           # your tools, one HTML file each — starts empty
└── examples/        # worked examples to learn from, with their own frame
    └── index.html   #   open this to see what a Kazam tool can do
```

New tools are built by your agent reading [`CLAUDE.md`](CLAUDE.md) and following the conventions it describes, so everything stays consistent without you wiring it up by hand. [`examples/_template.html`](examples/_template.html) is the minimal starting shape.

### Your tools and the examples are kept apart

`tools/` **starts empty**. It fills up with the tools you ask for, and nothing else — so your frame is a list of the tools you actually use, from the first one onwards.

The tools that come with Kazam — Shape Generator, Pixelator, Image Dither, Orbits, Gradient Dither, Letterfall, and Showcase — are **examples**, and they live in `examples/`. They're there to show what's possible and to give your agent something to learn from. Open [`examples/index.html`](examples/index.html) to play with them in the same frame.

Like one? Ask your agent to copy it into your tools. Want them gone? Delete the `examples/` folder — nothing else depends on it.

## Getting started

Nothing to install:

1. Download the repo as a ZIP (green **Code** button on GitHub → **Download ZIP**) and unzip it. Or, if you use git: `git clone https://github.com/near-future-works/kazam.git`
2. **Double-click `examples/index.html`** to see what these tools are. It opens in your browser with the example tools, a menu to switch between them, theming, and export. Have a play.
3. **Double-click `index.html`** in the main folder. This one is yours, and it's empty until you put a tool in it.

> **Doing this for a workshop or want a stable version?** The **Download ZIP** button always gives the latest in-progress copy, which can change day to day. For a snapshot that won't shift under you, grab a numbered version from the [Releases](https://github.com/near-future-works/kazam/releases) page — and if a facilitator shared a specific version, download that exact one so everyone's on the same page.

Now point your AI coding agent (such as Claude Code) at the folder and ask it to build a tool, or to bring in one you've already made. It reads `CLAUDE.md`, drops a new file into `tools/`, adds it to your frame, and leaves the examples alone.

Each tool can also be opened on its own — double-click any HTML file in `tools/` or `examples/` — but the frame is the main way in.

### If you're a bit more technical (optional)

None of this is required — skip it unless you're curious.

A couple of the frame's extras (like "Copy tool as HTML") need the browser to read neighbouring files, which browsers restrict when you open a page straight from disk. If a strict browser leaves the frame blank, or you want those extras, run the folder through a tiny local web server instead. Any static server works; Python's built-in one needs no install:

```sh
python3 -m http.server 4173   # macOS / Linux — then visit http://localhost:4173/
py -m http.server 4173        # Windows — then visit http://localhost:4173/
```

There's also optional tooling for anyone editing the shared machinery itself — `npm test` and `npm run typecheck`. Neither is needed to build or run tools.

## If something's not working

- **The frame opens blank.** Some browsers block a page from reading the files next to it when you open it straight from disk. Try a different browser (Chrome and Edge are the most forgiving), or run the small local web server described just above.
- **I can't find my export.** Copying puts the image on your clipboard, ready to paste. Downloading saves it to your browser's usual **Downloads** folder.
- **I want to remove a tool.** Ask your agent to delete it, or remove the tool's file from `tools/` and its line from `index.html` yourself.
- **My frame is empty.** That's the starting state — `tools/` ships with nothing in it. Ask your agent for a tool, or open `examples/index.html` to see the example ones.

## What's here

- A shared set of controls and styling so every tool looks and behaves the same.
- A menu for switching between the tools in your collection.
- Presets you can copy to the clipboard and paste back into your agent to recreate or tweak — handy for brand-specific styles.
- One-click export: copy or download as PNG and SVG, plus GIF and WebM for animated tools.
- Export and import of whole tools as a single HTML file, to send a teammate over Slack or email.
- A starter template (`examples/_template.html`) plus a handful of example tools to learn from and remix, in their own frame.
- Light and dark mode.
- A shared palette and type styles to use inside the tools you make.
- Animation support, with a play/scrub timeline for tools that move.

## Roadmap

Ideas being considered, not promises:

- Team-level settings (org name, shared defaults).
- A way to put a tool on a live web address.
- A place for an AI token, for tools that call an AI themselves.
- Drawing and point-editing inputs for tools that need them.

## Contributing

Kazam is meant to be forked, copied, and made your own. If you build something worth sharing, open a pull request — or use the frame's **Copy tool as HTML** to send a friend a single file they can open anywhere. (A raw tool file shared on its own will tell them where to get the rest rather than running, so the self-contained export is the tidier hand-off.) Issues and ideas are welcome.

One thing worth a thought before you share: a tool is just a file, and it carries whatever you put in it. Don't leave anything private — a key, a token, an internal address — inside a tool you're about to hand to someone else.

## License

[MIT](LICENSE) — do what you like with it.
