/**
 * Stack Module
 *
 * E011: Stack Module Architecture for Hawky
 *
 * Provides language-agnostic stack detection and execution for:
 * - TypeScript/JavaScript (npm, yarn, pnpm)
 * - Go
 * - Rust
 * - Python (pip, poetry, pipenv, uv)
 * - Terraform/OpenTofu
 * - Docker
 * - Kubernetes/Helm/Kustomize
 */
export type { StackType, NodePackageManager, PythonPackageManager, DetectedStack, StackCommandResult, StackGateResult, StackModule, StackDetectionOptions, StackOverrideConfig, StacksConfig, StackRunResult, } from './types';
export { STACK_TYPES } from './types';
export { detectStacks, getPrimaryStack, getStackDetectionConfig } from './detector';
export { registerStackModule, getStackModule, getAllStackModules, hasStackModule, getRegisteredStackTypes, } from './registry';
export { runStackGates, runSingleStackGates, getAvailableStacks, canDetectStack, } from './runner';
export { typescriptStackModule } from './modules/typescript';
export { goStackModule } from './modules/go';
export { rustStackModule } from './modules/rust';
export { pythonStackModule } from './modules/python';
export { terraformStackModule } from './modules/terraform';
export { dockerStackModule } from './modules/docker';
export { kubernetesStackModule } from './modules/kubernetes';
//# sourceMappingURL=index.d.ts.map