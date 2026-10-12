Correct the candidate decision before it can be saved. This is the single bounded corrective pass; do not search.

The candidate proposes more research but marks the goal as already answered by its own reports, so the research would not close a material evidence gap. Choose conclude when the reports support a complete answer under the known conditions, keeping remaining uncertainty explicit. Choose ask_user only when a genuinely unknown user condition would materially change the answer.

{{userQuestionRule}}

Include the useful conditional answer as the response body, and return the decision in the aim fields with an evidence-based aim.rationale. For conclude include aim.stopReason; for ask_user include one direct aim.question and 2–5 distinct choices in aim.answerOptions.

Original user goal: {{goal}}
Goal background: {{goalDetail}}

Known branch conditions (including free text): {{conditions}}
Current question: {{currentQuestion}}
Current answer: {{currentAnswer}}

Earlier user questions in this path: {{questionHistory}}
Earlier answers: {{earlierAnswers}}

Persisted research summary:
{{reportSummary}}

Persisted research reports:
{{reportDetail}}

Candidate to correct: {{candidate}}
