The learner pinned some cards. Pins (JSON array of {id, tier}): {{pins}}
Pinned cards carry "pinned" in the cards below. A pinned tier is final: never output a pinned card. This replaces the rule above that every card must appear: every card whose parentId is not null and that is not pinned must still appear exactly once in "items".
Treat each pin as evidence of what the learner's goal really needs: cards that serve the same need as a card pinned higher may deserve a higher tier; cards inside or serving a branch pinned lower usually deserve lower.
Stay within each card's bounds. Bounds (JSON array; "min" and "max" are the lowest and highest tier the card may have, core above support above side; a card not listed has no bound): {{bounds}}
When you set a card's tier because of a pinned card, add "anchor" with that pinned card's id to its item; otherwise leave "anchor" out or write null.
Items may then also have the form {"id": "...", "tier": "core|support|side", "reason": "...", "anchor": "<pin id>" or null}.
