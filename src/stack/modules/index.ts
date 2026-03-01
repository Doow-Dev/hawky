/**
 * Stack Modules Index
 *
 * Exports all stack module implementations.
 * Importing this file auto-registers all modules.
 */

// TypeScript/JavaScript
export { typescriptStackModule } from './typescript';

// Go
export { goStackModule } from './go';

// Rust
export { rustStackModule } from './rust';

// Python
export { pythonStackModule } from './python';

// Infrastructure
export { terraformStackModule } from './terraform';
export { dockerStackModule } from './docker';
export { kubernetesStackModule } from './kubernetes';
