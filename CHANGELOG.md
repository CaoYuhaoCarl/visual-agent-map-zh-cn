# Changelog

## [0.20.0] - 2026-10-15

### Added

- **Answer once, then let it run.** When you start an AIM, "How AIM asks" defaults to answering the opening questions once: AIM asks for every condition that would change its advice up front, then researches and writes the document without stopping. Questions that come up during research become stated assumptions or "if X, do A; if Y, do B" advice. The previous one-question-at-a-time mode is still available.
- **See what AIM is doing.** As soon as the research plan is ready, each planned subtopic appears on the map as a dashed card showing queued, searching (with the number of searches and elapsed time) or done. The status bar shows the current stage and elapsed time, and a notice tells you when the document is ready.
- **Change direction** during a run or after a document: write what you care about now. A run in progress stops first and keeps its finished research; the new focus becomes a question titled by your words, earlier findings are kept, and the earlier document stays.
- **Correct an assumption** on a finished document: pick an assumption that is wrong, describe your real situation, and AIM reuses the research that still holds and rewrites the document.

### Changed

- AIM ends with a usable document much more often. When research turns run out, it gives a conditional answer and lists what you should confirm instead of stopping as unfinished; when the final review still finds a gap, the written document is kept with the gap stated.
- AIM decides when to stop with a checklist of conditions that would change the answer, instead of a fixed minimum of three questions, and asks related details (for example licence, daily driving time and transport) together in one question.
- The final document is written in one pass, opens with the answer, and says each point once. Subtopic notes report only what they add; the document brings earlier rounds and new research together.
- Research reuses saved findings from other answers on the same map when their conditions still hold.
- Fewer AI calls and shorter waits per document; three subtopics are researched at a time.
- The menu item is now **New AIM**, and AIM maps no longer show a separate "Create a new mind map" button.

### Fixed

- A subtopic search that times out, is not performed or returns nothing usable is skipped instead of ending the whole run; small AI formatting slips are repaired or skipped instead of failing.

## [0.19.0] - 2026-10-15

### Changed

- Mind maps and AIM maps are stored separately: new mind maps go to `Mind Maps/` and new AIM maps to `AIM/` inside your workspace folder, so the file explorer no longer mixes the two. Both folder names can be changed in settings; changing one renames the existing folder and closes the Settings window while it runs.
- The Inbox is no longer created or managed. Notes in an existing `Inbox/` folder are left untouched, and the pre-0.4 workspace migration was removed.

### Added

- **Organize workspace folders** command moves existing maps from `Topics/` into `Mind Maps/` and `AIM/`. It shows a preview first, uses Obsidian's rename so links follow, shows progress per map, and restores every moved map if a step fails. VAM never moves maps on its own; maps left in `Topics/` keep working.
- When Organize leaves the old `Topics/` or `Inbox/` folder completely empty, it moves that empty folder to the trash (following your Obsidian trash setting). A folder that still holds anything, including hidden files, is never touched.

### Fixed

- Rebuilding or updating notes keeps each note's existing label language instead of switching it to the current interface language.
- VAM no longer writes to the vault after it is disabled or Obsidian closes.
- **Refresh VAM data** and Organize first repair maps left with outdated paths by an interrupted move.

### Notes

- When Obsidian's "Automatically update internal links" is off, Obsidian may ask about links once per moved map.
- Obsidian's link update may turn relative image embeds in moved notes into full vault paths.
- Moved AIM maps are saved with current field names.

## [0.18.0] - 2026-10-14

### Added

- **Writing tones** change how AI words its notes: Plain explanation, Magazine column, Key-point summary, Practical guide, Academic rigor (the previous behavior) or AI choice. Pick one per map, per topic or per run. Write and save your own tones in Settings → Writing tones, or with **Edit tones…** beside any tone picker. A tone never changes the source, citation or accuracy rules.
- **Generate an outline with AI** in **Import outline**: give a topic and an outline preset (the built-in **Knowledge tree generator** or your own saved preset), review the headings, then add them to the map.
- **Quick explore** in **Expand** drafts a whole tree of subtopics at once. Choose how many levels (1–6) and how many subtopics (up to 30); you review and edit the tree before anything is created. **Choose directions together** still proposes one level at a time.
- **AI structure suggestions** for the whole map or one branch: AI reads only topic titles, summaries and status, and suggests what to add, move, merge or remove, each with a reason. Apply suggestions one at a time; each is a single undo step.
- **Translate image**: click an image in a note, pick a language, then **Replace image** or **Add new image**. Codex draws a translated version, saves it as an attachment and writes it into the note; the original file is kept. A glow on the image shows the work in progress.
- Researching several selected topics has the **Search for image references** option.

