import {
  WebSearchToolDefinition,
  CalculatorToolDefinition,
  CodeExecutionToolDefinition,
} from '@librechat/agents';

/** Local code execution: Python only, relative paths for files */
const LOCAL_CODE_EXECUTION_DEFINITION: ToolRegistryDefinition = {
  name: 'execute_code',
  description: `Runs Python code locally and returns stdout/stderr output. Each execution is isolated and independent.
- No network access available.
- To deliver files to the user, use workspace_send_file_to_user after saving them.
- Supports Python only. Use print() for outputs; matplotlib: use plt.savefig() to save plots.
- Use relative paths for files (e.g., open('out.txt', 'w'), plt.savefig('plot.png')). Working directory is the session workspace.`,
  schema: {
    type: 'object',
    properties: {
      lang: {
        type: 'string',
        enum: ['py'],
        description: 'The programming language. Local execution supports Python only.',
      },
      code: {
        type: 'string',
        description: `The complete, self-contained Python code to execute.
- Use print() for all outputs.
- Matplotlib: Use plt.savefig() to save plots as files in the working directory.
- Use relative paths for file I/O (e.g., open('out.txt', 'w'), plt.savefig('plot.png')).`,
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional arguments to execute the code with.',
      },
    },
    required: ['lang', 'code'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
  responseFormat: 'content_and_artifact',
};

/** Extended JSON Schema type that includes standard validation keywords */
export type ExtendedJsonSchema = {
  type?: 'string' | 'number' | 'integer' | 'float' | 'boolean' | 'array' | 'object' | 'null';
  enum?: (string | number | boolean | null)[];
  items?: ExtendedJsonSchema;
  properties?: Record<string, ExtendedJsonSchema>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | ExtendedJsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  default?: unknown;
  const?: unknown;
  oneOf?: ExtendedJsonSchema[];
  anyOf?: ExtendedJsonSchema[];
  allOf?: ExtendedJsonSchema[];
  $ref?: string;
  $defs?: Record<string, ExtendedJsonSchema>;
  definitions?: Record<string, ExtendedJsonSchema>;
};

export interface ToolRegistryDefinition {
  name: string;
  description: string;
  schema: ExtendedJsonSchema;
  description_for_model?: string;
  responseFormat?: 'content_and_artifact' | 'content';
  toolType: 'builtin' | 'mcp' | 'action' | 'custom';
}

/** Google Search tool JSON schema */
export const googleSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'The maximum number of search results to return. Defaults to 5.',
    },
  },
  required: ['query'],
};

/** DALL-E 3 tool JSON schema */
export const dalle3Schema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 4000,
      description:
        'A text description of the desired image, following the rules, up to 4000 characters.',
    },
    style: {
      type: 'string',
      enum: ['vivid', 'natural'],
      description:
        'Must be one of `vivid` or `natural`. `vivid` generates hyper-real and dramatic images, `natural` produces more natural, less hyper-real looking images',
    },
    quality: {
      type: 'string',
      enum: ['hd', 'standard'],
      description: 'The quality of the generated image. Only `hd` and `standard` are supported.',
    },
    size: {
      type: 'string',
      enum: ['1024x1024', '1792x1024', '1024x1792'],
      description:
        'The size of the requested image. Use 1024x1024 (square) as the default, 1792x1024 if the user requests a wide image, and 1024x1792 for full-body portraits. Always include this parameter in the request.',
    },
  },
  required: ['prompt', 'style', 'quality', 'size'],
};

/** Flux API tool JSON schema */
export const fluxApiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['generate', 'list_finetunes', 'generate_finetuned'],
      description:
        'Action to perform: "generate" for image generation, "generate_finetuned" for finetuned model generation, "list_finetunes" to get available custom models',
    },
    prompt: {
      type: 'string',
      description:
        'Text prompt for image generation. Required when action is "generate". Not used for list_finetunes.',
    },
    width: {
      type: 'number',
      description:
        'Width of the generated image in pixels. Must be a multiple of 32. Default is 1024.',
    },
    height: {
      type: 'number',
      description:
        'Height of the generated image in pixels. Must be a multiple of 32. Default is 768.',
    },
    prompt_upsampling: {
      type: 'boolean',
      description: 'Whether to perform upsampling on the prompt.',
    },
    steps: {
      type: 'integer',
      description: 'Number of steps to run the model for, a number from 1 to 50. Default is 40.',
    },
    seed: {
      type: 'number',
      description: 'Optional seed for reproducibility.',
    },
    safety_tolerance: {
      type: 'number',
      description:
        'Tolerance level for input and output moderation. Between 0 and 6, 0 being most strict, 6 being least strict.',
    },
    endpoint: {
      type: 'string',
      enum: [
        '/v1/flux-pro-1.1',
        '/v1/flux-pro',
        '/v1/flux-dev',
        '/v1/flux-pro-1.1-ultra',
        '/v1/flux-pro-finetuned',
        '/v1/flux-pro-1.1-ultra-finetuned',
      ],
      description: 'Endpoint to use for image generation.',
    },
    raw: {
      type: 'boolean',
      description:
        'Generate less processed, more natural-looking images. Only works for /v1/flux-pro-1.1-ultra.',
    },
    finetune_id: {
      type: 'string',
      description: 'ID of the finetuned model to use',
    },
    finetune_strength: {
      type: 'number',
      description: 'Strength of the finetuning effect (typically between 0.1 and 1.2)',
    },
    guidance: {
      type: 'number',
      description: 'Guidance scale for finetuned models',
    },
    aspect_ratio: {
      type: 'string',
      description: 'Aspect ratio for ultra models (e.g., "16:9")',
    },
  },
  required: [],
};

/** OpenWeather tool JSON schema */
export const openWeatherSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['help', 'current_forecast', 'timestamp', 'daily_aggregation', 'overview'],
      description: 'The action to perform',
    },
    city: {
      type: 'string',
      description: 'City name for geocoding if lat/lon not provided',
    },
    lat: {
      type: 'number',
      description: 'Latitude coordinate',
    },
    lon: {
      type: 'number',
      description: 'Longitude coordinate',
    },
    exclude: {
      type: 'string',
      description: 'Parts to exclude from the response',
    },
    units: {
      type: 'string',
      enum: ['Celsius', 'Kelvin', 'Fahrenheit'],
      description: 'Temperature units',
    },
    lang: {
      type: 'string',
      description: 'Language code',
    },
    date: {
      type: 'string',
      description: 'Date in YYYY-MM-DD format for timestamp and daily_aggregation',
    },
    tz: {
      type: 'string',
      description: 'Timezone',
    },
  },
  required: ['action'],
};

/** Wolfram Alpha tool JSON schema */
export const wolframSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural language query to WolframAlpha following the guidelines',
    },
  },
  required: ['input'],
};

/** Stable Diffusion tool JSON schema */
export const stableDiffusionSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description:
        'Detailed keywords to describe the subject, using at least 7 keywords to accurately describe the image, separated by comma',
    },
    negative_prompt: {
      type: 'string',
      description:
        'Keywords we want to exclude from the final image, using at least 7 keywords to accurately describe the image, separated by comma',
    },
  },
  required: ['prompt', 'negative_prompt'],
};

/** Azure AI Search tool JSON schema */
export const azureAISearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search word or phrase to Azure AI Search',
    },
  },
  required: ['query'],
};

/** Traversaal Search tool JSON schema */
export const traversaalSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A properly written sentence to be interpreted by an AI to search the web according to the user's request.",
    },
  },
  required: ['query'],
};

/** Tavily Search Results tool JSON schema */
export const tavilySearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    max_results: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'The maximum number of search results to return. Defaults to 5.',
    },
    search_depth: {
      type: 'string',
      enum: ['basic', 'advanced'],
      description:
        'The depth of the search, affecting result quality and response time (`basic` or `advanced`). Default is basic for quick results and advanced for indepth high quality results but longer response time. Advanced calls equals 2 requests.',
    },
    include_images: {
      type: 'boolean',
      description:
        'Whether to include a list of query-related images in the response. Default is False.',
    },
    include_answer: {
      type: 'boolean',
      description: 'Whether to include answers in the search results. Default is False.',
    },
    include_raw_content: {
      type: 'boolean',
      description: 'Whether to include raw content in the search results. Default is False.',
    },
    include_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically include in the search results.',
    },
    exclude_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of domains to specifically exclude from the search results.',
    },
    topic: {
      type: 'string',
      enum: ['general', 'news', 'finance'],
      description:
        'The category of the search. Use news ONLY if query SPECIFCALLY mentions the word "news".',
    },
    time_range: {
      type: 'string',
      enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'],
      description: 'The time range back from the current date to filter results.',
    },
    days: {
      type: 'number',
      minimum: 1,
      description: 'Number of days back from the current date to include. Only if topic is news.',
    },
    include_image_descriptions: {
      type: 'boolean',
      description:
        'When include_images is true, also add a descriptive text for each image. Default is false.',
    },
  },
  required: ['query'],
};

/** Postmark Send User Email tool JSON schema */
export const sendUserEmailSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'Email subject line.',
    },
    body: {
      type: 'string',
      description: 'Body of the email. Supports markdown (headers, lists, code blocks, links).',
    },
    html_body: {
      type: 'string',
      description:
        'Deprecated. Ignored when formatting is applied. HTML and plain text are generated from body.',
    },
    from: {
      type: 'string',
      description:
        'Optional sender address override. Must be a registered Postmark sender. Defaults to env.',
    },
  },
  required: ['subject', 'body'],
};

