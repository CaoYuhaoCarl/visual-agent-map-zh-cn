/**
 * Step Runner: one place that turns a prompt template plus structured input into a model call.
 * A step owns its prompt text (a template file), its gates and its parser. The provider owns
 * transport concerns (exchange log, abort, streaming) and never sees step internals.
 */

export interface StepDefinition<Input, Output> {
  /** Stable identifier such as `coffee.table`. */
  readonly id: string;
  /** Bump when the prompt, schema or parser changes in a way that matters for logs and replay. */
  readonly version: number;
  /** Pure: build the full prompt from the input. */
  render(input: Input): string;
  readonly schema?: unknown;
  /** Gate evaluated after render and before any provider call (for example a length limit). Throws to refuse. */
  policy?(prompt: string, input: Input): void;
  /** Turn the raw provider reply into the step output. */
  parse(raw: string, input: Input): Output;
}

export interface StepCall<Controls> {
  readonly stepId: string;
  readonly version: number;
  readonly prompt: string;
  readonly schema?: unknown;
  readonly controls: Controls;
}

export interface StepProvider<Controls> {
  complete(call: StepCall<Controls>): Promise<string>;
}

export interface StepResult<Output> {
  output: Output;
  prompt: string;
  raw: string;
}

/** The label that identifies the step and its version in logs, for example `coffee.table@1`. */
export function stepLabel(step: Pick<StepDefinition<unknown, unknown>, "id" | "version">): string {
  return `${step.id}@${step.version}`;
}

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/**
 * Fill `{{name}}` placeholders in a single pass, so substituted values are never re-scanned.
 * A placeholder without a variable, or a variable the template never uses, is a programming error and throws.
 * Only one trailing newline (the file's own) is removed.
 */
export function renderTemplate(template: string, variables: Readonly<Record<string, string>>): string {
  const body = template.endsWith("\n") ? template.slice(0, -1) : template;
  const used = new Set<string>();
  const text = body.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name))
      throw new Error(`Prompt template uses unknown placeholder {{${name}}}`);
    const value = variables[name];
    if (typeof value !== "string") throw new Error(`Prompt template variable "${name}" must be a string`);
    used.add(name);
    return value;
  });
  for (const name of Object.keys(variables))
    if (!used.has(name)) throw new Error(`Prompt template variable "${name}" is not used by the template`);
  return text;
}

/** Render, then run the step's policy. Callers that must fail before starting any work use this directly. */
export function prepareStep<Input, Output>(step: StepDefinition<Input, Output>, input: Input): string {
  const prompt = step.render(input);
  step.policy?.(prompt, input);
  return prompt;
}

export class StepRunner<Controls> {
  constructor(private readonly provider: StepProvider<Controls>) {}

  /**
   * Provider half of a run, for callers that have already prepared the prompt and must interleave their own
   * checks (stale generation, abort, streamed fallback) before parsing. The provider is invoked synchronously.
   */
  async send<Input, Output>(
    step: StepDefinition<Input, Output>,
    prompt: string,
    controls: Controls
  ): Promise<{ prompt: string; raw: string }> {
    const raw = await this.provider.complete({
      stepId: step.id,
      version: step.version,
      prompt,
      ...(step.schema === undefined ? {} : { schema: step.schema }),
      controls
    });
    return { prompt, raw };
  }

  /** render -> policy -> provider -> parse. */
  async run<Input, Output>(
    step: StepDefinition<Input, Output>,
    input: Input,
    controls: Controls
  ): Promise<StepResult<Output>> {
    const { prompt, raw } = await this.send(step, prepareStep(step, input), controls);
    return { output: step.parse(raw, input), prompt, raw };
  }
}