### Changed

- The AI dialog opens on a one-line summary of what will run. **Adjust** holds every option: one depth control, sources, extra requirements, output settings, model and the expand mode.
- Card tools float above the card as labelled buttons: **Collapse**, **Structure**, **Rename**, **Details** and **AI explore**. Hovering, selecting or focusing a card never moves or re-wraps it.
- **Select several topics** sits at the top left of the map, and a **Layout** menu (expand to a level, expand all, collapse all, auto layout) sits with the zoom controls. The gesture hint goes away after your first pan or zoom.
- Collapsing or expanding a branch re-arranges the shown map; hidden branches keep their places.
- **Import outline** adds to the open map, as a new tree or under the selected topic. Start a new map from **＋ New map**. Picking an outline file from the vault is replaced by pasting or generating one.
- **Fix connection…** beside the model picker opens the setup guide when the AI service's CLI is missing and checks it again otherwise. **Edit templates…** beside the content template picker opens the template library at the chosen template.
- Image search in **Use AI on selection** looks across the web instead of only Wikimedia Commons and lists each image with its source page; web images may not be free to reuse. Clicking an image shows **Translate image** instead of the image panel.
- The sample tour teaches the current map controls.
- Automatic image search no longer skips ordinary knowledge questions.

## [0.17.0] - 2026-10-13

### Changed

- The visual map toolbar is one row: switch map, research progress, **＋ New map** (new mind map, import outline or AIM), undo, redo and more actions. Topic tools and zoom float on the canvas, and hover preview size moved to Settings.
- Topic cards show their research state, including the reason a topic failed. Card tools appear on hover, focus or selection. Clicking a card selects it; the details sidebar follows the selection only when it is already open.
- Arrow keys move between topics and F2 renames the selected topic; keyboard focus stays in place when the map redraws.
- **How would you like to explore next?** puts the step choice first and suggests a step from the topic's state. One action bar stays at the bottom, all steps share one set of sources, and a notice confirms when a task continues in the background.
- AI drafts open rendered, with **Edit** to change them before saving. The window says what the draft replaces or creates, keeps save errors visible, and asks once more before **Discard**.
- Subtopic proposals show one row per topic with details folded, children indented under their parent, linked checkboxes, **Select all** and the number of topics on the create button.
- In **Structure and links**, a new parent applies only after **Apply**. Removing topics, deleting a map or a template and other destructive choices are marked, and confirmation windows start on **Cancel**.
- Create, import, research, content template and map conflict windows keep their buttons in view and show problems inside the window. The map conflict window explains what each version keeps.

### Fixed

- Pressing Enter while an input method is still composing characters no longer saves a topic name early.

## [0.16.0] - 2026-10-13

### Added

- **Import outline** turns a heading-only Markdown outline, pasted or picked from your vault, into topics: as a new map, as a new tree in the current map, or under the selected topic. **Copy format instructions** gives you a prompt to ask another AI for an outline. You can research every new topic right away and choose the depth, model and content template.
- **Research** in topic selection researches several selected topics in the background, up to three at a time, with your choice of depth, model, web search and content template. A status bar at the top shows progress and **Stop research**.
- **Content templates** (Settings → Content templates) set which sections a research note has. Rename, add, remove and reorder sections, tell the AI what each one should contain, and require an exact or minimum number of items. Choose a template when you research, expand, synthesize, research several topics or import an outline; a topic remembers your choice, and a map can have its own default. When a reply misses a required count, VAM asks the AI to fix it once and marks the topic if it still doesn't match.
- When some topics in a batch fail, **Retry failed topics** selects them so you can run them again, for example with another model.

### Changed

