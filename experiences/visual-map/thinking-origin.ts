import type { TaskContext } from "../../ai/types";
import type { Note } from "../../repository";
import { thinkingOriginBlock } from "./steps/fragments";

export function withThinkingOrigin(context: TaskContext, note: Pick<Note, "thinkingOrigin">): TaskContext {
  if (!note.thinkingOrigin?.trim()) return context;
  return {
    ...context,
    sourceContext: [context.sourceContext, thinkingOriginBlock(note.thinkingOrigin)].filter(Boolean).join("\n\n")
  };
}