/** CRM tool JSON schemas */
export const crmListPipelinesSchema: ExtendedJsonSchema = { type: 'object', properties: {} };
export const crmCreatePipelineSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Pipeline name' },
    stages: { type: 'array', items: { type: 'string' }, description: 'Stage names in order' },
    isDefault: { type: 'boolean', description: 'Set as default pipeline for new deals' },
  },
  required: ['name', 'stages'],
};
export const crmUpdatePipelineSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    pipelineId: { type: 'string', description: 'Pipeline ID' },
    name: { type: 'string' },
    stages: { type: 'array', items: { type: 'string' } },
    isDefault: { type: 'boolean' },
  },
  required: ['pipelineId'],
};
export const crmSoftDeletePipelineSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: { pipelineId: { type: 'string' } },
  required: ['pipelineId'],
};
export const crmCreateContactSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Contact name' },
    email: { type: 'string' },
    phone: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    source: { type: 'string' },
    status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
    organizationId: { type: 'string' },
    customFields: {
      type: 'object',
      description: 'Additional key-value pairs (e.g. "Farm Size": "240 acres", "Policy Type": "Health")',
    },
  },
  required: ['name'],
};
export const crmUpdateContactSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    contactId: { type: 'string', description: 'Contact ID' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    source: { type: 'string' },
    status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
    organizationId: { type: 'string' },
    customFields: {
      type: 'object',
      description: 'Additional key-value pairs (e.g. "Farm Size": "240 acres")',
    },
  },
  required: ['contactId'],
};
export const crmGetContactSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    contactId: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
  },
};
export const crmListContactsSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
    tags: { type: 'array', items: { type: 'string' } },
    noActivitySinceDays: { type: 'number' },
    query: {
      type: 'string',
      description: 'Search by name or email (case-insensitive partial match)',
    },
    limit: { type: 'number' },
    skip: { type: 'number' },
  },
};
export const crmSoftDeleteContactSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: { contactId: { type: 'string' } },
  required: ['contactId'],
};
export const crmCreateOrganizationSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Organization name' },
    domain: { type: 'string' },
    metadata: { type: 'object' },
    customFields: {
      type: 'object',
      description: 'Additional key-value pairs (e.g. "Industry": "Agriculture", "Employee Count": 50)',
    },
  },
  required: ['name'],
};
export const crmSoftDeleteOrganizationSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: { organizationId: { type: 'string' } },
  required: ['organizationId'],
};
export const crmGetOrganizationSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    organizationId: {
      type: 'string',
      description:
        'Organization ID. Use the _id or id returned from crm_create_organization when calling by ID.',
    },
    name: { type: 'string', description: 'Organization name (exact match, case-insensitive)' },
  },
};
export const crmListOrganizationsSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search by organization name (case-insensitive partial match)',
    },
    limit: { type: 'number' },
    skip: { type: 'number' },
  },
};
export const crmCreateDealSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    pipelineId: { type: 'string' },
    stage: { type: 'string', description: 'Stage name from pipeline' },
    title: {
      type: 'string',
      description: 'Human-readable deal title (e.g. "Farm Liability & Property Insurance Package"). Defaults to "Untitled Deal" if omitted.',
    },
    description: { type: 'string', description: 'Additional context or notes for the deal' },
    contactId: { type: 'string' },
    organizationId: { type: 'string' },
    value: { type: 'number' },
    expectedCloseDate: { type: 'string' },
    probability: { type: 'number', description: 'Win probability 0-100%' },
    customFields: {
      type: 'object',
      description: 'Additional key-value pairs (e.g. "Product": "Enterprise Plan")',
    },
  },
  required: ['stage'],
};
export const crmUpdateDealSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    dealId: { type: 'string' },
    stage: { type: 'string' },
    title: { type: 'string', description: 'Human-readable deal title' },
    description: { type: 'string', description: 'Additional context or notes' },
    contactId: { type: 'string' },
    organizationId: { type: 'string' },
    value: { type: 'number' },
    expectedCloseDate: { type: 'string' },
    probability: { type: 'number', description: 'Win probability 0-100%' },
    customFields: {
      type: 'object',
      description: 'Additional key-value pairs',
    },
  },
  required: ['dealId'],
};
export const crmListDealsSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    pipelineId: { type: 'string' },
    stage: { type: 'string' },
    contactId: { type: 'string' },
    query: {
      type: 'string',
      description: 'Search by deal title or description (case-insensitive partial match)',
    },
    limit: { type: 'number' },
    skip: { type: 'number' },
  },
};
export const crmSoftDeleteDealSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: { dealId: { type: 'string' } },
  required: ['dealId'],
};
export const crmLogActivitySchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    contactId: { type: 'string' },
    dealId: { type: 'string' },
    type: {
      type: 'string',
      enum: ['email_sent', 'email_received', 'call_logged', 'agent_action', 'doc_matched', 'stage_change'],
    },
    summary: { type: 'string' },
    metadata: { type: 'object' },
    dueDate: { type: 'string', description: 'When the activity/task is due (ISO date)' },
    status: { type: 'string', description: 'e.g. pending, completed, cancelled' },
    priority: { type: 'string', description: 'e.g. low, medium, high, urgent' },
    assignedUserId: { type: 'string', description: 'User ID for follow-up assignment' },
  },
  required: ['type'],
};
export const crmListActivitiesSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    contactId: { type: 'string' },
    dealId: { type: 'string' },
    limit: { type: 'number' },
    skip: { type: 'number' },
  },
};

/** File Search tool JSON schema */
export const fileSearchSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching against the file contents.",
    },
  },
  required: ['query'],
};

/** OpenAI Image Generation tool JSON schema */
export const imageGenOaiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description: `Describe the image you want in detail. 
      Be highly specific—break your idea into layers: 
      (1) main concept and subject,
      (2) composition and position,
      (3) lighting and mood,
      (4) style, medium, or camera details,
      (5) important features (age, expression, clothing, etc.),
      (6) background.
      Use positive, descriptive language and specify what should be included, not what to avoid. 
      List number and characteristics of people/objects, and mention style/technical requirements (e.g., "DSLR photo, 85mm lens, golden hour").
      Do not reference any uploaded images—use for new image creation from text only.`,
    },
    background: {
      type: 'string',
      enum: ['transparent', 'opaque', 'auto'],
      description:
        'Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.',
    },
    quality: {
      type: 'string',
      enum: ['auto', 'high', 'medium', 'low'],
      description: 'The quality of the image. One of auto (default), high, medium, or low.',
    },
    size: {
      type: 'string',
      enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
      description:
        'The size of the generated image. One of 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).',
    },
  },
  required: ['prompt'],
};

/** OpenAI Image Edit tool JSON schema */
export const imageEditOaiSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    image_ids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: `IDs (image ID strings) of previously generated or uploaded images that should guide the edit.

Guidelines:
- If the user's request depends on any prior image(s), copy their image IDs into the \`image_ids\` array (in the same order the user refers to them).  
- Never invent or hallucinate IDs; only use IDs that are still visible in the conversation context.
- If no earlier image is relevant, omit the field entirely.`,
    },
    prompt: {
      type: 'string',
      maxLength: 32000,
      description: `Describe the changes, enhancements, or new ideas to apply to the uploaded image(s).
      Be highly specific—break your request into layers: 
      (1) main concept or transformation,
      (2) specific edits/replacements or composition guidance,
      (3) desired style, mood, or technique,
      (4) features/items to keep, change, or add (such as objects, people, clothing, lighting, etc.).
      Use positive, descriptive language and clarify what should be included or changed, not what to avoid.
      Always base this prompt on the most recently uploaded reference images.`,
    },
    quality: {
      type: 'string',
      enum: ['auto', 'high', 'medium', 'low'],
      description:
        'The quality of the image. One of auto (default), high, medium, or low. High/medium/low only supported for gpt-image-1.',
    },
    size: {
      type: 'string',
      enum: ['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512'],
      description:
        'The size of the generated images. For gpt-image-1: auto (default), 1024x1024, 1536x1024, 1024x1536. For dall-e-2: 256x256, 512x512, 1024x1024.',
    },
  },
  required: ['image_ids', 'prompt'],
};

/** Gemini Image Generation tool JSON schema */
export const geminiImageGenSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description:
        'A detailed text description of the desired image, up to 32000 characters. For "editing" requests, describe the changes you want to make to the referenced image. Be specific about composition, style, lighting, and subject matter.',
    },
    image_ids: {
      type: 'array',
      items: { type: 'string' },
      description: `Optional array of image IDs to use as visual context for generation.

Guidelines:
- For "editing" requests: ALWAYS include the image ID being "edited"
- For new generation with context: Include any relevant reference image IDs
- If the user's request references any prior images, include their image IDs in this array
- These images will be used as visual context/inspiration for the new generation
- Never invent or hallucinate IDs; only use IDs that are visible in the conversation
- If no images are relevant, omit this field entirely`,
    },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      description:
        'The aspect ratio of the generated image. Use 16:9 or 3:2 for landscape, 9:16 or 2:3 for portrait, 21:9 for ultra-wide/cinematic, 1:1 for square. Defaults to 1:1 if not specified.',
    },
    imageSize: {
      type: 'string',
      enum: ['1K', '2K', '4K'],
      description:
        'The resolution of the generated image. Use 1K for standard, 2K for high, 4K for maximum quality. Defaults to 1K if not specified.',
    },
  },
  required: ['prompt'],
};