- The six standard note sections now tell the AI what each section should contain, so research notes are more consistent.
- Source citations in notes are numbered footnotes ([^1], [^2]) listed at the end of Evidence and sources, instead of long note paths in the text.
- Synthesis runs in the background: the window closes when it starts, and the topic shows its progress.
- **Create Adaptive Inquiry Map (AIM)** sits next to **+ Mind map** in the top toolbar.
- Batch progress counts only finished topics as done and shows failures separately.

### Fixed

- Renaming or moving a note or topic folder that belongs to an AIM map keeps the map readable.
- One unreadable map no longer stops VAM from updating your other maps; VAM skips it and tells you which one.
- New notes created from an outline get their parent and child links right away.
- AIM writes its content in the language of your question.
- Note edits made while VAM rebuilds note links are kept.

## [0.15.0] - 2026-10-12

### Added

- A setting, **Show “Use AI on selection” automatically** (on by default), turns off the button that appears when you select text in a Markdown note and stops image clicks from opening the AI panel. With it off, the **Use AI on selection** command and its hotkey still open the panel for the current selection.

### Changed

- AI prompts now live in separate template files, and every model call goes through one shared path. What is sent to the model is unchanged. AI request/reply log entries now name the prompt step they came from.
- Internal names for the Adaptive Inquiry Map (AIM) research data now match its visible name. Maps and notes saved by earlier versions open and continue as before; they are updated to the new names when opened.

## [0.14.1] - 2026-10-12

### Changed

- Visible research controls use the Adaptive Inquiry Map (AIM) name: the create button, start dialog, empty-map hint, progress text and status bar.
- README and INSTALL no longer label Claude Code support as experimental.
- Interface, log and error text, including the Coffee Tables view and new AIM note titles, comes from the shared English and Traditional Chinese dictionary.
- Faster vault scans for VAM-marked notes; deleting a note reconciles maps only when a map node is affected.

### Fixed

- Claude Code can use web search during AIM research, and isolated research without real web evidence is reported as failed instead of accepted.
- AIM planning steps use provider-enforced response formats, so fewer replies need format repair and an already answered goal no longer forces more research.
- Saved AIM results no longer fail readback at random; search status is read from structured data instead of text matching.
- Map saves change only what they own: viewport updates no longer rewrite the map, research runs share one lock per vault, and renames made while VAM is saving are kept.
- Saved-report recovery reads the structured attempt record, with the old Markdown parsing kept only as a fallback.
- Large Claude Code outputs, non-JSON stream lines and input errors no longer break a task; a failing Codex callback fails only its own turn.
- Coffee Tables cleanup failures during delete, restore and organize are written to the debug log, and a restored table can no longer be restored a second time.

### Validation and limitations

- Automated unit, integration and AIM suites, lint, format check, build and artifact check pass.
- During development in a macOS Obsidian test vault, Codex and Claude Code each completed an AIM run to a conclusion, and Claude Code completed live Coffee Tables and structured task requests. Windows and Linux remain unverified.
- Coffee Tables keeps resumable conversation data in the hidden `Coffee Tables/.sessions` folder, which Obsidian Sync does not sync; synced conversations can be read but not continued on other devices.

## [0.14.0] - 2026-10-10

### Added

- Guided research with answer snapshots, connected evidence reports and a separate final-document workflow.
- Exact-source applicability and freshness assessments for report reuse; targeted updates and new evidence tasks without a minimum search quota.
- Up to two independent evidence tasks in parallel, with dependent tasks receiving saved prerequisite reports.
- Persisted section-level document writing and resume, including selective invalidation after evidence changes.
- Failure reasons, saved execution phases and bounded retry controls, including a ten-minute timeout recovery option.
- Attribution to the original research project and paper, with bilingual README guidance for AIM (Adaptive Inquiry Map).

### Fixed

- Keep research and completed document sections when a later phase fails; preserve cancellation and duplicate-dispatch safeguards.
- Require the complete final-acceptance decision marker in the document detail field.
- Remove the New question action from completed conclusion cards.
- Draw conclusion card backgrounds with SVG to avoid the CSS clip-path compatibility warning.

### Validation and limitations

