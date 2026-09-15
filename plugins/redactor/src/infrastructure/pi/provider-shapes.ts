import {
  array,
  data,
  identifier,
  lazy,
  object,
  oneOf,
  type RestShape,
  type Shape,
  variants,
} from "../../domain/structured-redaction.ts";

/**
 * These shapes match payload hooks emitted by the `pi-ai` 0.85.1 builders in `dist/api/*`.
 * Preserve protocol identifiers such as roles, types, call ids, tool names, model ids, and enum values.
 *
 * Treat messages, tool data, details, descriptions, and other free form fields as data.
 * Treat unknown fields and their names as data so later API additions cannot bypass redaction.
 */

const JSON_SCHEMA_KEYWORDS: Shape = { kind: "data" };

/**
 * Preserve schema keywords and property names because they define the tool interface used by the model.
 * Treat descriptions, titles, enum members, defaults, and examples as data.
 */
const JSON_SCHEMA: Shape = lazy(() => {
  const subSchemas = object({}, { names: "keep", shape: JSON_SCHEMA });
  return object(
    {
      type: oneOf(identifier, array(identifier)),
      format: identifier,
      $ref: identifier,
      $schema: identifier,
      $id: identifier,
      $anchor: identifier,
      $dynamicRef: identifier,
      $dynamicAnchor: identifier,
      contentEncoding: identifier,
      contentMediaType: identifier,
      required: array(identifier),
      properties: subSchemas,
      patternProperties: subSchemas,
      $defs: subSchemas,
      definitions: subSchemas,
      dependentSchemas: subSchemas,
      dependentRequired: object({}, { names: "keep", shape: array(identifier) }),
      items: oneOf(array(JSON_SCHEMA), JSON_SCHEMA),
      prefixItems: array(JSON_SCHEMA),
      additionalItems: JSON_SCHEMA,
      additionalProperties: JSON_SCHEMA,
      unevaluatedItems: JSON_SCHEMA,
      unevaluatedProperties: JSON_SCHEMA,
      propertyNames: JSON_SCHEMA,
      contains: JSON_SCHEMA,
      not: JSON_SCHEMA,
      if: JSON_SCHEMA,
      // Ignore `no-thenable` because `then` is a JSON Schema keyword, not a promise method.
      // oxlint-disable-next-line unicorn/no-thenable
      then: JSON_SCHEMA,
      else: JSON_SCHEMA,
      anyOf: array(JSON_SCHEMA),
      oneOf: array(JSON_SCHEMA),
      allOf: array(JSON_SCHEMA),
    },
    { names: "keep", shape: JSON_SCHEMA_KEYWORDS },
  );
});

const CACHE_CONTROL = object({ type: identifier, ttl: identifier });
const textOrBlocks = (block: Shape) => oneOf(array(block), data);
const FUNCTION_TOOL_CHOICE = oneOf(
  identifier,
  object({ type: identifier, name: identifier, function: object({ name: identifier }) }),
);

const ANTHROPIC_BLOCK: Shape = lazy(() =>
  variants("type", {
    text: object({ text: data, cache_control: CACHE_CONTROL }),
    image: object({
      source: object({ type: identifier, media_type: data, data: data, url: data }),
      cache_control: CACHE_CONTROL,
    }),
    thinking: object({ thinking: data, signature: data }),
    redacted_thinking: object({ data: data }),
    tool_use: object({ id: identifier, name: identifier, input: data, cache_control: CACHE_CONTROL }),
    tool_result: object({
      tool_use_id: identifier,
      content: textOrBlocks(ANTHROPIC_BLOCK),
      is_error: data,
      cache_control: CACHE_CONTROL,
    }),
    tool_reference: object({ tool_name: identifier }),
  }),
);
const ANTHROPIC_MESSAGE = variants("role", {
  user: object({ content: textOrBlocks(ANTHROPIC_BLOCK) }),
  assistant: object({ content: textOrBlocks(ANTHROPIC_BLOCK) }),
  system: object({ content: textOrBlocks(ANTHROPIC_BLOCK), output_config: object({ effort: identifier }) }),
});
const ANTHROPIC_TOOL = object({
  type: identifier,
  name: identifier,
  description: data,
  input_schema: JSON_SCHEMA,
  strict: data,
  eager_input_streaming: data,
  defer_loading: data,
  cache_control: CACHE_CONTROL,
});
const ANTHROPIC_MESSAGES = object({
  model: identifier,
  messages: array(ANTHROPIC_MESSAGE),
  system: textOrBlocks(ANTHROPIC_BLOCK),
  max_tokens: data,
  stream: data,
  betas: array(identifier),
  temperature: data,
  tools: array(ANTHROPIC_TOOL),
  thinking: object({
    type: identifier,
    display: identifier,
    budget_tokens: data,
    block_binding: object({ prefix_mismatch_behavior: identifier }),
  }),
  output_config: object({ effort: identifier }),
  metadata: object({ user_id: data }),
  tool_choice: object({ type: identifier, name: identifier, disable_parallel_tool_use: data }),
  fallbacks: array(object({ model: identifier })),
});

