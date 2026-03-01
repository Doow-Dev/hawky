/**
 * Stack Detection Engine
 *
 * S086: Detects language/technology stacks in a repository by scanning
 * for marker files. Returns all detected stacks with confidence scores.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import type {
  DetectedStack,
  StackType,
  StackDetectionOptions,
  NodePackageManager,
  PythonPackageManager,
} from './types';
import { STACK_TYPES } from './types';

/**
 * Marker file definition for stack detection
 */
interface MarkerFile {
  /** File path pattern (relative to root) */
  path: string;

  /** Whether to check file contents for additional markers */
  checkContents?: boolean;

  /** Content pattern to match (regex) */
  contentPattern?: RegExp;

  /** Confidence boost when this marker is found (0-1) */
  confidence: number;

  /** Whether this is a glob pattern */
  isGlob?: boolean;
}

/**
 * Stack detection configuration
 */
interface StackDetectionConfig {
  type: StackType;
  displayName: string;
  markers: MarkerFile[];
  /** Function to detect package manager */
  detectPackageManager?: (rootDir: string) => Promise<string | undefined>;
}

/**
 * Detection configurations for all stacks
 */
const STACK_CONFIGS: StackDetectionConfig[] = [
  {
    type: 'typescript',
    displayName: 'TypeScript',
    markers: [
      { path: 'tsconfig.json', confidence: 0.9 },
      { path: 'tsconfig.build.json', confidence: 0.7 },
      {
        path: 'package.json',
        checkContents: true,
        contentPattern: /"typescript":/,
        confidence: 0.8,
      },
      {
        path: 'package.json',
        checkContents: true,
        contentPattern: /\.tsx?"/,
        confidence: 0.6,
      },
    ],
    detectPackageManager: detectNodePackageManager,
  },
  {
    type: 'go',
    displayName: 'Go',
    markers: [
      { path: 'go.mod', confidence: 0.95 },
      { path: 'go.sum', confidence: 0.7 },
      { path: 'go.work', confidence: 0.8 },
    ],
  },
  {
    type: 'rust',
    displayName: 'Rust',
    markers: [
      { path: 'Cargo.toml', confidence: 0.95 },
      { path: 'Cargo.lock', confidence: 0.7 },
      { path: 'rust-toolchain.toml', confidence: 0.6 },
      { path: 'rust-toolchain', confidence: 0.5 },
    ],
  },
  {
    type: 'python',
    displayName: 'Python',
    markers: [
      { path: 'pyproject.toml', confidence: 0.9 },
      { path: 'setup.py', confidence: 0.85 },
      { path: 'setup.cfg', confidence: 0.7 },
      { path: 'requirements.txt', confidence: 0.75 },
      { path: 'Pipfile', confidence: 0.85 },
      { path: 'Pipfile.lock', confidence: 0.7 },
      { path: 'poetry.lock', confidence: 0.8 },
      { path: 'uv.lock', confidence: 0.8 },
    ],
    detectPackageManager: detectPythonPackageManager,
  },
  {
    type: 'terraform',
    displayName: 'Terraform',
    markers: [
      { path: 'main.tf', confidence: 0.9 },
      { path: 'terraform.tf', confidence: 0.9 },
      { path: 'versions.tf', confidence: 0.8 },
      { path: '.terraform', confidence: 0.7 },
      { path: '.terraform.lock.hcl', confidence: 0.85 },
    ],
  },
  {
    type: 'docker',
    displayName: 'Docker',
    markers: [
      { path: 'Dockerfile', confidence: 0.95 },
      { path: 'docker-compose.yml', confidence: 0.9 },
      { path: 'docker-compose.yaml', confidence: 0.9 },
      { path: 'compose.yml', confidence: 0.85 },
      { path: 'compose.yaml', confidence: 0.85 },
      { path: '.dockerignore', confidence: 0.5 },
    ],
  },
  {
    type: 'kubernetes',
    displayName: 'Kubernetes',
    markers: [
      { path: 'kustomization.yaml', confidence: 0.95 },
      { path: 'kustomization.yml', confidence: 0.95 },
      { path: 'Chart.yaml', confidence: 0.95 }, // Helm
      { path: 'Chart.yml', confidence: 0.95 },
      { path: 'helmfile.yaml', confidence: 0.9 },
      { path: 'k8s', confidence: 0.8 }, // k8s directory
      { path: 'kubernetes', confidence: 0.8 }, // kubernetes directory
    ],
  },
];

/**
 * Detect Node.js package manager from lockfiles
 */
async function detectNodePackageManager(
  rootDir: string
): Promise<NodePackageManager | undefined> {
  // Check for lockfiles in order of preference
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    return 'npm';
  }
  // Default to npm if package.json exists but no lockfile
  if (fs.existsSync(path.join(rootDir, 'package.json'))) {
    return 'npm';
  }
  return undefined;
}

/**
 * Detect Python package manager from project files
 */