- Codex live backend testing covered parallel searches, dependent reports, audited reuse, section resume and acceptance-only retry. Saved results were reopened in the macOS Obsidian testing vault.
- This release uses earlier research interface labels. Live Claude Code execution and Windows/Linux remain unverified. AI source selection and review do not guarantee factual accuracy.

## [0.13.0] - 2026-10-03

### Added

- Floating AI actions for selected Markdown text in reading, live preview and source views, and clicked images. Review editable drafts before accepting or appending them.
- A configurable Markdown selection command and explicit image transmission on execution. Image interpretation currently requires Codex; original images remain unchanged.

### Changed

- Run shallow child research with up to three concurrent tasks, shared cancellation and independent failure handling.
- Label subtopic proposal fields for name, research task and contribution.

### Fixed

- Allow creating proposed children under the current note without selecting another proposed parent.
- Guard AI writeback against changed notes, views and selections.

### Known limitations

- Live provider generation, draft acceptance/writeback and real concurrent research remain unverified in this release cycle. UI entry points and cancellation were previously checked; automated CI covers logic and integration fixtures.
- Image interpretation is Codex-only and requires loaded image pixels or a readable Vault attachment. It does not fetch remote images separately.
- Reload Obsidian fully after replacing plugin files.

## [0.12.0] - 2026-10-03

### Added

- Turn a completed Coffee Tables discussion or one insight into an editable research question and context, then create a Visual Map manually or with optional AI reframing.
- Preserve the initial framing, insight snapshot, simulated/unverified status and source links in an editable Thinking Origin section; research and direction selection retain this context.

### Changed

- Compact the Next Step task form, keep source/depth details collapsible, and preserve per-task answer language and selected model during discovery refresh.
- Give Codex and Claude selectors shared discovery status and retry behavior. Claude CLI candidates do not imply successful authentication.

### Fixed

- Close the task form after expansion is accepted and keep the task running in the background with progress and Stop controls.
- Run optional shallow child research sequentially through completion, preserving completed content and stopping further work on cancellation.
- Distinguish explicit Stop from expansion failure while retaining real provider and partial-write errors.
- Show one selection checkbox per map node.

### Known limitations

- Claude live execution remains unverified. Native multi-child sequencing and the Reframing model selector were not validated in this release cycle.
- Reload Obsidian fully after manually replacing plugin files; reloading plugins alone may leave existing map views using earlier code.

## [0.11.0] - 2026-10-02

### Added

- Editable Coffee Tables conversation instructions, reusable styles, per-table snapshots, and UTF-8 `.txt` / `.md` background files.
- Cumulative observer insights with expandable context, a questions-and-possible-solutions category, search, category collapse, and source navigation. Existing insights survive updates that omit them.
- Conversation segment navigation with one-sentence summaries, direct jumps, and an optional single-request backfill for missing summaries.
- Guests invited with follow-up questions stay in the table after a successful response, including after reopening.

### Changed

- Use a brain-circuit icon for VAM and group the VAM and Coffee Tables ribbon entries with separators.
- Keep table navigation actions in a separate pinned row and preserve the home list state on return. Remove per-row action menus, legacy organization and recently-deleted interfaces, and the restored-instructions application action. Existing backup data is retained.
- Use the left pane for Coffee Tables conversation segments; observer insights are searched and browsed on the right.

### Fixed

- Preserve reading position during streaming and avoid clipping wrapped navigation text in narrow sidebars.
- Treat background contents as reference data and preserve Markdown parsing when references contain headings, code fences, or output markers.
- Restrict Coffee Tables text-generation tasks from inspecting Git or the surrounding environment.

### Known limitations

- Legacy v1 conversations remain read-only; segment-summary backfill does not write to them.
- Claude Code live tasks remain unverified.

## [0.10.0] - 2026-10-01

### Added

- **Coffee Tables:** Open a streaming, multi-perspective AI conversation from its own Obsidian view. Choose guest perspectives and counts, listen in, add comments, ask a guest a question, or redirect the discussion.
- Continue a finished discussion or follow up in the same timeline. Observer notes update with each completed segment and preserve earlier versions.
- Search and filter saved tables by status, preview observer notes, and narrow the list to exact same-topic sessions. Conversations are readable Markdown notes with separate resumable session data.
- Added English and Traditional Chinese Coffee Tables interface text and bilingual suggested topics.

