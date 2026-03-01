/**
 * Spec Compliance Analysis (S075)
 *
 * Analyzes code changes against spec/acceptance criteria using LLM.
 * Checks if implementation matches requirements and reports:
 * - Compliance score (0-1)
 * - Specific mismatches between spec and implementation
 */

import type { LLMClient, ChatMessage } from './provider';
import type { ReviewContext } from './context';
import { formatDiffForLLM, formatFileContentsForLLM } from './context';

// ============================================================================
// Types
// ============================================================================

/**
 * A single spec requirement
 */
export interface SpecRequirement {
  /** Unique identifier (e.g., "AC-1", "req-auth-01") */
  id: string;

  /** Human-readable description */
  description: string;

  /** Source: where this came from (story title, section, etc.) */
  source?: string;
}

/**
 * Result of checking one requirement against the implementation
 */
export interface RequirementCheckResult {
  /** The requirement that was checked */
  requirement: SpecRequirement;

  /** Whether the requirement is met */
  met: boolean;

  /** How confident the LLM is (0-1) */
  confidence: number;

  /** Explanation of why it's met or not */
  explanation: string;

  /** Specific files/lines where the mismatch occurs */
  locations?: Array<{
    file: string;
    line: number;
    note: string;
  }>;
}

/**
 * Full spec compliance result
 */
export interface SpecComplianceResult {
  /** Overall compliance score (0-1): fraction of requirements met */
  complianceScore: number;

  /** Per-requirement results */
  requirementResults: RequirementCheckResult[];

  /** Requirements that are clearly met */
  metRequirements: RequirementCheckResult[];

  /** Requirements that are not met or partially met */
  missedRequirements: RequirementCheckResult[];

  /** Overall confidence in the analysis (0-1) */
  overallConfidence: number;

  /** Human-readable summary */
  summary: string;

  /** Token usage */
  inputTokens: number;
  outputTokens: number;

  /** Cost in USD */
  cost: number;

  /** Latency in ms */
  latencyMs: number;

  /** Raw LLM response (for debugging) */
  rawResponse?: string;
}

/**
 * Options for spec compliance analysis
 */
export interface SpecComplianceOptions {
  /** LLM client to use */
  client: LLMClient;

  /** Review context (diff, file contents) */
  context: ReviewContext;

  /** Spec requirements to check against */
  requirements: SpecRequirement[];

  /** Story/feature description (full text) */
  storyDescription?: string;

  /** Additional acceptance criteria text */
  acceptanceCriteria?: string;

  /** Include raw LLM response in result */
  includeRawResponse?: boolean;
}

// ============================================================================
// Prompt Templates
// ============================================================================

const SYSTEM_PROMPT = `You are a senior engineer performing spec compliance review.

Your job is to analyze code changes and determine whether each acceptance criterion is satisfied by the implementation.

Be precise and factual:
- Only mark a requirement as "met" if there is clear evidence in the code
- If you're unsure, use a lower confidence score
- Cite specific files and line numbers where relevant
- Look for both presence of features AND absence of anti-patterns

IMPORTANT: Respond ONLY with valid JSON in the exact format specified. Do not include any other text.`;

function buildUserPrompt(
  requirements: SpecRequirement[],
  context: ReviewContext,
  storyDescription?: string,
  acceptanceCriteria?: string
): string {
  const sections: string[] = [];

  if (storyDescription) {
    sections.push(`## Story Description\n${storyDescription}`);
  }

  if (acceptanceCriteria) {
    sections.push(`## Acceptance Criteria\n${acceptanceCriteria}`);
  }

  sections.push(
    `## Requirements to Check\n${requirements
      .map((r) => `- [${r.id}] ${r.description}${r.source ? ` (from: ${r.source})` : ''}`)
      .join('\n')}`
  );

  // Use a generous token budget for diff and file contents in compliance prompts
  const DIFF_TOKEN_BUDGET = 4000;
  const FILE_CONTENT_TOKEN_BUDGET = 2000;

  const diff = formatDiffForLLM(context.diff, DIFF_TOKEN_BUDGET);
  if (diff) {
    sections.push(`## Code Changes (Diff)\n\`\`\`diff\n${diff}\n\`\`\``);
  }

  const fileContents = formatFileContentsForLLM(context.fileContents, FILE_CONTENT_TOKEN_BUDGET);
  if (fileContents) {
    sections.push(`## Changed File Contents\n${fileContents}`);
  }

  sections.push(`For each requirement, determine if the implementation satisfies it.

Respond with this exact JSON format:
{
  "results": [
    {
      "id": "req-id",
      "met": true,
      "confidence": 0.9,
      "explanation": "The code in src/foo.ts line 42 implements X by doing Y",
      "locations": [
        { "file": "src/foo.ts", "line": 42, "note": "implements X" }
      ]
    }
  ],
  "summary": "Overall assessment: 3 of 4 requirements met. Missing: auth header check.",
  "overallConfidence": 0.85
}

Set "locations" to an empty array if no specific locations are relevant.`);

  return sections.join('\n\n');
}