const OPENAI_PART = variants("type", {
  text: object({ text: data, cache_control: CACHE_CONTROL }),
  image_url: object({ image_url: object({ url: data, detail: identifier }) }),
});
const OPENAI_CONTENT = textOrBlocks(OPENAI_PART);
const OPENAI_TOOL_CALL = variants("type", {
  function: object({ id: identifier, function: object({ name: identifier, arguments: data }), index: data }),
  custom: object({ id: identifier, custom: object({ name: identifier, input: data }), index: data }),
});
const REASONING_DETAIL = variants("type", {
  "reasoning.summary": object({ summary: data, id: data, format: identifier, index: data }),
  "reasoning.encrypted": object({ data: data, id: data, format: identifier, index: data }),
  "reasoning.text": object({ text: data, signature: data, id: data, format: identifier, index: data }),
});
const GRAMMAR_FORMAT = object({
  type: identifier,
  syntax: identifier,
  definition: data,
  grammar: object({ syntax: identifier, definition: data }),
});
const OPENAI_TOOL = variants("type", {
  function: object({
    function: object({ name: identifier, description: data, parameters: JSON_SCHEMA, strict: data }),
    cache_control: CACHE_CONTROL,
  }),
  custom: object({ custom: object({ name: identifier, description: data, format: GRAMMAR_FORMAT }) }),
});
const OPENAI_MESSAGE = variants("role", {
  system: object({ content: OPENAI_CONTENT, name: data }),
  developer: object({ content: OPENAI_CONTENT, name: data }),
  user: object({ content: OPENAI_CONTENT, name: data }),
  assistant: object({
    content: OPENAI_CONTENT,
    name: data,
    refusal: data,
    tool_calls: array(OPENAI_TOOL_CALL),
    reasoning_details: array(REASONING_DETAIL),
    reasoning: data,
    reasoning_content: data,
    reasoning_text: data,
  }),
  tool: object({ content: OPENAI_CONTENT, tool_call_id: identifier, name: identifier }),
});
const OPENAI_COMPLETIONS = object({
  model: identifier,
  messages: array(OPENAI_MESSAGE),
  stream: data,
  stream_options: object({ include_usage: data }),
  store: data,
  prompt_cache_key: data,
  prompt_cache_retention: identifier,
  max_tokens: data,
  max_completion_tokens: data,
  temperature: data,
  tools: array(OPENAI_TOOL),
  tool_stream: data,
  tool_choice: FUNCTION_TOOL_CHOICE,
  priority: identifier,
  reasoning_effort: identifier,
  thinking: oneOf(identifier, object({ type: identifier, clear_thinking: data })),
  enable_thinking: data,
  reasoning: object({ effort: identifier, enabled: data, exclude: data, max_tokens: data }),
});

const RESPONSES_PART = variants("type", {
  input_text: object({ text: data }),
  input_image: object({ image_url: data, file_id: data, detail: identifier }),
  output_text: object({ text: data, annotations: data }),
  refusal: object({ refusal: data }),
});
const RESPONSES_CONTENT = textOrBlocks(RESPONSES_PART);
const RESPONSES_TOOL = variants("type", {
  function: object({ name: identifier, description: data, parameters: JSON_SCHEMA, strict: data, defer_loading: data }),
  custom: object({ name: identifier, description: data, format: GRAMMAR_FORMAT, defer_loading: data }),
});
const RESPONSES_MESSAGE = object({
  type: identifier,
  content: RESPONSES_CONTENT,
  status: identifier,
  id: identifier,
  phase: identifier,
});
const RESPONSES_ITEM = variants(
  "type",
  {
    message: object({
      role: identifier,
      content: RESPONSES_CONTENT,
      status: identifier,
      id: identifier,
      phase: identifier,
    }),
    reasoning: object({
      id: identifier,
      summary: array(object({ type: identifier, text: data })),
      content: data,
      encrypted_content: data,
      status: identifier,
    }),
    function_call: object({
      id: identifier,
      call_id: identifier,
      name: identifier,
      arguments: data,
      namespace: identifier,
      status: identifier,
    }),
    custom_tool_call: object({
      id: identifier,
      call_id: identifier,
      name: identifier,
      input: data,
      namespace: identifier,
      status: identifier,
    }),
    function_call_output: object({
      id: identifier,
      call_id: identifier,
      output: RESPONSES_CONTENT,
      status: identifier,
    }),
    custom_tool_call_output: object({
      id: identifier,
      call_id: identifier,
      output: RESPONSES_CONTENT,
      status: identifier,
    }),
    additional_tools: object({ role: identifier, tools: array(RESPONSES_TOOL) }),
    tool_search_call: object({
      call_id: identifier,
      execution: identifier,
      status: identifier,
      arguments: object({ query: data, limit: data }),
    }),
    tool_search_output: object({
      call_id: identifier,
      execution: identifier,
      status: identifier,
      tools: array(RESPONSES_TOOL),
    }),
  },
  variants("role", {
    system: RESPONSES_MESSAGE,
    developer: RESPONSES_MESSAGE,
    user: RESPONSES_MESSAGE,
    assistant: RESPONSES_MESSAGE,
  }),
);
const OPENAI_RESPONSES = object({
  model: identifier,
  input: array(RESPONSES_ITEM),
  instructions: data,
  stream: data,
  store: data,
  prompt_cache_key: data,
  prompt_cache_retention: identifier,
  prompt_cache_options: object({ mode: identifier, ttl: identifier }),
  max_output_tokens: data,
  temperature: data,
  service_tier: identifier,
  tools: array(RESPONSES_TOOL),
  tool_choice: FUNCTION_TOOL_CHOICE,
  parallel_tool_calls: data,
  reasoning: object({ effort: identifier, summary: identifier }),
  include: array(identifier),
  text: object({ verbosity: identifier, format: data }),
  previous_response_id: identifier,
});