### Changed

- Reworked the Coffee Tables list to show each recent session with its full topic, activity time, and status instead of nesting sessions under topic groups. Added an exact-topic shortcut for finding related sessions.
- The Markdown document's first top-level heading is the session topic; headings inside conversation or observer notes no longer replace it.

## [0.9.10] - 2026-09-29

### Fixed

- Keep first-time expansion proposals in the task form for editing and selection; preserve input for retries when no proposals are returned.
- Refresh pending-proposal indicators after creation and reject confirmation when the parent topic is no longer in the current map.
- Clean up failed sample copies only when the new folder is still owned by the operation; preserve existing notes and report cleanup failures with the remaining location.
- Exclude identifiable archived VAM notes from folder source selections and show the excluded count. Individual Markdown selection can still include an archived note intentionally.
- Require positive child counts for multi-level quick expansion and ignore the unused child-count field for a single level.
- Clarify temporary undo history and distinguish the minimum Obsidian requirement from the tested macOS version.

### Known limitations

- Claude Code remains experimental; successful live tasks are still unverified without a signed-in account. Broader accessibility, platform, and live timeout validation remains pending.

## [0.9.9] - 2026-09-28

### Added

- Named, session-only undo and redo for saved AI results and deleted maps, with conflict checks before restoring changed content.
- Per-task answer language, execution summaries, reviewable expansion proposals, clearer task progress and retry guidance.
- Topic naming and renaming, plus actionable empty states and improved keyboard labels.

### Fixed

- Adapted Claude Code's structured-output schema and event parsing; live Claude completion remains unverified without a signed-in account.
- Preserved source identity through batched research and cited external Markdown as external locations rather than Vault links.
- Recognized English and Traditional Chinese knowledge headings without nesting duplicate sections, and respected requested conclusion counts.
- Prevented canceled or stale integration results from writing a new topic, and kept generated notes when undoing a new root.
- Clarified legacy Rules, current-map outline search, and first-use instructions in both languages.

### Known limitations

- Claude Code live research and saving remain unverified. Undo and redo are temporary; switching maps or closing the map view clears ordinary edit history; other platform and screen-reader validation is pending.

## [0.9.8] - 2026-09-27

### Added

- Experimental local Claude Code support alongside Codex, with per-topic model routing, separate CLI setup and provider usage notices. Successful live Claude tasks remain unverified; shared mock tests pass.
- Full-content (default) and quick-summary synthesis choices for direct children and selected topics, with complete extra Markdown source processing.

### Fixed

- Official samples now teach per-run Additional requirements instead of populated legacy Rules; existing notes and sample copies remain unchanged.
- Provider selection updates task readiness checks without silently switching services.
- Corrupt AI exchange and pending-suggestion JSON is preserved and further persistence is stopped instead of silently overwriting it.
- Strict lint, artifact checks, regression gates and release protections now share the same automated verification path.

### Known limitations

- Codex model discovery may require Check again in settings after startup. Claude live research, search, synthesis and cross-provider quality comparison await validation.

## [0.9.7] - 2026-09-27

### Changed

- Fresh installs now use English as the VAM interface language by default, while an existing saved VAM language choice remains unchanged.
- Switching languages updates the interface and official read-only Sample without changing existing map titles or notes.
- Sample duplication, empty-map creation, and manual editing remain available without Codex; Codex setup is required only for AI tasks.

## [0.9.6] - 2026-09-26

### Added

- Added bilingual first-use guidance and an official read-only Sample that follows the VAM interface language. New installs use Traditional Chinese when Obsidian is set to `zh-TW` and English otherwise; an existing VAM language choice is preserved.
- Added the ability to duplicate the Sample, create an empty mind map, and edit maps without Codex. Codex setup guidance now appears when starting an AI task.
- Added an isolated Obsidian CLI runtime test that verifies the prepared build, canonical test Vault, plugin initialization, Sample, commands, and runtime errors before UI acceptance.

### Changed

- Updated installation guidance and the README in English and Traditional Chinese for the no-Codex manual workflow.
- Switching maps now closes only a VAM-opened detail note from the previous map and clears Obsidian's cached Outline state.

