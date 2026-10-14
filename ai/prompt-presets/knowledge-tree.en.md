# VAM Knowledge Tree Generator

## 1. User settings (adjust as needed)

Research topic: {Enter research topic}

### Quantity limits
- Maximum number of headings: 30 (including the root heading)
- Maximum hierarchy depth: 6 (Markdown # through ######)

### Depth control
- Hierarchy mode: natural expansion
- Minimum research depth: no limit
- Branches may have different depths: yes
- Branches may have different numbers of child nodes: yes

### Knowledge coverage
- Knowledge completeness: prioritized
- Breadth and depth of knowledge: allocated dynamically by the complexity of the topic
- Leaf node requirement: each can be researched on its own

---

## 2. Task goal

For the research topic set by the user, build a hierarchical Markdown outline suited to systematic knowledge exploration and in-depth research.

The goal is not a traditional course table of contents. It is a knowledge tree with real knowledge logic, uneven depth, and the ability to be researched deeper level by level.

All generation rules must follow the "User settings" at the top.

## 3. Principles for organizing knowledge

1. Prioritize the completeness, logic and research value of the knowledge system.
2. Organize the outline by dependency, causality and conceptual subdivision between pieces of knowledge, not by textbook chapters or course order.
3. The outline should be an asymmetric knowledge tree, not an evenly distributed catalogue.
4. Decide the depth of each branch naturally from the complexity of that knowledge area.
5. Different branches may have different depths and different numbers of child nodes.
6. A parent node stands for a knowledge area, a core concept or a mechanism; its child nodes stand for more specific principles, mechanisms, causal relations or research questions.
7. Every child node must have a clear knowledge-logic relation to its parent, not merely belong to the same topic.
8. Every leaf node must have independent research value and suit being a complete research unit.
9. Avoid duplicated knowledge, over-splitting, and categories with no real research value.

## 4. Hierarchy and depth rules

1. Use Markdown headings to express the knowledge hierarchy.
2. Use exactly one # heading as the root topic.
3. First-level subtopics use ##, the next level uses ###, and so on.
4. The hierarchy must not exceed the maximum depth set in the user settings.
5. Do not fix all branches at the same depth.
6. Simple concepts may stay at a shallower level.
7. Complex concepts should go deeper along their knowledge dependencies.
8. Every level must represent a meaningful deepening of knowledge, not just more headings.
9. Do not create unnecessary intermediate nodes just to chase depth.
10. When a concept deserves further research, go deeper along that branch first instead of adding more categories at the same level.

## 5. Knowledge relations and node design

Prefer presenting these three kinds of knowledge relations:

1. Conceptual subdivision: from an abstract concept down to concrete principles and mechanisms.
2. Causal relation: from a phenomenon down to influencing factors, mechanisms and results.
3. Dependency relation: from foundational concepts down to the advanced knowledge built on them.

Node design requirements:

1. A single knowledge path should show a progressively deepening line of research logic.
2. A parent node should be able to reasonably unify all of its child nodes.
3. A child node should offer a new research direction, not restate the parent in other words.
4. A leaf node should be specific enough to be researched further for its principles, evidence, limits and practical applications.
5. Avoid nodes that only classify and have no research meaning.
6. When knowledge relates across fields, place it where it best explains its core mechanism and avoid creating the same node twice.
7. Do not add nodes without research value just to fill the hierarchy.

## 6. Quantity and completeness rules

1. The total number of headings must not exceed the maximum set in the user settings.
2. Within the quantity limit, cover the most important core knowledge areas first.
3. Balance breadth with the research depth that is needed; do not sacrifice the depth of every branch for the sake of breadth.
4. Do not distribute headings evenly across categories.
5. Do not add content just to reach the heading limit.
6. Keep nodes with high research value, explanatory power or knowledge dependency first.
7. Do not use a fixed pattern of "every major category has the same number of subtopics".
8. If the quantity limit conflicts with completeness, keep the core knowledge, the key dependencies and the most valuable research paths first.

## 7. Quality check before output

Before producing the final result, check for yourself:

1. Does it cover the most important core knowledge of the research topic?
2. Does it have clear conceptual subdivision, causal or dependency relations?
3. Is branch depth decided by the complexity of the knowledge rather than a fixed template?
4. Is there a branch worth going deeper that stops too early?
5. Does every deepened node have real knowledge value?
6. Are there unnecessary intermediate categories or duplicated nodes?
7. Does it avoid writing the knowledge tree as a traditional textbook table of contents?
8. Does it respect the quantity and hierarchy limits set by the user?

If not, adjust the structure yourself first, then produce the final result.

## 8. Output format

1. Output Markdown headings only.
2. Use # up to the maximum hierarchy depth set by the user.
3. Do not use bold, lists, tables or any extra explanation.
4. Do not explain the design logic.
5. Do not output the quality-check results.
6. Do not wrap the result in a Markdown code block.
7. Output only the final outline itself.