async function detectPythonPackageManager(
  rootDir: string
): Promise<PythonPackageManager | undefined> {
  // Check for specific package manager files
  if (fs.existsSync(path.join(rootDir, 'uv.lock'))) {
    return 'uv';
  }
  if (
    fs.existsSync(path.join(rootDir, 'poetry.lock')) ||
    fs.existsSync(path.join(rootDir, 'pyproject.toml'))
  ) {
    // Check if pyproject.toml uses poetry
    const pyprojectPath = path.join(rootDir, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('[tool.poetry]')) {
          return 'poetry';
        }
      } catch {
        // Ignore read errors
      }
    }
    if (fs.existsSync(path.join(rootDir, 'poetry.lock'))) {
      return 'poetry';
    }
  }
  if (
    fs.existsSync(path.join(rootDir, 'Pipfile')) ||
    fs.existsSync(path.join(rootDir, 'Pipfile.lock'))
  ) {
    return 'pipenv';
  }
  if (fs.existsSync(path.join(rootDir, 'requirements.txt'))) {
    return 'pip';
  }
  return undefined;
}

/**
 * Check if a file or directory exists
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Check if file contents match a pattern
 */
function checkFileContents(filePath: string, pattern: RegExp): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return pattern.test(content);
  } catch {
    return false;
  }
}

/**
 * Detect a single stack type
 */
async function detectStack(
  config: StackDetectionConfig,
  rootDir: string
): Promise<DetectedStack | null> {
  const foundMarkers: string[] = [];
  let maxConfidence = 0;
  const reasons: string[] = [];

  for (const marker of config.markers) {
    const fullPath = path.join(rootDir, marker.path);
    const exists = fileExists(fullPath);

    if (exists) {
      // If content check is required, verify it
      if (marker.checkContents && marker.contentPattern) {
        if (!checkFileContents(fullPath, marker.contentPattern)) {
          continue; // Pattern not found in file
        }
      }

      foundMarkers.push(marker.path);
      if (marker.confidence > maxConfidence) {
        maxConfidence = marker.confidence;
      }

      // Build reason string
      if (marker.checkContents) {
        reasons.push(`${marker.path} contains ${config.type} markers`);
      } else {
        reasons.push(`found ${marker.path}`);
      }
    }
  }

  // No markers found
  if (foundMarkers.length === 0) {
    return null;
  }

  // Detect package manager if applicable
  let packageManager: string | undefined;
  if (config.detectPackageManager) {
    packageManager = await config.detectPackageManager(rootDir);
  }

  const result: DetectedStack = {
    type: config.type,
    confidence: maxConfidence,
    reason: reasons.join(', '),
    markers: foundMarkers,
    rootDir,
  };

  // Only add packageManager if defined (exactOptionalPropertyTypes)
  if (packageManager !== undefined) {
    result.packageManager = packageManager;
  }

  return result;
}

/**
 * Detect all stacks in a directory
 *
 * Scans for marker files and returns all detected stacks.
 * Repos can be polyglot (multiple stacks).
 *
 * @param rootDir - Root directory to scan
 * @param options - Detection options
 * @returns Array of detected stacks sorted by confidence
 */
export async function detectStacks(
  rootDir: string,
  options: StackDetectionOptions = {}
): Promise<DetectedStack[]> {
  const { enabled = 'auto', disabled = [], minConfidence = 0.5 } = options;

  // Determine which stacks to check
  let stacksToCheck: StackType[];
  if (enabled === 'auto') {
    stacksToCheck = STACK_TYPES;
  } else {
    stacksToCheck = enabled;
  }

  // Filter out disabled stacks
  stacksToCheck = stacksToCheck.filter((s) => !disabled.includes(s));

  const detectedStacks: DetectedStack[] = [];

  for (const stackType of stacksToCheck) {
    const config = STACK_CONFIGS.find((c) => c.type === stackType);
    if (!config) {
      core.debug(`No detection config for stack type: ${stackType}`);
      continue;
    }

    const result = await detectStack(config, rootDir);
    if (result && result.confidence >= minConfidence) {
      detectedStacks.push(result);
      core.debug(
        `Detected ${stackType} stack (confidence: ${result.confidence}): ${result.reason}`
      );
    }
  }

  // Sort by confidence (highest first)
  detectedStacks.sort((a, b) => b.confidence - a.confidence);

  return detectedStacks;
}

/**
 * Check for .tf files in directory (for Terraform detection)
 */
export async function hasTerraformFiles(rootDir: string): Promise<boolean> {
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.tf')) {
        return true;
      }
    }
    // Also check subdirectories one level deep
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subdir = path.join(rootDir, entry.name);
        try {
          const subEntries = fs.readdirSync(subdir);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith('.tf')) {
              return true;
            }
          }
        } catch {
          // Ignore permission errors
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Check for Kubernetes manifests (yaml files with apiVersion)
 */
export async function hasKubernetesManifests(rootDir: string): Promise<boolean> {
  const k8sDirs = ['k8s', 'kubernetes', 'deploy', 'manifests'];

  for (const dir of k8sDirs) {
    const dirPath = path.join(rootDir, dir);
    if (fs.existsSync(dirPath)) {
      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
            const filePath = path.join(dirPath, entry);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              if (content.includes('apiVersion:') && content.includes('kind:')) {
                return true;
              }
            } catch {
              // Ignore read errors
            }
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }
  }
  return false;
}

/**
 * Get the primary stack (highest confidence)
 */
export function getPrimaryStack(stacks: DetectedStack[]): DetectedStack | null {
  if (stacks.length === 0) {
    return null;
  }
  // Already sorted by confidence
  const primary = stacks[0];
  return primary ?? null;
}

/**
 * Get detection config for a stack type (for testing)
 */
export function getStackDetectionConfig(
  type: StackType
): StackDetectionConfig | undefined {
  return STACK_CONFIGS.find((c) => c.type === type);
}