/** Tool definitions registry - maps tool names to their definitions */
export const toolDefinitions: Record<string, ToolRegistryDefinition> = {
  google: {
    name: 'google',
    description:
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.',
    schema: googleSearchSchema,
    toolType: 'builtin',
  },
  dalle: {
    name: 'dalle',
    description: `Use DALLE to create images from text descriptions.
    - It requires prompts to be in English, detailed, and to specify image type and human features for diversity.
    - Create only one image, without repeating or listing descriptions outside the "prompts" field.
    - Maintains the original intent of the description, with parameters for image style, quality, and size to tailor the output.`,
    schema: dalle3Schema,
    toolType: 'builtin',
  },
  flux: {
    name: 'flux',
    description:
      'Use Flux to generate images from text descriptions. This tool can generate images and list available finetunes. Each generate call creates one image. For multiple images, make multiple consecutive calls.',
    schema: fluxApiSchema,
    toolType: 'builtin',
  },
  open_weather: {
    name: 'open_weather',
    description:
      'Provides weather data from OpenWeather One Call API 3.0. Actions: help, current_forecast, timestamp, daily_aggregation, overview. If lat/lon not provided, specify "city" for geocoding. Units: "Celsius", "Kelvin", or "Fahrenheit" (default: Celsius). For timestamp action, use "date" in YYYY-MM-DD format.',
    schema: openWeatherSchema,
    toolType: 'builtin',
  },
  wolfram: {
    name: 'wolfram',
    description:
      'WolframAlpha offers computation, math, curated knowledge, and real-time data. It handles natural language queries and performs complex calculations. Follow the guidelines to get the best results.',
    schema: wolframSchema,
    toolType: 'builtin',
  },
  'stable-diffusion': {
    name: 'stable-diffusion',
    description:
      "You can generate images using text with 'stable-diffusion'. This tool is exclusively for visual content.",
    schema: stableDiffusionSchema,
    toolType: 'builtin',
  },
  'azure-ai-search': {
    name: 'azure-ai-search',
    description: "Use the 'azure-ai-search' tool to retrieve search results relevant to your input",
    schema: azureAISearchSchema,
    toolType: 'builtin',
  },
  traversaal_search: {
    name: 'traversaal_search',
    description:
      'An AI search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events. Input should be a search query.',
    schema: traversaalSearchSchema,
    toolType: 'builtin',
  },
  tavily_search_results_json: {
    name: 'tavily_search_results_json',
    description:
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.',
    schema: tavilySearchSchema,
    toolType: 'builtin',
  },
  send_user_email: {
    name: 'send_user_email',
    description:
      'Send an email to the current user via Postmark. Use when the user wants to receive an email (summary, report, reminder, etc.). The email is always sent to the logged-in user\'s address. Provide subject and body. Optional HTML body. Do NOT ask for recipient—it is determined automatically.',
    schema: sendUserEmailSchema,
    toolType: 'builtin',
  },
  crm_list_pipelines: {
    name: 'crm_list_pipelines',
    description: 'List all CRM pipelines. Returns id, name, stages, isDefault.',
    schema: crmListPipelinesSchema,
    toolType: 'builtin',
  },
  crm_create_pipeline: {
    name: 'crm_create_pipeline',
    description:
      'Create a CRM pipeline. Required: name, stages (array of stage names). Optional: isDefault.',
    schema: crmCreatePipelineSchema,
    toolType: 'builtin',
  },
  crm_update_pipeline: {
    name: 'crm_update_pipeline',
    description: 'Update a pipeline. Required: pipelineId. Optional: name, stages, isDefault.',
    schema: crmUpdatePipelineSchema,
    toolType: 'builtin',
  },
  crm_soft_delete_pipeline: {
    name: 'crm_soft_delete_pipeline',
    description: 'Soft delete a pipeline. Required: pipelineId. Fails if deals exist.',
    schema: crmSoftDeletePipelineSchema,
    toolType: 'builtin',
  },
  crm_create_contact: {
    name: 'crm_create_contact',
    description:
      'Create a new CRM contact. Required: name. Optional: email, phone, tags, source, status (lead|prospect|customer), organizationId.',
    schema: crmCreateContactSchema,
    toolType: 'builtin',
  },
  crm_update_contact: {
    name: 'crm_update_contact',
    description:
      'Update an existing contact. Required: contactId. Optional: name, email, phone, tags, source, status, organizationId.',
    schema: crmUpdateContactSchema,
    toolType: 'builtin',
  },
  crm_get_contact: {
    name: 'crm_get_contact',
    description: 'Get a contact by ID, email, or name (fuzzy). Provide contactId, email, OR name.',
    schema: crmGetContactSchema,
    toolType: 'builtin',
  },
  crm_list_contacts: {
    name: 'crm_list_contacts',
    description:
      'List contacts with optional filters. Use noActivitySinceDays to find leads with no follow-up. Optional: status, tags, noActivitySinceDays, limit, skip.',
    schema: crmListContactsSchema,
    toolType: 'builtin',
  },
  crm_soft_delete_contact: {
    name: 'crm_soft_delete_contact',
    description: 'Soft delete a contact. Required: contactId.',
    schema: crmSoftDeleteContactSchema,
    toolType: 'builtin',
  },
  crm_create_organization: {
    name: 'crm_create_organization',
    description: 'Create an organization (company). Required: name. Optional: domain, metadata.',
    schema: crmCreateOrganizationSchema,
    toolType: 'builtin',
  },
  crm_get_organization: {
    name: 'crm_get_organization',
    description:
      'Get an organization by ID or name. Provide organizationId OR name (exact match, case-insensitive).',
    schema: crmGetOrganizationSchema,
    toolType: 'builtin',
  },
  crm_list_organizations: {
    name: 'crm_list_organizations',
    description: 'List organizations. Optional: limit, skip.',
    schema: crmListOrganizationsSchema,
    toolType: 'builtin',
  },
  crm_soft_delete_organization: {
    name: 'crm_soft_delete_organization',
    description: 'Soft delete an organization. Required: organizationId.',
    schema: crmSoftDeleteOrganizationSchema,
    toolType: 'builtin',
  },
  crm_create_deal: {
    name: 'crm_create_deal',
    description:
      'Create a deal. Required: pipelineId (or use default), stage. Optional: contactId, organizationId, value, expectedCloseDate.',
    schema: crmCreateDealSchema,
    toolType: 'builtin',
  },
  crm_update_deal: {
    name: 'crm_update_deal',
    description:
      'Update a deal. Required: dealId. Optional: stage, contactId, organizationId, value, expectedCloseDate.',
    schema: crmUpdateDealSchema,
    toolType: 'builtin',
  },
  crm_list_deals: {
    name: 'crm_list_deals',
    description: 'List deals. Optional: pipelineId, stage, contactId, limit, skip.',
    schema: crmListDealsSchema,
    toolType: 'builtin',
  },
  crm_soft_delete_deal: {
    name: 'crm_soft_delete_deal',
    description: 'Soft delete a deal. Required: dealId.',
    schema: crmSoftDeleteDealSchema,
    toolType: 'builtin',
  },
  crm_log_activity: {
    name: 'crm_log_activity',
    description:
      'Log an activity (e.g. call_logged, email_sent). Required: type, contactId or dealId. Optional: summary, metadata. Types: email_sent, email_received, call_logged, agent_action, doc_matched, stage_change.',
    schema: crmLogActivitySchema,
    toolType: 'builtin',
  },
  crm_list_activities: {
    name: 'crm_list_activities',
    description: 'List activities for a contact or deal. Provide contactId OR dealId. Optional: limit, skip.',
    schema: crmListActivitiesSchema,
    toolType: 'builtin',
  },
  human_list_workspace_members: {
    name: 'human_list_workspace_members',
    description:
      'List all members in the current user\'s workspace. Returns id, email, name, username, role for each member.',
    schema: { type: 'object', properties: {}, required: [] },
    toolType: 'builtin',
  },
  human_routing_rules_list: {
    name: 'human_routing_rules_list',
    description:
      'List routing rules for the workspace: who handles what (e.g. commercial auto → Chris).',
    schema: { type: 'object', properties: {}, required: [] },
    toolType: 'builtin',
  },
  human_routing_rules_set: {
    name: 'human_routing_rules_set',
    description:
      'Create or update a routing rule. Required: trigger, recipient. Optional: instructions.',
    schema: {
      type: 'object',
      properties: {
        trigger: { type: 'string', description: 'Topic/trigger (e.g. "commercial auto")' },
        recipient: { type: 'string', description: 'User ID of the workspace member who handles this' },
        instructions: { type: 'string', description: 'Optional instructions for the human' },
      },
      required: ['trigger', 'recipient'],
    },
    toolType: 'builtin',
  },
  human_routing_rules_delete: {
    name: 'human_routing_rules_delete',
    description: 'Remove a routing rule by trigger.',
    schema: {
      type: 'object',
      properties: {
        trigger: { type: 'string', description: 'Topic/trigger to remove' },
      },
      required: ['trigger'],
    },
    toolType: 'builtin',
  },
  human_notify_human: {
    name: 'human_notify_human',
    description:
      'Send a notification to a workspace member (FYI, no approval needed). Required: memberId, message. Optional: context. Use this only when you do NOT need to wait for approval—if you need approval, use human_await_response instead (it sends the notification).',
    schema: {
      type: 'object',
      properties: {
        memberId: { type: 'string', description: 'User ID of the workspace member to notify' },
        message: { type: 'string', description: 'The notification message' },
        context: { type: 'string', description: 'Additional context for the human' },
      },
      required: ['memberId', 'message'],
    },
    toolType: 'builtin',
  },
  human_await_response: {
    name: 'human_await_response',
    description:
      'Block until a human approves. Sends them an approval email—do NOT call human_notify_human first. Use memberId to route to a specific workspace member; omit for conversation owner to approve inline. Optional: message (context shown in approval request).',
    schema: {
      type: 'object',
      properties: {
        memberId: { type: 'string', description: 'User ID of the member who should respond' },
        message: { type: 'string', description: 'Instruction or context for the human' },
      },
      required: [],
    },
    toolType: 'builtin',
  },
  human_invite_to_workspace: {
    name: 'human_invite_to_workspace',
    description:
      'Invite a user to the workspace by email. Only workspace admins can invite. If you get an error that you are not an admin, use human_notify_human to ask the workspace admin (adminMemberId) to invite them. Required: email.',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the user to invite' },
      },
      required: ['email'],
    },
    toolType: 'builtin',
  },
  human_remove_from_workspace: {
    name: 'human_remove_from_workspace',
    description:
      'Remove a member from the workspace. Only workspace admins can remove. Cannot remove yourself. Required: memberId (user ID from human_list_workspace_members).',
    schema: {
      type: 'object',
      properties: {
        memberId: { type: 'string', description: 'User ID of the workspace member to remove' },
      },
      required: ['memberId'],
    },
    toolType: 'builtin',
  },
  project_section_update: {
    name: 'project_section_update',
    description:
      'Create or replace a project context section. Use to add or update sections (e.g. overview, tasks). Format: # Title (id=sectionId) + content. Required: sectionId, title. Optional: content (defaults to empty).',
    schema: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
        title: { type: 'string', description: 'Section title for display' },
        content: { type: 'string', description: 'Section content (markdown). Optional, defaults to empty string.' },
      },
      required: ['sectionId', 'title'],
    },
    toolType: 'builtin',
  },
  project_section_delete: {
    name: 'project_section_delete',
    description: 'Remove a project context section by sectionId. Required: sectionId.',
    schema: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID to remove (e.g. overview, tasks)' },
      },
      required: ['sectionId'],
    },
    toolType: 'builtin',
  },
  project_section_patch: {
    name: 'project_section_patch',
    description:
      'Batch update project context sections in one call. Upsert multiple sections and optionally delete others. Use to build or replace the full context in one shot. At least one of sections or deleteIds is required.',
    schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          description: 'Sections to create or update. Each: { sectionId, title, content }',
          items: {
            type: 'object',
            properties: {
              sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
              title: { type: 'string', description: 'Section title' },
              content: { type: 'string', description: 'Section content (markdown)' },
            },
            required: ['sectionId', 'title', 'content'],
          },
        },
        deleteIds: {
          type: 'array',
          description: 'Section IDs to remove',
          items: { type: 'string' },
        },
      },
    },
    toolType: 'builtin',
  },
  project_log: {
    name: 'project_log',
    description:
      'Appends an entry to the project changelog. Append-only log for history. Never injected automatically. Required: entry.',
    schema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'The log entry to append' } },
      required: ['entry'],
    },
    toolType: 'builtin',
  },
  project_log_tail: {
    name: 'project_log_tail',
    description: 'Returns the last n entries from the project changelog. Optional: n (default 10, max 100).',
    schema: {
      type: 'object',
      properties: { n: { type: 'number', description: 'Number of entries to return' } },
    },
    toolType: 'builtin',
  },
  project_log_search: {
    name: 'project_log_search',
    description: 'Search the project changelog by keyword. Required: query. Optional: limit.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keyword)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
      required: ['query'],
    },
    toolType: 'builtin',
  },
  project_log_range: {
    name: 'project_log_range',
    description:
      'Returns changelog entries between two timestamps. Required: from, to (ISO date strings). Optional: limit.',
    schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start timestamp (ISO date)' },
        to: { type: 'string', description: 'End timestamp (ISO date)' },
        limit: { type: 'number', description: 'Max entries to return (default 100)' },
      },
      required: ['from', 'to'],
    },
    toolType: 'builtin',
  },
  project_create: {
    name: 'project_create',
    description:
      'Create a new project. Required: name. Optional: description, tags[], sharedWithWorkspace (workspace admin only), templateProjectId (copy sections from template). If sharedWithWorkspace and you are not a workspace admin, use human_notify_human to ask the admin (adminMemberId) to create a shared project.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Project description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the project',
        },
        sharedWithWorkspace: {
          type: 'boolean',
          description: 'If true, create a workspace-shared project (workspace admin only)',
        },
        templateProjectId: {
          type: 'string',
          description: 'Copy context sections from this project',
        },
      },
      required: ['name'],
    },
    toolType: 'builtin',
  },
  project_list: {
    name: 'project_list',
    description:
      'List projects the user can access (own and workspace-shared). Optional: limit (default 25), cursor, status (active|archived|all). Returns projectId, name, description, tags, owner, shared, lastUpdated.',
    schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max projects to return (default 25)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'all'],
          description: 'Filter by status (default active)',
        },
      },
    },
    toolType: 'builtin',
  },
  project_archive: {
    name: 'project_archive',
    description:
      'Archive a project (soft delete). Only owner or workspace admin can archive. Required: projectId.',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to archive' },
      },
      required: ['projectId'],
    },
    toolType: 'builtin',
  },
  project_update_metadata: {
    name: 'project_update_metadata',
    description:
      'Update project metadata. Required: projectId. Optional: name, description, tags[], ownerId (workspace admin only, shared projects).',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to update' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New project description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags (replaces existing)',
        },
        ownerId: { type: 'string', description: 'New owner user ID' },
      },
      required: ['projectId'],
    },
    toolType: 'builtin',
  },
  project_switch: {
    name: 'project_switch',
    description:
      'Assign a project to this conversation. Required: projectId (use project_list to get IDs). Pass null to clear the project.',
    schema: {
      type: 'object',
      properties: {
        projectId: {
          oneOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Project ID to assign, or null to clear',
        },
      },
      required: ['projectId'],
    },
    toolType: 'builtin',
  },
  file_search: {
    name: 'file_search',
    description:
      'Performs semantic search across attached "file_search" documents using natural language queries. This tool analyzes the content of uploaded files to find relevant information, quotes, and passages that best match your query.',
    schema: fileSearchSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  image_gen_oai: {
    name: 'image_gen_oai',
    description: `Generates high-quality, original images based solely on text, not using any uploaded reference images.

When to use \`image_gen_oai\`:
- To create entirely new images from detailed text descriptions that do NOT reference any image files.

When NOT to use \`image_gen_oai\`:
- If the user has uploaded any images and requests modifications, enhancements, or remixing based on those uploads → use \`image_edit_oai\` instead.

Generated image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.`,
    schema: imageGenOaiSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  image_edit_oai: {
    name: 'image_edit_oai',
    description: `Generates high-quality, original images based on text and one or more uploaded/referenced images.

When to use \`image_edit_oai\`:
- The user wants to modify, extend, or remix one **or more** uploaded images, either:
- Previously generated, or in the current request (both to be included in the \`image_ids\` array).
- Always when the user refers to uploaded images for editing, enhancement, remixing, style transfer, or combining elements.
- Any current or existing images are to be used as visual guides.
- If there are any files in the current request, they are more likely than not expected as references for image edit requests.

When NOT to use \`image_edit_oai\`:
- Brand-new generations that do not rely on an existing image → use \`image_gen_oai\` instead.

Both generated and referenced image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.`,
    schema: imageEditOaiSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
  gemini_image_gen: {
    name: 'gemini_image_gen',
    description: `Generates high-quality, original images based on text prompts, with optional image context.

When to use \`gemini_image_gen\`:
- To create entirely new images from detailed text descriptions
- To generate images using existing images as context or inspiration
- When the user requests image generation, creation, or asks to "generate an image"
- When the user asks to "edit", "modify", "change", or "swap" elements in an image (generates new image with changes)

When NOT to use \`gemini_image_gen\`:
- For uploading or saving existing images without modification

Generated image IDs will be returned in the response, so you can refer to them in future requests.`,
    schema: geminiImageGenSchema,
    toolType: 'builtin',
    responseFormat: 'content_and_artifact',
  },
};

/** Workspace code edit tools - use conversation-scoped workspace derived at runtime */
const readFileDefinition: ToolRegistryDefinition = {
  name: 'workspace_read_file',
  description:
    'Read file contents from workspace. Path is relative to workspace root. Use when: inspecting a file, verifying edits, or reading a specific section. Optionally use start_line and end_line (1-based, inclusive) to read a range—helps with large files.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to workspace root',
      },
      start_line: {
        type: 'number',
        description: '1-based start line (inclusive). Both inclusive. Omit both for full file. Provide both together for a range, or omit both.',
      },
      end_line: {
        type: 'number',
        description: '1-based end line (inclusive). Provide both with start_line for a range; for single line use start_line = end_line.',
      },
    },
    required: ['path'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const editFileDefinition: ToolRegistryDefinition = {
  name: 'workspace_edit_file',
  description:
    'Edit a file in the workspace. Replace exact old_string with new_string. Use for fixing lint errors: read file, apply edits per lint output. old_string must match exactly once. Fails if old_string appears 0 or 2+ times; use search_user_files first to verify. Whitespace must match exactly.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to workspace root',
      },
      old_string: {
        type: 'string',
        description: 'Exact substring to replace (must appear exactly once)',
      },
      new_string: {
        type: 'string',
        description: 'Replacement string',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const createFileDefinition: ToolRegistryDefinition = {
  name: 'workspace_create_file',
  description:
    'Create or overwrite a file in the workspace. Overwrites if file exists. Parent directories created if needed.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to workspace root',
      },
      content: {
        type: 'string',
        description: 'File content',
      },
    },
    required: ['path', 'content'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const deleteFileDefinition: ToolRegistryDefinition = {
  name: 'workspace_delete_file',
  description:
    'Delete a file from the workspace. Permanent. Prefer for temporary/scratch files; confirm path before deleting. Path is relative to workspace root.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to workspace root',
      },
    },
    required: ['path'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const listFilesDefinition: ToolRegistryDefinition = {
  name: 'workspace_list_files',
  description:
    'List files and subdirectories in a workspace directory. Use when: exploring a known path; use workspace_glob_files when you need pattern-based discovery (e.g. *.py).',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Directory path relative to workspace root. Use "." for root (default: ".")',
      },
      extension: {
        type: 'string',
        description: 'Extension without leading dot (e.g. "py" means *.py)',
      },
    },
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const searchFilesDefinition: ToolRegistryDefinition = {
  name: 'search_user_files',
  description:
    'Search file contents in the user files for a pattern. Returns path:line: content per match. Use when: finding definitions, usages, references, or debugging. Supports literal (default) or regex (use_regex=true), context_lines for surrounding lines, case_sensitive. With context_lines > 0, output includes path:line blocks separated by ---.',
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (literal or regex when use_regex=true)',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search (default: ".")',
      },
      extension: {
        type: 'string',
        description: 'Extension without leading dot (e.g. "py" means *.py)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum matches to return (default: 50)',
      },
      use_regex: {
        type: 'boolean',
        description: 'Treat pattern as regex (default: false)',
      },
      context_lines: {
        type: 'number',
        description:
          'Lines before/after each match. Output format: path:line: content per line, with --- between match blocks (default: 0)',
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Case-sensitive match (default: true)',
      },
    },
    required: ['pattern'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const globFilesDefinition: ToolRegistryDefinition = {
  name: 'workspace_glob_files',
  description:
    'Find files in the workspace matching a glob pattern (e.g. *.py, src/**/*.ts). Use when: discovering files by pattern (all tests, configs, etc.). Prefer over workspace_list_files when you need pattern matching across subdirectories. Path: directory to search (default "."). Results limited to max_results (default 200).',
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g. "*.py", "src/**/*.ts")',
      },
      path: {
        type: 'string',
        description: 'Directory to search (default: ".")',
      },
      max_results: {
        type: 'number',
        description: 'Maximum files to return (default: 200)',
      },
    },
    required: ['pattern'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const sendFileToUserDefinition: ToolRegistryDefinition = {
  name: 'workspace_send_file_to_user',
  description:
    'Send one or more files from the workspace to the user. Files are displayed in the chat and saved for download. Use after execute_code creates files (e.g. plots, CSVs) that the user should see. Paths are relative to workspace root.',
  schema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths relative to workspace root (e.g. ["output.csv", "chart.png"])',
        minItems: 1,
      },
    },
    required: ['paths'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
  responseFormat: 'content_and_artifact',
};