const BEDROCK_CACHE_POINT = object({ type: identifier, ttl: identifier });
const BEDROCK_BLOCK: Shape = lazy(() =>
  object({
    text: data,
    image: object({ format: identifier, source: data }),
    document: data,
    video: data,
    toolUse: object({ toolUseId: identifier, name: identifier, input: data }),
    toolResult: object({ toolUseId: identifier, content: array(BEDROCK_BLOCK), status: identifier }),
    reasoningContent: object({ reasoningText: object({ text: data, signature: data }), redactedContent: data }),
    cachePoint: BEDROCK_CACHE_POINT,
  }),
);
const BEDROCK_CONVERSE = object({
  modelId: identifier,
  messages: array(object({ role: identifier, content: array(BEDROCK_BLOCK) })),
  system: array(BEDROCK_BLOCK),
  inferenceConfig: object({ maxTokens: data, temperature: data, topP: data, stopSequences: data }),
  toolConfig: object({
    tools: array(
      object({
        toolSpec: object({
          name: identifier,
          description: data,
          inputSchema: object({ json: JSON_SCHEMA }),
          strict: data,
        }),
        cachePoint: BEDROCK_CACHE_POINT,
      }),
    ),
    toolChoice: object({ auto: data, any: data, tool: object({ name: identifier }) }),
  }),
  additionalModelRequestFields: object({
    thinking: object({ type: identifier, budget_tokens: data, display: identifier }),
    output_config: object({ effort: identifier }),
    anthropic_beta: array(identifier),
  }),
  requestMetadata: data,
});

const GOOGLE_PART: Shape = lazy(() =>
  object({
    text: data,
    thought: data,
    thoughtSignature: data,
    inlineData: object({ mimeType: data, data: data }),
    fileData: object({ mimeType: data, fileUri: data }),
    functionCall: object({ id: identifier, name: identifier, args: data }),
    functionResponse: object({
      id: identifier,
      name: identifier,
      response: object({ output: data, error: data }),
      parts: array(GOOGLE_PART),
    }),
  }),
);
const GOOGLE_GENERATIVE_AI = object({
  model: identifier,
  contents: array(object({ role: identifier, parts: array(GOOGLE_PART) })),
  config: object({
    temperature: data,
    maxOutputTokens: data,
    systemInstruction: data,
    tools: array(
      object({
        functionDeclarations: array(
          object({ name: identifier, description: data, parameters: JSON_SCHEMA, parametersJsonSchema: JSON_SCHEMA }),
        ),
      }),
    ),
    toolConfig: object({
      functionCallingConfig: object({ mode: identifier, allowedFunctionNames: array(identifier) }),
    }),
    thinkingConfig: object({ includeThoughts: data, thinkingLevel: identifier, thinkingBudget: data }),
    abortSignal: data,
  }),
});

