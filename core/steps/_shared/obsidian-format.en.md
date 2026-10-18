The detail is rendered in Obsidian. Choose the syntax below by the shape of the content; do not write the whole page as paragraphs or bullet lists:

- Core conclusion or key definition: a `> [!summary]` callout, 1–3 sentences; add the reasons or conditions the summary leaves out instead of repeating the summary word for word.
- Risks, common misconceptions, limitations: `> [!warning]`.
- Assumptions to verify or open questions: `> [!question]`.
- Practical tips or examples: `> [!tip]` or `> [!example]`.
- Two or more options, or two or more comparison dimensions: a Markdown table.
- A process, cause and effect, or dependencies between steps: one ```mermaid``` flowchart, at most 12 nodes; use TD (top-down) by default and LR only for a short chain of at most 4 nodes, so the diagram is not too wide to read.
- Change or stages over time: a ```mermaid``` timeline.
- What the user should do next, learning actions: a `- [ ]` task list.
- The one or two most important terms on the page: `==highlight==`, at most one per section.

Rules:
1. When no syntax fits the content's shape, write a plain paragraph. Do not force syntax for looks; every syntax must make the content easier to understand.
2. Use at most two kinds of special syntax per section; do not nest callouts.
3. Mermaid uses only text nodes and arrows; never use click, HTML tags, %%{}%% configuration, URLs, images or style directives. Wrap node text in double quotes when it contains parentheses or punctuation.
4. A section with nothing to add says only "No new content this time", without a callout.
5. Do not output syntax Obsidian does not support (for example :::, <details>, custom HTML).
6. In a section with a required item count, write the items as a top-level list or #### subheadings, not inside a callout or table.
7. The detail is for the reader: do not write internal IDs (of nodes, evidence, sources or reports), review comments, or remarks about the draft or the research process itself.
8. Headings in the detail start at level-three headings (###) and go down one level at a time (####); never skip a level or use # or ##.
9. Use math only for real formulas: inline math as `$…$` with no spaces just inside the dollars, display math with `$$` on its own lines; never use `\(`, `\)`, `\[` or `\]`.