// ============================================================================
// Response Parsing
// ============================================================================

interface RawRequirementResult {
  id?: string;
  met?: boolean;
  confidence?: number;
  explanation?: string;
  locations?: Array<{ file?: string; line?: number; note?: string }>;
}

interface RawComplianceResponse {
  results?: RawRequirementResult[];
  summary?: string;
  overallConfidence?: number;
}

function parseComplianceResponse(
  response: string,
  requirements: SpecRequirement[]
): {
  requirementResults: RequirementCheckResult[];
  summary: string;
  overallConfidence: number;
} {
  try {
    let jsonStr = response.trim();

    // Handle markdown code blocks
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match?.[1]) {
        jsonStr = match[1].trim();
      }
    }

    const parsed = JSON.parse(jsonStr) as RawComplianceResponse;
    const requirementMap = new Map(requirements.map((r) => [r.id, r]));
    const requirementResults: RequirementCheckResult[] = [];

    if (Array.isArray(parsed.results)) {
      for (const raw of parsed.results) {
        if (!raw.id) continue;
        const requirement = requirementMap.get(raw.id);
        if (!requirement) continue;

        const locations: RequirementCheckResult['locations'] = [];
        if (Array.isArray(raw.locations)) {
          for (const loc of raw.locations) {
            if (loc.file) {
              locations.push({
                file: loc.file,
                line: loc.line ?? 0,
                note: loc.note ?? '',
              });
            }
          }
        }

        const entry: RequirementCheckResult = {
          requirement,
          met: raw.met === true,
          confidence: typeof raw.confidence === 'number'
            ? Math.max(0, Math.min(1, raw.confidence))
            : 0.5,
          explanation: raw.explanation ?? 'No explanation provided.',
        };

        if (locations.length > 0) {
          entry.locations = locations;
        }

        requirementResults.push(entry);
      }
    }

    // For requirements not covered in LLM response, add "unknown" entries
    for (const req of requirements) {
      if (!requirementResults.some((r) => r.requirement.id === req.id)) {
        requirementResults.push({
          requirement: req,
          met: false,
          confidence: 0,
          explanation: 'Not evaluated by LLM (missing from response).',
        });
      }
    }

    return {
      requirementResults,
      summary: parsed.summary ?? 'No summary provided.',
      overallConfidence:
        typeof parsed.overallConfidence === 'number'
          ? Math.max(0, Math.min(1, parsed.overallConfidence))
          : 0.5,
    };
  } catch {
    // Return all requirements as unmet on parse failure
    const requirementResults: RequirementCheckResult[] = requirements.map((req) => ({
      requirement: req,
      met: false,
      confidence: 0,
      explanation: 'Failed to parse LLM compliance response.',
    }));

    return {
      requirementResults,
      summary: 'Failed to parse LLM response. Compliance analysis unavailable.',
      overallConfidence: 0,
    };
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze code changes for spec compliance
 *
 * Returns a compliance score and per-requirement results showing
 * which acceptance criteria are met by the implementation.
 */
export async function analyzeSpecCompliance(
  options: SpecComplianceOptions
): Promise<SpecComplianceResult> {
  const {
    client,
    context,
    requirements,
    storyDescription,
    acceptanceCriteria,
    includeRawResponse = false,
  } = options;

  if (requirements.length === 0) {
    return {
      complianceScore: 1,
      requirementResults: [],
      metRequirements: [],
      missedRequirements: [],
      overallConfidence: 1,
      summary: 'No requirements specified — compliance check skipped.',
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      latencyMs: 0,
    };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUserPrompt(requirements, context, storyDescription, acceptanceCriteria),
    },
  ];

  const response = await client.chat(messages);

  const parsed = parseComplianceResponse(response.content, requirements);

  const metRequirements = parsed.requirementResults.filter((r) => r.met);
  const missedRequirements = parsed.requirementResults.filter((r) => !r.met);

  const complianceScore =
    parsed.requirementResults.length > 0
      ? metRequirements.length / parsed.requirementResults.length
      : 1;

  const result: SpecComplianceResult = {
    complianceScore,
    requirementResults: parsed.requirementResults,
    metRequirements,
    missedRequirements,
    overallConfidence: parsed.overallConfidence,
    summary: parsed.summary,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cost: response.cost,
    latencyMs: response.latencyMs,
  };

  if (includeRawResponse) {
    result.rawResponse = response.content;
  }

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse acceptance criteria text into structured requirements
 *
 * Supports common formats:
 * - "- [ ] AC-1: Description" (GitHub checklist)
 * - "- AC-1: Description" (plain list)
 * - "1. Description" (numbered list)
 * - "Description" (plain text, one per line)
 */
export function parseAcceptanceCriteria(text: string): SpecRequirement[] {
  const requirements: SpecRequirement[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let autoIndex = 1;

  for (const line of lines) {
    // Skip section headers
    if (line.startsWith('#')) continue;

    // Remove checkbox prefix: "- [ ] " or "- [x] "
    let cleaned = line.replace(/^-\s*\[[ xX]\]\s*/, '');

    // Remove leading list markers
    cleaned = cleaned.replace(/^[-*]\s+/, '');
    cleaned = cleaned.replace(/^\d+\.\s+/, '');

    if (cleaned.length === 0) continue;

    // Try to extract explicit ID: "AC-1:" or "req-1:" prefix
    const idMatch = cleaned.match(/^([A-Za-z][\w-]*\d+):\s*(.+)/);
    if (idMatch && idMatch[1] && idMatch[2]) {
      requirements.push({
        id: idMatch[1],
        description: idMatch[2].trim(),
      });
    } else {
      requirements.push({
        id: `AC-${autoIndex}`,
        description: cleaned,
      });
      autoIndex++;
    }
  }

  return requirements;
}

/**
 * Format spec compliance result as markdown for PR comments
 */
export function formatComplianceAsMarkdown(result: SpecComplianceResult): string {
  const scorePercent = Math.round(result.complianceScore * 100);
  const confidencePercent = Math.round(result.overallConfidence * 100);

  const scoreIcon =
    result.complianceScore >= 0.9
      ? ':white_check_mark:'
      : result.complianceScore >= 0.7
        ? ':warning:'
        : ':x:';

  const lines: string[] = [
    `## Spec Compliance Analysis`,
    '',
    `${scoreIcon} **Compliance Score: ${scorePercent}%** (${result.metRequirements.length}/${result.requirementResults.length} requirements met)`,
    '',
    `*Confidence: ${confidencePercent}%*`,
    '',
    result.summary,
    '',
  ];

  if (result.missedRequirements.length > 0) {
    lines.push('<details>');
    lines.push('<summary>:x: Unmet Requirements</summary>');
    lines.push('');

    for (const r of result.missedRequirements) {
      lines.push(`**[${r.requirement.id}]** ${r.requirement.description}`);
      lines.push('');
      lines.push(`> ${r.explanation}`);

      if (r.locations && r.locations.length > 0) {
        for (const loc of r.locations) {
          lines.push(`> - \`${loc.file}:${loc.line}\` — ${loc.note}`);
        }
      }

      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  if (result.metRequirements.length > 0) {
    lines.push('<details>');
    lines.push('<summary>:white_check_mark: Met Requirements</summary>');
    lines.push('');

    for (const r of result.metRequirements) {
      lines.push(`**[${r.requirement.id}]** ${r.requirement.description}`);
      lines.push('');
      lines.push(`> ${r.explanation}`);
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}
