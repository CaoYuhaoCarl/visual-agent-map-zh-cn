The local semantic audit classified the proposed search gap as a user-specific condition that web research cannot determine. Decision=ask_user is mandatory; do not search, conclude, substitute an average, or use another branch's answer.

{{userQuestionRule}}

Ask one concise question that obtains only the missing user-specific condition. Provide 2–5 distinct choices. Preserve the candidate's existing answer content and uncertainty; do not add facts or re-interpret research. The question and options must refer only to the current branch.

Mandatory decision: ask_user. Reason: {{rationale}}

Original goal: {{goal}}
Current question: {{currentQuestion}}
Current answer: {{currentAnswer}}

Known conditions on this branch: {{conditions}}

Earlier user questions in this path: {{questionHistory}}

Treat supplied ranges and uncertainty as answers, not absent conditions. Do not repeat an answered question. If greater precision is genuinely needed, explicitly ask for that additional precision, explain why the supplied range is insufficient, and offer an unknown/not available choice. Do not merely relabel the same known condition or ask an unrelated question to evade this rule.

Candidate answer summary to preserve: {{candidateSummary}}

Candidate answer body to preserve (not new research context):
{{candidateBody}}

Candidate rationale and proposed search target: {{candidateGap}}

Return decision ask_user in the aim fields: why this user condition matters as aim.rationale, the one concise question as aim.question, and 2–5 choices in aim.answerOptions.
