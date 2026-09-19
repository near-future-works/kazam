# tools/

Your tools live here. One HTML file per tool.

This folder starts empty. That is on purpose — it is yours to fill.

## Adding a tool

1. Copy [`../examples/_template.html`](../examples/_template.html) to `tools/<your-tool>.html`.
2. Write the `settings` schema and the `build()` function. The runtime owns everything else.
3. Add one line to the `TOOLS` array in [`../index.html`](../index.html):

   ```js
   { id: "your-tool", name: "Your Tool", path: "tools/your-tool.html" },
   ```

4. Open `../index.html` and pick the tool from the menu.

Read [`../CLAUDE.md`](../CLAUDE.md) first. It is the full contract: the settings schema,
the `ctx` API, and the rules a tool must follow.

## Examples

The worked examples are **not** in this folder. They live in
[`../examples/`](../examples/) and run from their own frame at
[`../examples/index.html`](../examples/index.html).

Read them for reference. Copy from them freely. Leave the originals where they are, so
this folder stays a list of the tools you actually use.
