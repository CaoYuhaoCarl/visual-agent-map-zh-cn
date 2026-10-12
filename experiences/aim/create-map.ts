import type { MapDocument, MapNode } from "../../map-model";
import type { Repository } from "../../repository";
import { randomUUID } from "node:crypto";
import { buildAimRootContext, type AimOutcomeExpectation } from "./outcome-expectations";

export interface AimStartInput {
  topic: string;
  context: string;
  outcomeExpectation?: AimOutcomeExpectation;
  requestId?: string;
  model?: string;
  reasoning?: "low" | "medium" | "high";
  minimumAnswersBeforeConclusion?: number;
}
export interface AimStartResult {
  mapPath: string;
  map: MapDocument;
  root: MapNode;
}

/** Creates the first durable AIM slice through VAM's existing Map/Note Repository. */
export async function createAimMap(
  repository: Repository,
  model: string,
  input: AimStartInput
): Promise<AimStartResult> {
  const topic = input.topic.trim();
  if (!topic) throw new Error("AIM topic is required.");
  const requestId = input.requestId?.trim();
  if (!requestId) throw new Error("AIM creation request identity is required.");
  const rootContext = buildAimRootContext(input.context, input.outcomeExpectation, repository.settings.language);
  let mapPath = "";
  for (const file of await repository.mapFiles()) {
    if ((await repository.readMap(file.path)).aim?.creationId === requestId) {
      mapPath = file.path;
      break;
    }
  }
  if (!mapPath) {
    const minimumAnswersBeforeConclusion = input.minimumAnswersBeforeConclusion ?? 3;
    mapPath = await repository.createMap(topic, [], undefined, {
      version: 1,
      creationId: requestId,
      minimumAnswersBeforeConclusion,
      branches: [],
      runs: [],
      resultDrafts: [],
      pendingCommits: []
    });
  }
  const map = await repository.readMap(mapPath);
  if (map.title !== topic) throw new Error("This AIM creation request was already used for another topic.");
  if (!map.aim) throw new Error("The existing map does not contain a AIM creation record.");

  let draft = map.aim.rootDraft;
  if (!draft && !map.nodes.some(node => node.aimKind === "topic")) {
    const notePath = repository.unique(repository.topicFolder(mapPath, "Notes"), topic);
    const configuredReasoning = input.reasoning ?? repository.settings.cliReasoning;
    const reasoning: "low" | "medium" | "high" =
      configuredReasoning === "medium" || configuredReasoning === "high" ? configuredReasoning : "low";
    draft = {
      nodeId: randomUUID(),
      notePath,
      title: topic,
      context: rootContext,
      model: input.model ?? model,
      reasoning
    };
    map.aim.rootDraft = draft;
    await repository.saveMap(mapPath, map);
  }
  if (draft) {
    await repository.createNoteAt(
      draft.title,
      draft.model ?? model,
      map,
      mapPath,
      "workspace",
      draft.notePath,
      draft.nodeId,
      {
        summary: draft.title,
        detail: draft.context ? `## User-provided context\n\n${draft.context}` : "",
        reasoning: draft.reasoning ?? input.reasoning ?? "low"
      }
    );
    const root: MapNode = {
      id: draft.nodeId,
      path: draft.notePath,
      parentId: null,
      x: 80,
      y: 80,
      collapsed: false,
      aimKind: "topic"
    };
    map.nodes.push(root);
    delete map.aim.rootDraft;
    await repository.saveMap(mapPath, map);
  }
  const savedMap = await repository.readMap(mapPath);
  const root = savedMap.nodes.find(node => node.aimKind === "topic");
  if (!root) throw new Error("AIM mother topic was not saved; reopen this map to resume its creation.");
  return { mapPath, map: savedMap, root };
}