## [0.9.5] - 2026-09-25

### Added

- Added task-only additional instructions and data-source controls to research, map expansion, and synthesis. Tasks can use web search, optional image references, other maps in the current vault, and selected Markdown files or folders; selected local sources are processed in batches and cited in results.
- Added exact-size starter-map expansion controls, including zero children per parent to stop after the first level and a 15-subtopic limit.

### Changed

- Standardized interface and AI task text on complete English and Traditional Chinese translation catalogs. New AI content follows the interface language by default; changing languages updates only known VAM-managed Detail headings in existing topic notes.
- Made task instructions and source selections apply only to the current run; they are not saved to a topic or inherited.
- Reworked the disposable test-vault harness to update one canonical vault safely, preserve its data during artifact refreshes, and verify installed artifacts.

### Fixed

- Improved cancellation and failure handling for reading and processing selected Markdown sources so incomplete material is not silently treated as complete.
- Clarified starter-map level counts and disabled the children-per-topic setting when creating a single level.

## [0.9.4] - 2026-09-23

### Added

- Added an automatically opened topic outline in the left sidebar, following the map hierarchy with search and direct note navigation.

### Fixed

- English sample notes now show English Preview headings.
- New AI tasks use the selected interface language by default across research, map expansion, and synthesis. English-generated note scaffolding, pending summaries, reference labels, and relevant error messages now use English.
- Switching interface language does not translate or rewrite existing note content.

## [0.9.3] - 2026-09-22

### Changed

- AI tasks now time out after 3 minutes. VAM attempts to interrupt an overdue Codex turn to avoid continued background resource use, does not apply an incomplete result, and explains the reason in the task error.

## [0.9.2] - 2026-09-22

### Fixed

- Editing a topic note's Markdown `#` heading now updates its map card title. Later note writes and data rebuilds keep that title.

## [0.9.1] - 2026-09-22

### Added

- Added Fast, Normal, and Deep research depth independently of Codex reasoning effort.
- Added guided subtopic suggestions with confirmation, and quick maps with an exact first-layer count and children per parent. Requests above 15 topics show an immediate error; incomplete or uneven AI trees cannot change the map.
- Added optional shallow research after creating children, reviewable synthesis drafts, and selected Markdown notes as additional synthesis sources.
- Added branch and whole-map auto layout, topic batch actions, and opt-in AI request and reply logging in the debug log.

### Changed

- Topic cards now open their Markdown note directly; the star opens Research, Expand Map, and Synthesize in one window, while the gear opens structure and links.
- Research and expansion use web-enabled Codex tasks without a web-search control. Synthesis uses local child topics and selected Markdown notes without a web-search control.
- The plus button beside a node creates a manual child. AI expansion considers existing children to avoid duplicate proposals.

## [0.9.0] - 2026-09-22

Withdrawn prerelease. Its feature descriptions are superseded by 0.9.1.

## [0.8.1] - 2026-09-21

### Fixed

- Replaced the VAM Properties visibility override with a more specific selector that does not require `!important`.
- Made tag releases idempotent by updating assets when the GitHub Release already exists.

## [0.8.0] - 2026-09-21

### Added

- Added a user-triggered full VAM data rebuild in Settings and the Command Palette.
- Added workspace and per-topic Codex reasoning-level controls.

### Changed

- Creating a confirmed batch of child topics now rebuilds derived data only once.
- VAM note Properties are hidden in reading and Live Preview while their YAML metadata remains intact.

## [0.7.1] - 2026-09-20

### Fixed

- Codex launch now adds the resolved executable directory to the child PATH, so npm/nvm installations can find their sibling Node executable when Obsidian starts without the terminal environment.

## [0.7.0] - 2026-09-20

This release improves the complete first-use journey, from installation and Codex setup to the first editable map and first AI task.

### Changed

- Rebuilt the installation guide around the full path from Community plugins or GitHub Release to the first editable map.
- The built-in sample now shows Codex readiness as the next onboarding step and unlocks duplicate or empty-map creation when ready.
- When Codex CLI is missing, VAM now opens an in-product setup guide with the official install link, ChatGPT sign-in steps, requirements clarification, and a recheck action.
- The first real AI task now shows a one-time notice that it uses the signed-in account's Codex allowance; canceling keeps the notice pending.