const pullFileToWorkspaceDefinition: ToolRegistryDefinition = {
  name: 'workspace_pull_file',
  description:
    "Copy a file from the user's My Files into the workspace. Provide file_id OR filename (e.g. 'contacts_2024.json'). No embeddings—direct lookup by name. Use list_my_files to discover files. After pulling, use workspace_read_file or execute_code.",
  schema: {
    type: 'object',
    description: 'At least one of file_id or filename is required.',
    properties: {
      file_id: {
        type: 'string',
        description: 'File ID (optional if filename provided)',
      },
      filename: {
        type: 'string',
        description: 'Exact or partial filename (e.g. "contacts_2024.json")',
      },
    },
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const listMyFilesDefinition: ToolRegistryDefinition = {
  name: 'list_my_files',
  description:
    "List files in the user's My Files. Optional filename_filter for partial match (e.g. 'contacts' for contacts_*.json). Returns file_id + filename. Use workspace_pull_file to copy into workspace. No embeddings.",
  schema: {
    type: 'object',
    properties: {
      filename_filter: {
        type: 'string',
        description: 'Optional: partial filename match. Omit to list recent files.',
      },
    },
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const createPdfDefinition: ToolRegistryDefinition = {
  name: 'create_pdf',
  description:
    'Create an HTML document for viewing and printing. Use when the user needs a document they can preview and print to PDF. Provide valid HTML (optionally with inline CSS). The HTML is saved to the user\'s files. User opens it in the Artifact preview and uses browser Print (Cmd/Ctrl+P) to save as PDF.',
  schema: {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description: 'HTML content. Can include inline CSS in <style> tags.',
      },
      filename: {
        type: 'string',
        description: 'Optional filename (e.g. "report.html"). Defaults to "document.html".',
      },
    },
    required: ['html'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
  responseFormat: 'content_and_artifact',
};

const runToolAndSaveDefinition: ToolRegistryDefinition = {
  name: 'run_tool_and_save',
  description:
    'Run any available tool with given arguments and save the output to a JSON file. Use when the user wants to export data (e.g. CRM contacts, Gmail search results, Google Tasks) to a file without the raw data passing through the model. Filename gets a timestamp suffix automatically.',
  schema: {
    type: 'object',
    properties: {
      toolName: {
        type: 'string',
        description:
          'Exact tool name (e.g. "crm_list_contacts", "gmail_search_mcp_Google", "tasks_listTasks_mcp_Google"). Use tool_search to find available tools.',
      },
      args: {
        type: 'object',
        description:
          'Arguments to pass to the tool. Use {} when the tool needs no arguments (e.g. crm_list_contacts).',
      },
      filename: {
        type: 'string',
        description:
          'Optional base filename (e.g. "contacts", "tasks"). Extension and timestamp are added automatically.',
      },
    },
    required: ['toolName'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
  responseFormat: 'content_and_artifact',
};

/** Scheduling tools - used when agent has manage_scheduling capability */
const listSchedulesDefinition: ToolRegistryDefinition = {
  name: 'list_schedules',
  description:
    "List the user's scheduled prompts. Returns schedules with id, name, agentId, prompt, scheduleType, cronExpression, runAt, enabled, timezone, userProjectId.",
  schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const listUserProjectsDefinition: ToolRegistryDefinition = {
  name: 'list_user_projects',
  description:
    "List the user's projects. Use when the user wants to associate a schedule with a project or mentions a project by name. Returns projects with _id and name. Use _id as userProjectId in create_schedule or update_schedule.",
  schema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max number of projects to return (default 50, max 100)',
      },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const createScheduleDefinition: ToolRegistryDefinition = {
  name: 'create_schedule',
  description:
    'Schedule a prompt to run with an agent on a given interval. Infer agentId from the user request. Required: name, agentId (from injected list), prompt (free-text instructions), scheduleType. For recurring: cronExpression. For one-off: runAt (ISO date). Optional: timezone, selectedTools, userProjectId. Use list_user_projects to fetch projects.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Schedule name' },
      agentId: {
        type: 'string',
        description:
          'Agent ID from the injected target list. Infer from user request - NEVER ask the user. Match by name or purpose.',
      },
      prompt: {
        type: 'string',
        description:
          'Free-text prompt/instructions for the agent. Use prompt text from the injected list or compose from user request.',
      },
      scheduleType: {
        type: 'string',
        enum: ['recurring', 'one-off'],
        description: 'recurring uses cron; one-off uses runAt',
      },
      cronExpression: {
        type: 'string',
        description: 'Cron expression (e.g. 0 9 * * * for 9am daily)',
      },
      runAt: { type: 'string', description: 'ISO date for one-off run' },
      timezone: { type: 'string', description: 'Timezone e.g. UTC', default: 'UTC' },
      selectedTools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tool IDs to limit the scheduled run to',
      },
      userProjectId: {
        type: 'string',
        description:
          'Optional UserProject ID to associate the schedule with. Use list_user_projects to fetch available projects.',
      },
    },
    required: ['name', 'agentId', 'prompt', 'scheduleType'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const updateScheduleDefinition: ToolRegistryDefinition = {
  name: 'update_schedule',
  description:
    'Update an existing scheduled prompt. Provide scheduleId and any fields to update: name, agentId, prompt, scheduleType, cronExpression, runAt, enabled, timezone, selectedTools, userProjectId.',
  schema: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', description: 'Schedule ID' },
      name: { type: 'string', description: 'Schedule name' },
      agentId: {
        type: 'string',
        description:
          'Agent ID from the injected target list. Infer from user request when changing agent - NEVER ask. Match by name or purpose.',
      },
      prompt: { type: 'string', description: 'Free-text prompt/instructions for the agent' },
      scheduleType: { type: 'string', enum: ['recurring', 'one-off'] },
      cronExpression: { type: 'string' },
      runAt: { type: 'string' },
      enabled: { type: 'boolean' },
      timezone: { type: 'string' },
      selectedTools: { type: 'array', items: { type: 'string' } },
      userProjectId: {
        type: 'string',
        description:
          'Optional UserProject ID to associate the schedule with. Use list_user_projects to fetch available projects.',
      },
    },
    required: ['scheduleId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const deleteScheduleDefinition: ToolRegistryDefinition = {
  name: 'delete_schedule',
  description: 'Delete a schedule by ID.',
  schema: {
    type: 'object',
    properties: { scheduleId: { type: 'string', description: 'Schedule ID' } },
    required: ['scheduleId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const runScheduleDefinition: ToolRegistryDefinition = {
  name: 'run_schedule',
  description: 'Trigger a schedule run immediately by schedule ID.',
  schema: {
    type: 'object',
    properties: { scheduleId: { type: 'string', description: 'Schedule ID' } },
    required: ['scheduleId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const listRunsDefinition: ToolRegistryDefinition = {
  name: 'list_runs',
  description:
    "List the user's scheduled run history. Optional limit (default 25, max 100).",
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of runs to return' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const getRunDefinition: ToolRegistryDefinition = {
  name: 'get_run',
  description: 'Get a single run by ID, including conversation and messages.',
  schema: {
    type: 'object',
    properties: { runId: { type: 'string', description: 'Run ID' } },
    required: ['runId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const runSubAgentDefinition: ToolRegistryDefinition = {
  name: 'run_sub_agent',
  description:
    'Run one or more sub-agents with prompts. REQUIRED: Call list_agents first to get valid agent IDs. Pass agentId+prompt for a single run, or tasks array (max 2 tasks) to run multiple agents in parallel. Blocks until the sub-agent(s) complete. Returns final text output. Destructive tools are not allowed in sub-agent runs.',
  schema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Agent ID from list_agents (REQUIRED: call list_agents first). Use for single run.',
      },
      prompt: { type: 'string', description: 'Prompt to send to the sub-agent (single run)' },
      selectedTools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: restrict sub-agent to these tools (null = all, [] = none)',
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Agent ID from list_agents' },
            prompt: { type: 'string', description: 'Prompt to send to the sub-agent' },
            selectedTools: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: restrict sub-agent to these tools',
            },
          },
          required: ['agentId', 'prompt'],
        },
        description: 'Run multiple agents in parallel (max 2). Use instead of agentId+prompt for batch.',
      },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const listAgentsDefinition: ToolRegistryDefinition = {
  name: 'list_agents',
  description:
    'List agents you can run. REQUIRED before run_sub_agent—you must call this first to get valid agent IDs. Returns id, name, description for each. Use the agentId from this response when calling run_sub_agent.',
  schema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Filter by name or description' },
      limit: { type: 'number', description: 'Max results (default 25, max 50)' },
      after: { type: 'string', description: 'Pagination cursor from previous response' },
      category: { type: 'string', description: 'Filter by category' },
      promoted: {
        oneOf: [
          { type: 'boolean' },
          { type: 'string', enum: ['0', '1'] },
        ],
        description: 'Filter promoted agents (true/1) or non-promoted (false/0)',
      },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

/** CRM tools - native builtin tools (no MCP) */
const crmListPipelinesDefinition: ToolRegistryDefinition = {
  name: 'crm_list_pipelines',
  description: 'List all CRM pipelines. Returns id, name, stages, isDefault.',
  schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmCreatePipelineDefinition: ToolRegistryDefinition = {
  name: 'crm_create_pipeline',
  description:
    'Create a CRM pipeline. Required: name, stages (array of stage names). Optional: isDefault.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Pipeline name' },
      stages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Stage names in order',
      },
      isDefault: { type: 'boolean', description: 'Set as default pipeline for new deals' },
    },
    required: ['name', 'stages'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmUpdatePipelineDefinition: ToolRegistryDefinition = {
  name: 'crm_update_pipeline',
  description: 'Update a pipeline. Required: pipelineId. Optional: name, stages, isDefault.',
  schema: {
    type: 'object',
    properties: {
      pipelineId: { type: 'string', description: 'Pipeline ID' },
      name: { type: 'string' },
      stages: { type: 'array', items: { type: 'string' } },
      isDefault: { type: 'boolean' },
    },
    required: ['pipelineId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmCreateContactDefinition: ToolRegistryDefinition = {
  name: 'crm_create_contact',
  description:
    'Create a new CRM contact. Required: name. Optional: email, phone, tags, source, status (lead|prospect|customer), organizationId, customFields.',
  schema: crmCreateContactSchema,
  toolType: 'builtin',
};

const crmUpdateContactDefinition: ToolRegistryDefinition = {
  name: 'crm_update_contact',
  description:
    'Update an existing contact. Required: contactId. Optional: name, email, phone, tags, source, status, organizationId, customFields.',
  schema: crmUpdateContactSchema,
  toolType: 'builtin',
};

const crmGetContactDefinition: ToolRegistryDefinition = {
  name: 'crm_get_contact',
  description:
    'Get a contact by ID, email, or name (fuzzy). Provide contactId, email, OR name.',
  schema: {
    type: 'object',
    properties: {
      contactId: { type: 'string', description: 'Contact ID' },
      email: { type: 'string', description: 'Contact email' },
      name: { type: 'string', description: 'Contact name for fuzzy lookup' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmListContactsDefinition: ToolRegistryDefinition = {
  name: 'crm_list_contacts',
  description:
    'List contacts with optional filters. Use noActivitySinceDays to find leads with no follow-up (e.g. 3 for 3 days). Optional: status (lead|prospect|customer), tags, noActivitySinceDays, limit, skip.',
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['lead', 'prospect', 'customer'] },
      tags: { type: 'array', items: { type: 'string' } },
      noActivitySinceDays: {
        type: 'number',
        description: 'Contacts with no activity in last N days',
      },
      limit: { type: 'number' },
      skip: { type: 'number' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmCreateOrganizationDefinition: ToolRegistryDefinition = {
  name: 'crm_create_organization',
  description:
    'Create an organization (company). Required: name. Optional: domain, metadata, customFields.',
  schema: crmCreateOrganizationSchema,
  toolType: 'builtin',
};

const crmGetOrganizationDefinition: ToolRegistryDefinition = {
  name: 'crm_get_organization',
  description:
    'Get an organization by ID or name. Provide organizationId OR name (exact match, case-insensitive). Use the _id or id returned from crm_create_organization when calling by organizationId.',
  schema: crmGetOrganizationSchema,
  toolType: 'builtin',
};

const crmListOrganizationsDefinition: ToolRegistryDefinition = {
  name: 'crm_list_organizations',
  description: 'List organizations. Optional: limit, skip.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number' },
      skip: { type: 'number' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmCreateDealDefinition: ToolRegistryDefinition = {
  name: 'crm_create_deal',
  description:
    'Create a deal. Required: pipelineId (or use default), stage. Optional: title, description, contactId, organizationId, value, expectedCloseDate (ISO), probability (0-100%), customFields.',
  schema: crmCreateDealSchema,
  toolType: 'builtin',
};

const crmUpdateDealDefinition: ToolRegistryDefinition = {
  name: 'crm_update_deal',
  description:
    'Update a deal. Required: dealId. Optional: stage, title, description, contactId, organizationId, value, expectedCloseDate, probability (0-100%), customFields.',
  schema: crmUpdateDealSchema,
  toolType: 'builtin',
};

const crmListDealsDefinition: ToolRegistryDefinition = {
  name: 'crm_list_deals',
  description: 'List deals. Optional: pipelineId, stage, contactId, limit, skip.',
  schema: {
    type: 'object',
    properties: {
      pipelineId: { type: 'string' },
      stage: { type: 'string' },
      contactId: { type: 'string' },
      limit: { type: 'number' },
      skip: { type: 'number' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmLogActivityDefinition: ToolRegistryDefinition = {
  name: 'crm_log_activity',
  description:
    'Log an activity (e.g. call_logged, email_sent). Required: type, contactId or dealId. Optional: summary, metadata, dueDate, status, priority, assignedUserId. Types: email_sent, email_received, call_logged, agent_action, doc_matched, stage_change.',
  schema: crmLogActivitySchema,
  toolType: 'builtin',
};

const crmListActivitiesDefinition: ToolRegistryDefinition = {
  name: 'crm_list_activities',
  description:
    'List activities for a contact or deal. Provide contactId OR dealId. Optional: limit, skip.',
  schema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      dealId: { type: 'string' },
      limit: { type: 'number' },
      skip: { type: 'number' },
    },
    required: [],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmSoftDeleteContactDefinition: ToolRegistryDefinition = {
  name: 'crm_soft_delete_contact',
  description:
    'Soft delete a contact. The contact is marked as deleted and excluded from lists. Required: contactId.',
  schema: {
    type: 'object',
    properties: { contactId: { type: 'string', description: 'Contact ID' } },
    required: ['contactId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmSoftDeleteOrganizationDefinition: ToolRegistryDefinition = {
  name: 'crm_soft_delete_organization',
  description:
    'Soft delete an organization. The organization is marked as deleted and excluded from lists. Required: organizationId.',
  schema: {
    type: 'object',
    properties: { organizationId: { type: 'string', description: 'Organization ID' } },
    required: ['organizationId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmSoftDeleteDealDefinition: ToolRegistryDefinition = {
  name: 'crm_soft_delete_deal',
  description:
    'Soft delete a deal. The deal is marked as deleted and excluded from lists. Required: dealId.',
  schema: {
    type: 'object',
    properties: { dealId: { type: 'string', description: 'Deal ID' } },
    required: ['dealId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

const crmSoftDeletePipelineDefinition: ToolRegistryDefinition = {
  name: 'crm_soft_delete_pipeline',
  description:
    'Soft delete a pipeline. Fails if deals exist in the pipeline. Move or delete deals first. Required: pipelineId.',
  schema: {
    type: 'object',
    properties: { pipelineId: { type: 'string', description: 'Pipeline ID' } },
    required: ['pipelineId'],
  } as ExtendedJsonSchema,
  toolType: 'builtin',
};

/** Tool definitions from @librechat/agents */
const agentToolDefinitions: Record<string, ToolRegistryDefinition> = {
  workspace_read_file: readFileDefinition,
  workspace_edit_file: editFileDefinition,
  workspace_create_file: createFileDefinition,
  workspace_delete_file: deleteFileDefinition,
  workspace_list_files: listFilesDefinition,
  search_user_files: searchFilesDefinition,
  workspace_glob_files: globFilesDefinition,
  workspace_send_file_to_user: sendFileToUserDefinition,
  workspace_pull_file: pullFileToWorkspaceDefinition,
  list_my_files: listMyFilesDefinition,
  create_pdf: createPdfDefinition,
  run_tool_and_save: runToolAndSaveDefinition,
  list_schedules: listSchedulesDefinition,
  list_user_projects: listUserProjectsDefinition,
  create_schedule: createScheduleDefinition,
  update_schedule: updateScheduleDefinition,
  delete_schedule: deleteScheduleDefinition,
  run_schedule: runScheduleDefinition,
  list_runs: listRunsDefinition,
  get_run: getRunDefinition,
  run_sub_agent: runSubAgentDefinition,
  list_agents: listAgentsDefinition,
  crm_list_pipelines: crmListPipelinesDefinition,
  crm_create_pipeline: crmCreatePipelineDefinition,
  crm_update_pipeline: crmUpdatePipelineDefinition,
  crm_create_contact: crmCreateContactDefinition,
  crm_update_contact: crmUpdateContactDefinition,
  crm_get_contact: crmGetContactDefinition,
  crm_list_contacts: crmListContactsDefinition,
  crm_create_organization: crmCreateOrganizationDefinition,
  crm_get_organization: crmGetOrganizationDefinition,
  crm_list_organizations: crmListOrganizationsDefinition,
  crm_create_deal: crmCreateDealDefinition,
  crm_update_deal: crmUpdateDealDefinition,
  crm_list_deals: crmListDealsDefinition,
  crm_log_activity: crmLogActivityDefinition,
  crm_list_activities: crmListActivitiesDefinition,
  crm_soft_delete_contact: crmSoftDeleteContactDefinition,
  crm_soft_delete_organization: crmSoftDeleteOrganizationDefinition,
  crm_soft_delete_deal: crmSoftDeleteDealDefinition,
  crm_soft_delete_pipeline: crmSoftDeletePipelineDefinition,
  project_section_update: {
    name: 'project_section_update',
    description:
      'Create or replace a project context section. Use to add or update sections (e.g. overview, tasks). Format: # Title (id=sectionId) + content. Required: sectionId, title. Optional: content (defaults to empty).',
    schema: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
        title: { type: 'string', description: 'Section title for display' },
        content: { type: 'string', description: 'Section content (markdown). Optional, defaults to empty string.' },
      },
      required: ['sectionId', 'title'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_section_delete: {
    name: 'project_section_delete',
    description: 'Remove a project context section by sectionId. Required: sectionId.',
    schema: {
      type: 'object',
      properties: {
        sectionId: { type: 'string', description: 'Section ID to remove (e.g. overview, tasks)' },
      },
      required: ['sectionId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_section_patch: {
    name: 'project_section_patch',
    description:
      'Batch update project context sections in one call. Upsert multiple sections and optionally delete others. Use to build or replace the full context in one shot. At least one of sections or deleteIds is required.',
    schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          description: 'Sections to create or update. Each: { sectionId, title, content }',
          items: {
            type: 'object',
            properties: {
              sectionId: { type: 'string', description: 'Section ID (slug, e.g. overview, tasks)' },
              title: { type: 'string', description: 'Section title' },
              content: { type: 'string', description: 'Section content (markdown)' },
            },
            required: ['sectionId', 'title', 'content'],
          },
        },
        deleteIds: {
          type: 'array',
          description: 'Section IDs to remove',
          items: { type: 'string' },
        },
      },
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_log: {
    name: 'project_log',
    description:
      'Appends an entry to the project changelog. Append-only log for history. Never injected automatically. Required: entry.',
    schema: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'The log entry to append' } },
      required: ['entry'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_log_tail: {
    name: 'project_log_tail',
    description: 'Returns the last n entries from the project changelog. Optional: n (default 10, max 100).',
    schema: {
      type: 'object',
      properties: { n: { type: 'number', description: 'Number of entries to return' } },
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_log_search: {
    name: 'project_log_search',
    description: 'Search the project changelog by keyword. Required: query. Optional: limit.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keyword)' },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
      required: ['query'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_log_range: {
    name: 'project_log_range',
    description:
      'Returns changelog entries between two timestamps. Required: from, to (ISO date strings). Optional: limit.',
    schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start timestamp (ISO date)' },
        to: { type: 'string', description: 'End timestamp (ISO date)' },
        limit: { type: 'number', description: 'Max entries to return (default 100)' },
      },
      required: ['from', 'to'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_create: {
    name: 'project_create',
    description:
      'Create a new project. Required: name. Optional: description, tags[], sharedWithWorkspace (workspace admin only), templateProjectId (copy sections from template). If sharedWithWorkspace and you are not a workspace admin, use human_notify_human to ask the admin (adminMemberId) to create a shared project.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Project description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the project',
        },
        sharedWithWorkspace: {
          type: 'boolean',
          description: 'If true, create a workspace-shared project (workspace admin only)',
        },
        templateProjectId: {
          type: 'string',
          description: 'Copy context sections from this project',
        },
      },
      required: ['name'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_list: {
    name: 'project_list',
    description:
      'List projects the user can access (own and workspace-shared). Optional: limit (default 25), cursor, status (active|archived|all). Returns projectId, name, description, tags, owner, shared, lastUpdated.',
    schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max projects to return (default 25)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'all'],
          description: 'Filter by status (default active)',
        },
      },
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_archive: {
    name: 'project_archive',
    description:
      'Archive a project (soft delete). Only owner or workspace admin can archive. Required: projectId.',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to archive' },
      },
      required: ['projectId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_update_metadata: {
    name: 'project_update_metadata',
    description:
      'Update project metadata. Required: projectId. Optional: name, description, tags[], ownerId (workspace admin only, shared projects).',
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID to update' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New project description' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags (replaces existing)',
        },
        ownerId: { type: 'string', description: 'New owner user ID' },
      },
      required: ['projectId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  project_switch: {
    name: 'project_switch',
    description:
      'Assign a project to this conversation. Required: projectId (use project_list to get IDs). Pass null to clear the project.',
    schema: {
      type: 'object',
      properties: {
        projectId: {
          oneOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Project ID to assign, or null to clear',
        },
      },
      required: ['projectId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  generate_code: {
    name: 'generate_code',
    description:
      'Generate Python code via configured LLM. For new code only. Do NOT use for fixing lint errors—use workspace_edit_file. Provide file_path (relative to workspace) and request (what to build). Writes the file and returns a diff. Never write code inline—use this tool for new code generation.',
    schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'File path relative to workspace root' },
        request: { type: 'string', description: 'What to generate (requirements, behavior, constraints)' },
      },
      required: ['file_path', 'request'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  lint: {
    name: 'lint',
    description:
      'Run linter (ESLint for JS/TS, Ruff for Python) on a file or directory. Updates lint_status.json. run_program blocks if lint has errors.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory path relative to workspace' },
      },
      required: ['path'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  run_program: {
    name: 'run_program',
    description:
      'Execute a Python script (e.g. main.py). Optional args for CLI arguments. Blocks if lint_status.json has errors. On success: git add + commit with output summary. On failure: no commit.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Entry file path (e.g. main.py)' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional arguments to pass to the script',
        },
      },
      required: ['path'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  workspace_status: {
    name: 'workspace_status',
    description: 'Git status, todo list, last commit. Call first on every invocation.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  workspace_init: {
    name: 'workspace_init',
    description: 'Init workspace. Clones template if configured, else git init + .gitignore. Call when workspace_status says empty.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  reset_workspace: {
    name: 'reset_workspace',
    description: 'Wipe workspace and re-init. Only when handoff says reset: true.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  update_todo: {
    name: 'update_todo',
    description: 'Mark a todo item complete or pending. Updates todo.json.',
    schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Todo item text' },
        status: { type: 'string', enum: ['pending', 'complete'], description: 'Item status' },
      },
      required: ['item', 'status'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  create_plan: {
    name: 'create_plan',
    description:
      'Write plan.md and todo.json from plan content. Call after reading requirements from Ellis handoff.',
    schema: {
      type: 'object',
      properties: {
        plan_content: { type: 'string', description: 'Full plan content (markdown)' },
      },
      required: ['plan_content'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  create_brainstorm_doc: {
    name: 'create_brainstorm_doc',
    description:
      'Save a brainstorm/plan document as markdown for the user. Use after researching with web_search and file_search. Format: # Title, summary paragraph, ## Sections, markdown content. Creates a downloadable file in the user\'s My Files.',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Markdown document content' },
      },
      required: ['content'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  install_dependencies: {
    name: 'install_dependencies',
    description:
      'pip install -r requirements.txt into workspace .venv. Call after adding/updating requirements.txt, before run_program.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  [CalculatorToolDefinition.name]: {
    name: CalculatorToolDefinition.name,
    description: CalculatorToolDefinition.description,
    schema: CalculatorToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  [CodeExecutionToolDefinition.name]: {
    name: CodeExecutionToolDefinition.name,
    description: CodeExecutionToolDefinition.description,
    schema: CodeExecutionToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  [WebSearchToolDefinition.name]: {
    name: WebSearchToolDefinition.name,
    description: WebSearchToolDefinition.description,
    schema: WebSearchToolDefinition.schema as unknown as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  /* Sys Admin tools - admin only */
  sys_admin_help: {
    name: 'sys_admin_help',
    description:
      'Returns description of all sys_admin tools and example questions. Use when the user asks what you can do, how to manage users, or about token usage.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_search: {
    name: 'sys_admin_search',
    description:
      'Searches sys_admin tools by query using BM25 ranking. Use to discover which tool to use for a task (e.g. "ban user", "token usage", "read logs"). Returns matching tools with names and descriptions.',
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term to find in tool names and descriptions (e.g. "ban user", "logs", "feature flag")',
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          default: 10,
          description: 'Maximum number of matching tools to return (default 10)',
        },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_users: {
    name: 'sys_admin_list_users',
    description:
      'List users with optional search and pagination. Optional: search (email, name, username), limit (default 50), page (default 1).',
    schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by email, name, username' },
        limit: { type: 'number', description: 'Max users to return (default 50, max 100)' },
        page: { type: 'number', description: 'Page number (default 1)' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_user: {
    name: 'sys_admin_get_user',
    description: 'Get a user by ID. Required: userId.',
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'User ID' } },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_create_user: {
    name: 'sys_admin_create_user',
    description:
      'Create a new user (local auth). Required: email. Optional: password, name, username, role (ADMIN|USER), workspace_id, inboundEmailToken.',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'User email (required)' },
        password: { type: 'string', description: 'Password for local auth' },
        name: { type: 'string', description: 'Display name' },
        username: { type: 'string', description: 'Username' },
        role: { type: 'string', enum: ['ADMIN', 'USER'], description: 'User role' },
        workspace_id: { type: 'string', description: 'Workspace ID to assign' },
        inboundEmailToken: { type: 'string', description: 'Inbound email token' },
      },
      required: ['email'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_update_user: {
    name: 'sys_admin_update_user',
    description:
      'Update a user. Required: userId. Optional: name, username, email, role, password, workspace_id, inboundEmailToken.',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to update' },
        name: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string', enum: ['ADMIN', 'USER'] },
        password: { type: 'string' },
        workspace_id: { type: 'string' },
        inboundEmailToken: { type: 'string' },
      },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_delete_user: {
    name: 'sys_admin_delete_user',
    description: 'Delete a user by ID. Cannot delete yourself. Required: userId.',
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'User ID to delete' } },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_ban_user: {
    name: 'sys_admin_ban_user',
    description:
      'Ban a user by ID or email. Revokes sessions and blocks access. Required: userId or email. Optional: durationMinutes (default 60, 0 for indefinite).',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to ban' },
        email: { type: 'string', description: 'Email to ban (use if userId not known)' },
        durationMinutes: {
          type: 'integer',
          minimum: 0,
          description: 'Ban duration in minutes. 0 = indefinite (100 years). Default 60.',
        },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_unban_user: {
    name: 'sys_admin_unban_user',
    description: 'Remove a user ban by ID or email. Required: userId or email.',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to unban' },
        email: { type: 'string', description: 'Email to unban (use if userId not known)' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_grant_agent_access: {
    name: 'sys_admin_grant_agent_access',
    description:
      'Grant a user access to an agent. Required: agentId, userId or email. Optional: accessRole (viewer, editor, owner; default viewer).',
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID (e.g. agent_abc123)' },
        userId: { type: 'string', description: 'User ID to grant access' },
        email: { type: 'string', description: 'Email to grant access (use if userId not known)' },
        accessRole: {
          type: 'string',
          enum: ['viewer', 'editor', 'owner'],
          description: 'Access level: viewer (view only), editor (view+edit), owner (full). Default: viewer.',
        },
      },
      required: ['agentId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_revoke_agent_access: {
    name: 'sys_admin_revoke_agent_access',
    description: 'Revoke a user\'s access to an agent. Required: agentId, userId or email.',
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID (e.g. agent_abc123)' },
        userId: { type: 'string', description: 'User ID to revoke access' },
        email: { type: 'string', description: 'Email to revoke access (use if userId not known)' },
      },
      required: ['agentId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_invite_user: {
    name: 'sys_admin_invite_user',
    description: 'Invite a user by email. Creates invite and sends email. Required: email.',
    schema: {
      type: 'object',
      properties: { email: { type: 'string', description: 'Email to invite' } },
      required: ['email'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_send_password_reset: {
    name: 'sys_admin_send_password_reset',
    description: 'Send password reset email to a user. Required: userId.',
    schema: {
      type: 'object',
      properties: { userId: { type: 'string', description: 'User ID' } },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_workspaces: {
    name: 'sys_admin_list_workspaces',
    description: 'List all workspaces. Returns id, name, slug, maxMembers, adminIds.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_workspace: {
    name: 'sys_admin_get_workspace',
    description: 'Get a workspace by ID. Required: workspaceId.',
    schema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Workspace ID' } },
      required: ['workspaceId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_create_workspace: {
    name: 'sys_admin_create_workspace',
    description: 'Create a workspace. Required: name, slug.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workspace name' },
        slug: { type: 'string', description: 'Workspace slug (unique)' },
      },
      required: ['name', 'slug'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_update_workspace: {
    name: 'sys_admin_update_workspace',
    description:
      'Update a workspace. Required: workspaceId. Optional: name, slug, maxMembers, adminIds.',
    schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string' },
        slug: { type: 'string' },
        maxMembers: { type: 'number' },
        adminIds: { type: 'array', items: { type: 'string' }, description: 'Admin user IDs' },
      },
      required: ['workspaceId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_delete_workspace: {
    name: 'sys_admin_delete_workspace',
    description: 'Delete a workspace. Required: workspaceId.',
    schema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Workspace ID' } },
      required: ['workspaceId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_workspace_members: {
    name: 'sys_admin_list_workspace_members',
    description: 'List members of a workspace. Required: workspaceId.',
    schema: {
      type: 'object',
      properties: { workspaceId: { type: 'string', description: 'Workspace ID' } },
      required: ['workspaceId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_invite_workspace_member: {
    name: 'sys_admin_invite_workspace_member',
    description: 'Invite a user to a workspace by email. Required: workspaceId, email.',
    schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        email: { type: 'string', description: 'Email to invite' },
      },
      required: ['workspaceId', 'email'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_remove_workspace_member: {
    name: 'sys_admin_remove_workspace_member',
    description: 'Remove a member from a workspace. Required: workspaceId, userId.',
    schema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        userId: { type: 'string', description: 'User ID to remove' },
      },
      required: ['workspaceId', 'userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_user_usage: {
    name: 'sys_admin_get_user_usage',
    description:
      'Get token usage for a user. Required: userId. Optional: limit (default 50), startDate, endDate (ISO dates).',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        limit: { type: 'number', description: 'Max transactions to return (default 50)' },
        startDate: { type: 'string', description: 'Start date (ISO)' },
        endDate: { type: 'string', description: 'End date (ISO)' },
      },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_user_balance: {
    name: 'sys_admin_get_user_balance',
    description:
      "Get a user's current token balance. Required: userId. Optional: includeTransactions (true to include recent transactions).",
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        includeTransactions: {
          type: 'boolean',
          description: 'Include recent transactions in response',
        },
      },
      required: ['userId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_usage: {
    name: 'sys_admin_list_usage',
    description:
      'List transactions with filters. Optional: userId, conversationId, model, tokenType, startDate, endDate, limit (default 50), page (default 1).',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        conversationId: { type: 'string' },
        model: { type: 'string' },
        tokenType: { type: 'string', enum: ['prompt', 'completion', 'credits'] },
        startDate: { type: 'string', description: 'ISO date' },
        endDate: { type: 'string', description: 'ISO date' },
        limit: { type: 'number' },
        page: { type: 'number' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_usage_aggregate: {
    name: 'sys_admin_usage_aggregate',
    description:
      'Aggregate token usage by user. Optional: userId (filter to one user), startDate, endDate (ISO dates). Returns per-user totals.',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Filter to specific user' },
        startDate: { type: 'string', description: 'ISO date' },
        endDate: { type: 'string', description: 'ISO date' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_agents: {
    name: 'sys_admin_list_agents',
    description:
      'List all agents (admin bypasses ACL). Optional: search (name), limit (default 50), after (cursor for pagination).',
    schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by agent name' },
        limit: { type: 'number', description: 'Max agents to return (default 50)' },
        after: { type: 'string', description: 'Cursor for pagination' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_assignable_tools: {
    name: 'sys_admin_list_assignable_tools',
    description:
      'List all capabilities and tools that can be assigned to an agent. Use when creating/updating agents to populate tools and capabilities.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_agent: {
    name: 'sys_admin_get_agent',
    description: 'Get full agent details by ID. Required: id.',
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Agent ID (e.g. system-general)' } },
      required: ['id'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_create_agent: {
    name: 'sys_admin_create_agent',
    description:
      'Create an agent. Required: name, provider, model. Optional: instructions, tools, description, category, edges, model_parameters.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        provider: { type: 'string', description: 'Provider (e.g. openAI)' },
        model: { type: 'string', description: 'Model name' },
        instructions: { type: 'string', description: 'System instructions' },
        tools: {
          oneOf: [
            { type: 'array', items: { type: 'string' }, description: 'Tool IDs' },
            { type: 'string', description: 'JSON string of tool ID array, e.g. \'["project_create","run_sub_agent"]\'' },
          ],
          description: 'Tool IDs. Pass as array or JSON string.',
        },
        description: { type: 'string', description: 'Agent description' },
        category: { type: 'string', description: 'Category (e.g. general)' },
        edges: {
          oneOf: [
            { type: 'array', items: { type: 'object' }, description: 'Handoff edges' },
            { type: 'string', description: 'JSON string of edges array' },
          ],
          description: 'Handoff edges. Pass as array or JSON string.',
        },
      },
      required: ['name', 'provider', 'model'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_update_agent: {
    name: 'sys_admin_update_agent',
    description:
      'Update an agent. Required: agentId or agent_id. Optional: name, instructions, tools, model, provider, description, category, edges, inbound_instructions (object: telegram, email, etc. -> instruction string for that channel).',
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to update (camelCase)' },
        agent_id: { type: 'string', description: 'Alias for agentId (snake_case)' },
        name: { type: 'string', description: 'Agent name' },
        instructions: { type: 'string', description: 'System instructions' },
        tools: {
          oneOf: [
            { type: 'array', items: { type: 'string' }, description: 'Tool IDs' },
            { type: 'string', description: 'JSON string of tool ID array, e.g. \'["project_create","run_sub_agent"]\'' },
          ],
          description: 'Tool IDs. Pass as array or JSON string.',
        },
        model: { type: 'string', description: 'Model name' },
        provider: { type: 'string', description: 'Provider' },
        description: { type: 'string', description: 'Agent description' },
        category: { type: 'string', description: 'Category' },
        edges: {
          oneOf: [
            { type: 'array', items: { type: 'object' }, description: 'Handoff edges' },
            { type: 'string', description: 'JSON string of edges array' },
          ],
          description: 'Handoff edges. Pass as array or JSON string.',
        },
        inbound_instructions: {
          oneOf: [
            { type: 'object', additionalProperties: { type: 'string' }, description: 'Per-channel instructions' },
            { type: 'string', description: 'JSON string of inbound_instructions object' },
          ],
          description:
            'Per-channel instructions when run comes from that inbound source. Keys: telegram, email, etc. Values: instruction string. Pass as object or JSON string.',
        },
      },
      anyOf: [
        { required: ['agentId'] },
        { required: ['agent_id'] },
      ],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_delete_agent: {
    name: 'sys_admin_delete_agent',
    description: 'Delete an agent by ID. Required: agentId.',
    schema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID to delete' } },
      required: ['agentId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_duplicate_agent: {
    name: 'sys_admin_duplicate_agent',
    description: 'Duplicate an agent (creates a copy with new ID). Required: agentId.',
    schema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID to duplicate' } },
      required: ['agentId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_agent_versions: {
    name: 'sys_admin_list_agent_versions',
    description:
      'List version history for an agent. Returns index, createdAt, name for each version. Use before revert to pick versionIndex. Required: agentId.',
    schema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'Agent ID' } },
      required: ['agentId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_revert_agent_version: {
    name: 'sys_admin_revert_agent_version',
    description:
      'Revert an agent to a version. Required: agentId. versionIndex: 0-based index (use sys_admin_list_agent_versions first), or -1 for previous version.',
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        versionIndex: {
          type: 'number',
          description: '0-based index, or -1 to revert to previous version',
        },
      },
      required: ['agentId', 'versionIndex'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_seed_system_agents: {
    name: 'sys_admin_seed_system_agents',
    description:
      'Re-run seed from librechat.yaml systemAgents. Creates missing agents only; does not overwrite existing.',
    schema: { type: 'object', properties: {}, required: [] } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_tail_logs: {
    name: 'sys_admin_tail_logs',
    description:
      'Read recent lines from Winston application logs (error or debug). Optional: level (error|debug), date (YYYY-MM-DD), limit (1-200), search (substring filter).',
    schema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['error', 'debug'],
          description: 'Log level: error or debug',
        },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
        limit: {
          type: 'number',
          description: 'Max lines to return (1-200, default 50)',
        },
        search: { type: 'string', description: 'Optional substring filter in message' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_search_event_logs: {
    name: 'sys_admin_search_event_logs',
    description:
      'Search audit event logs (email sent, etc.). Optional: type, event, userId, conversationId, agentId, scheduleId, to, subject, source, success, startDate, endDate, search (substring), limit (1-200), skip.',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Event type (e.g. email)' },
        event: { type: 'string', description: 'Event name (e.g. email_sent)' },
        userId: { type: 'string', description: 'Filter by user' },
        conversationId: { type: 'string', description: 'metadata.conversationId' },
        agentId: { type: 'string', description: 'metadata.agentId' },
        scheduleId: { type: 'string', description: 'metadata.scheduleId' },
        to: { type: 'string', description: 'Substring match on recipient email' },
        subject: { type: 'string', description: 'Substring match on subject' },
        source: { type: 'string', description: 'Exact match on metadata.source' },
        success: { type: 'boolean', description: 'Filter by metadata.success' },
        startDate: { type: 'string', description: 'createdAt >= (YYYY-MM-DD or ISO)' },
        endDate: { type: 'string', description: 'createdAt <= (YYYY-MM-DD or ISO)' },
        search: { type: 'string', description: 'Substring across to, subject, source' },
        limit: { type: 'number', description: '1-200, default 50' },
        skip: { type: 'number', description: 'Offset for pagination' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_env: {
    name: 'sys_admin_list_env',
    description:
      'List environment variable names. Sensitive values are redacted. Optional: prefix (filter keys), includeValues (include values; sensitive still redacted).',
    schema: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Filter to keys starting with prefix (e.g. OPENAI)' },
        includeValues: {
          type: 'boolean',
          description: 'If true, include values; sensitive keys still redacted',
        },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_all_tools: {
    name: 'sys_admin_list_all_tools',
    description:
      'List all tools (registry + MCP) with id, name, description, schema. Optional: agentId (include hasOverride for that agent).',
    schema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'When provided, include hasOverride for each tool for this agent',
        },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_create_tool_override: {
    name: 'sys_admin_create_tool_override',
    description:
      'Create a tool override. toolId required. Optional: agentId (omit=global), userId (omit=agent/global), description, schema, requiresApproval (true=gate, false=ungate approval). Omit schema if only changing requiresApproval. Example: { "toolId": "file_search", "requiresApproval": false } to ungate.',
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        toolId: { type: 'string', description: 'Tool identifier (e.g. file_search, gmail_send_mcp_Google)' },
        agentId: {
          type: 'string',
          description: 'Agent MongoDB _id for agent-specific override; omit for global',
        },
        userId: {
          type: 'string',
          description: 'User MongoDB _id for per-user override; omit for agent/global scope',
        },
        description: { type: 'string', description: 'Override description' },
        schema: {
          oneOf: [
            { type: 'object', description: 'Full JSON Schema object' },
            { type: 'string', description: 'JSON string of the schema' },
          ],
          description:
            "Override the tool's JSON Schema. Pass as object or JSON string. Omit if not changing schema.",
        },
        requiresApproval: {
          type: 'boolean',
          description: 'true=require approval (gate), false=no approval (ungate); overrides default',
        },
      },
      required: ['toolId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_get_tool_override: {
    name: 'sys_admin_get_tool_override',
    description: 'Get a tool override by overrideId or by toolId + agentId + userId.',
    schema: {
      type: 'object',
      properties: {
        overrideId: { type: 'string', description: 'Override document _id' },
        toolId: { type: 'string', description: 'Tool ID (use with agentId, userId)' },
        agentId: { type: 'string', description: 'Agent _id for agent-specific; omit for global' },
        userId: { type: 'string', description: 'User _id for per-user override; omit for agent/global' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_update_tool_override: {
    name: 'sys_admin_update_tool_override',
    description:
      'Update a tool override. overrideId required. Optional: description, schema, requiresApproval (gate/ungate). Omit schema if not changing. Pass schema as object or JSON string.',
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        overrideId: { type: 'string', description: 'Override document _id' },
        description: { type: 'string', description: 'New description' },
        schema: {
          oneOf: [
            { type: 'object', description: 'Full JSON Schema object' },
            { type: 'string', description: 'JSON string of the schema' },
          ],
          description:
            'New JSON Schema for the tool. Pass as object or JSON string. Omit if not changing schema.',
        },
        requiresApproval: {
          type: 'boolean',
          description: 'true=gate, false=ungate approval',
        },
      },
      required: ['overrideId'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_delete_tool_override: {
    name: 'sys_admin_delete_tool_override',
    description: 'Delete a tool override by overrideId or by toolId + agentId + userId.',
    schema: {
      type: 'object',
      properties: {
        overrideId: { type: 'string', description: 'Override document _id' },
        toolId: { type: 'string', description: 'Tool ID (use with agentId, userId)' },
        agentId: { type: 'string', description: 'Agent _id for agent-specific; omit for global' },
        userId: { type: 'string', description: 'User _id for per-user override; omit for agent/global' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_tool_overrides: {
    name: 'sys_admin_list_tool_overrides',
    description:
      'List tool overrides. Optional: toolId, agentId, userId, globalOnly, limit, page. Returns requiresApproval, userId.',
    schema: {
      type: 'object',
      properties: {
        toolId: { type: 'string', description: 'Filter by tool ID' },
        agentId: { type: 'string', description: 'Filter by agent _id' },
        userId: { type: 'string', description: 'Filter by user _id' },
        globalOnly: {
          type: 'boolean',
          description: 'If true, only return global overrides (agentId null)',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
        page: { type: 'number', description: 'Page number (default 1)' },
      },
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_list_feature_flags: {
    name: 'sys_admin_list_feature_flags',
    description:
      'List all feature flags (key, value, description). Use to see runtime toggles like summarizeEnabled, feedbackEnabled, balanceEnabled.',
    schema: {
      type: 'object',
      properties: {},
      required: [],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
  sys_admin_set_feature_flag: {
    name: 'sys_admin_set_feature_flag',
    description:
      'Set a feature flag. Allowed keys: summarizeEnabled, toolsMenuEnabled, forkEnabled, regenerateEnabled, feedbackEnabled, copyEnabled, editEnabled, continueEnabled, balanceEnabled, toolCallDetailsEnabled, showBirthdayIcon, sharePointFilePickerEnabled, customFooter. Changes apply immediately.',
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Flag key: summarizeEnabled, toolsMenuEnabled, forkEnabled, regenerateEnabled, feedbackEnabled, copyEnabled, editEnabled, continueEnabled, balanceEnabled, toolCallDetailsEnabled, showBirthdayIcon, sharePointFilePickerEnabled, customFooter',
          enum: [
            'summarizeEnabled',
            'toolsMenuEnabled',
            'forkEnabled',
            'regenerateEnabled',
            'feedbackEnabled',
            'copyEnabled',
            'editEnabled',
            'continueEnabled',
            'balanceEnabled',
            'toolCallDetailsEnabled',
            'showBirthdayIcon',
            'sharePointFilePickerEnabled',
            'customFooter',
          ],
        },
        value: {
          description: 'Value: boolean for most flags, string for customFooter',
        },
      },
      required: ['key', 'value'],
    } as ExtendedJsonSchema,
    toolType: 'builtin',
  },
};

export interface GetToolDefinitionOptions {
  /** When true, use Python-only local schema; when false, use remote 13-language schema */
  useLocalCodeExecution?: boolean;
}

export function getToolDefinition(
  toolName: string,
  options?: GetToolDefinitionOptions,
): ToolRegistryDefinition | undefined {
  const disableLocal =
    process.env.DISABLE_LOCAL_CODE_EXECUTION === 'true' ||
    process.env.DISABLE_LOCAL_CODE_EXECUTION === '1';
  const useLocal =
    !disableLocal &&
    (options?.useLocalCodeExecution ??
      (!process.env.LIBRECHAT_CODE_API_KEY || process.env.LIBRECHAT_CODE_API_KEY === 'local'));
  if (toolName === 'execute_code' && useLocal) {
    return LOCAL_CODE_EXECUTION_DEFINITION;
  }
  return toolDefinitions[toolName] ?? agentToolDefinitions[toolName];
}

export function getWorkspaceCodeEditToolDefinitions() {
  return [
    readFileDefinition,
    editFileDefinition,
    createFileDefinition,
    deleteFileDefinition,
    listFilesDefinition,
    globFilesDefinition,
    searchFilesDefinition,
    sendFileToUserDefinition,
  ];
}

export function getAllToolDefinitions(): ToolRegistryDefinition[] {
  return [...Object.values(toolDefinitions), ...Object.values(agentToolDefinitions)];
}

export function getToolSchema(toolName: string): ExtendedJsonSchema | undefined {
  return getToolDefinition(toolName)?.schema;
}