const MISTRAL_CHUNK: Shape = lazy(() =>
  variants("type", {
    text: object({ text: data }),
    image_url: object({ imageUrl: oneOf(object({ url: data, detail: identifier }), data) }),
    thinking: object({ thinking: array(MISTRAL_CHUNK) }),
  }),
);
const MISTRAL_CONTENT = textOrBlocks(MISTRAL_CHUNK);
const MISTRAL_MESSAGE = variants("role", {
  system: object({ content: MISTRAL_CONTENT }),
  user: object({ content: MISTRAL_CONTENT }),
  assistant: object({
    content: MISTRAL_CONTENT,
    prefix: data,
    toolCalls: array(
      object({
        id: identifier,
        type: identifier,
        function: object({ name: identifier, arguments: data }),
        index: data,
      }),
    ),
  }),
  tool: object({ content: MISTRAL_CONTENT, toolCallId: identifier, name: identifier }),
});
const MISTRAL_CONVERSATIONS = object({
  model: identifier,
  messages: array(MISTRAL_MESSAGE),
  stream: data,
  temperature: data,
  maxTokens: data,
  toolChoice: FUNCTION_TOOL_CHOICE,
  promptMode: identifier,
  reasoningEffort: identifier,
  promptCacheKey: data,
  tools: array(
    variants("type", {
      function: object({
        function: object({ name: identifier, description: data, parameters: JSON_SCHEMA, strict: data }),
      }),
    }),
  ),
});

// Preserve host field names because the host persists this format and `pi-messages` sends it unchanged.
// Preserve unknown host field names for compatibility, but treat their values as data.
const HOST_FIELDS: RestShape = { names: "keep", shape: data };
const HOST_BLOCK = variants(
  "type",
  {
    text: object({ text: data }, HOST_FIELDS),
    image: object({ data: data, mimeType: data }, HOST_FIELDS),
    thinking: object({ thinking: data, thinkingSignature: data }, HOST_FIELDS),
    toolCall: object({ id: identifier, name: identifier, arguments: data, namespace: identifier }, HOST_FIELDS),
  },
  object({ type: identifier }, HOST_FIELDS),
);
const HOST_CONTENT = textOrBlocks(HOST_BLOCK);
const HOST_USAGE = object({ cost: object({}, HOST_FIELDS) }, HOST_FIELDS);

/**
 * Preserve values the host uses for routing, dispatch, and pairing.
 * These include roles, stop reasons, block types, call ids, tool names, and custom message types.
 * Treat all other fields as data, including provider and model names.
 */
export const HOST_MESSAGE: Shape = variants(
  "role",
  {
    user: object({ content: HOST_CONTENT }, HOST_FIELDS),
    assistant: object({ content: HOST_CONTENT, stopReason: identifier, usage: HOST_USAGE }, HOST_FIELDS),
    toolResult: object(
      { content: HOST_CONTENT, toolCallId: identifier, toolName: identifier, usage: HOST_USAGE },
      HOST_FIELDS,
    ),
    custom: object({ content: HOST_CONTENT, customType: identifier }, HOST_FIELDS),
  },
  object({ role: identifier, content: HOST_CONTENT }, HOST_FIELDS),
);
export const HOST_CONTENT_BLOCKS: Shape = array(HOST_BLOCK);
// Preserve entry types, ids, and timestamps because the host dispatches, links, and parses them.
const HOST_ENTRY_FIELDS = { id: identifier, parentId: identifier, timestamp: identifier };
/**
 * Apply host message rules to message entries and host block rules to custom message entries.
 * Preserve each custom message's extension type.
 *
 * Treat other entries as data except for fields the host uses to link them.
 * This includes compaction and branch summaries.
 */
export const HOST_SESSION_ENTRY: Shape = variants(
  "type",
  {
    message: object({ ...HOST_ENTRY_FIELDS, message: HOST_MESSAGE }, HOST_FIELDS),
    custom_message: object({ ...HOST_ENTRY_FIELDS, customType: identifier, content: HOST_CONTENT }, HOST_FIELDS),
  },
  object(HOST_ENTRY_FIELDS, HOST_FIELDS),
);
const PI_MESSAGES = object({
  model: identifier,
  context: object({
    systemPrompt: data,
    messages: array(HOST_MESSAGE),
    tools: array(object({ name: identifier, description: data, parameters: JSON_SCHEMA, constrainedSampling: data })),
  }),
  options: object({
    temperature: data,
    maxTokens: data,
    reasoning: identifier,
    cacheRetention: identifier,
    sessionId: data,
    toolChoice: FUNCTION_TOOL_CHOICE,
  }),
});

const SHAPES_BY_API: Readonly<Record<string, Shape>> = {
  "anthropic-messages": ANTHROPIC_MESSAGES,
  "openai-completions": OPENAI_COMPLETIONS,
  "openai-responses": OPENAI_RESPONSES,
  "azure-openai-responses": OPENAI_RESPONSES,
  "openai-codex-responses": OPENAI_RESPONSES,
  "bedrock-converse-stream": BEDROCK_CONVERSE,
  "google-generative-ai": GOOGLE_GENERATIVE_AI,
  "google-vertex": GOOGLE_GENERATIVE_AI,
  "mistral-conversations": MISTRAL_CONVERSATIONS,
  "pi-messages": PI_MESSAGES,
};

export function providerShape(api: string | undefined): Shape | undefined {
  return api === undefined ? undefined : SHAPES_BY_API[api];
}