## [0.6.2] - 2026-09-20

### Changed

- Replaced the separate ACP transport and CLI fallback with the Codex CLI App Server protocol.
- New workspaces default to the lowest-cost configured product model, `gpt-5.6-luna`, with low reasoning; available models are discovered from the signed-in Codex installation.

### Fixed

- App Server tasks now unsubscribe ephemeral threads, decline unsupported interactive requests instead of hanging, and ignore stale child-process events after restart.
- Resolved the remaining Obsidian review warnings for destructive buttons and over-broad CSS overrides.

## [0.6.1] - 2026-09-19

### Fixed

- Aligned the English and Traditional Chinese README so both languages publish the same usage, requirements, installation, data, privacy, limitations, and build information.
- Replaced the unverified Obsidian `1.7.2` compatibility claim with the verified `1.13.7` baseline across README, manifest, and version metadata.
- Added release checks that reject README language drift and inconsistent public version or compatibility metadata.

## [0.6.0] - 2026-09-19

### Added

- Added a bilingual, built-in Taiwan travel sample that demonstrates both subtopic exploration and synthesis into a new journey root.
- Added a short, repeatable sample tour and one-click duplication into a normal editable workspace map.
- Rebuilt the sample from canonical Map/Note Markdown, expanded it to 12 nodes, and added five bundled images plus Preview image/table examples.
- Added explicit Agent Workspace recovery in the empty state, settings, and Command Palette.
- Added read-only discovery and user-confirmed reconnection for custom VAM workspaces after reinstall.
- Added an in-memory debug log with a Command Palette viewer, timestamped levels, refresh, copy, and clear actions; ACP initialization, malformed responses, and AI task failures are now captured explicitly.
- Added reproducible onboarding, normal-use, and reinstall test-vault profiles with SHA-256 workspace integrity verification.

### Changed

- Fresh installs now create only the empty `Agent Workspace/Topics` and `Agent Workspace/Inbox` structure, then open the read-only sample without running AI or writing sample files to the Vault.
- Existing installations never silently recreate a manually removed Agent Workspace; repair only restores missing base folders and never overwrites content.
- New installs no longer assume the Apple Silicon Homebrew path for `codex-acp`; macOS discovery now covers Homebrew, local npm prefixes, Volta, fnm, nvm, and the inherited PATH.
- ACP responses may include brief progress prose before the structured result; VAM now extracts and validates the final complete JSON object instead of failing the task on that prefix.
- Settings now shows the resolved Codex ACP status and provides an explicit recheck action; VAM never installs or updates system dependencies automatically.
- The Codex CLI fallback schema is embedded in `main.js`, so standard three-file Community Plugin installations no longer depend on an extra release asset.

### Validation

- Built-in sample schema, bilingual content, duplicate identity isolation, workspace repair, replacement onboarding contract, and debug-log behavior are covered by automated tests.

## [0.5.3] - 2026-09-18

### Changed

- Restored the public GitHub README as a product landing page with clear installation, requirements, privacy, limitations, and bilingual guidance.

## [0.5.2] - 2026-09-18

### Changed

- 開啟與載入外掛不再靜默修改既有 Topic Note；補齊筆記顯示 class 改為明確的手動 command。
- Obsidian command IDs 移除 plugin ID；既有快捷鍵可能需要重新設定。
- Codex ACP fallback 說明改為僅限 prompt 前的 transport error。
- 正式 provider 範圍改為 Codex-only；移除 Claude Code 設定與路由。舊 `claude:*` model 會在本機提示改選 Codex model，不會啟動外部 provider 或改寫筆記。
- Onboarding 可從 Command Palette 重新開啟；建立空白／範例心智圖失敗時不標記完成、不刪除可能已寫入資料，直接保留重試入口。
- 現行 private system spec 集中於 `docs/spec/`；v0.5.0 product concept 移入歷史資料。

### Validation

- 58 automated tests、lint、typecheck、production build 與 release-asset check 通過。
- 在獨立 Obsidian vault 完成 onboarding、Codex task、decompose、synthesize、branch remove／undo 與既有筆記保留驗證。
