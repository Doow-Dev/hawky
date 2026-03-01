/**
 * Tests for Stack Modules
 *
 * Tests individual stack module detection and command generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { typescriptStackModule } from '../../src/stack/modules/typescript';
import { goStackModule } from '../../src/stack/modules/go';
import { rustStackModule } from '../../src/stack/modules/rust';
import { pythonStackModule } from '../../src/stack/modules/python';
import { terraformStackModule } from '../../src/stack/modules/terraform';
import { dockerStackModule } from '../../src/stack/modules/docker';
import { kubernetesStackModule } from '../../src/stack/modules/kubernetes';
import { clearRegistry } from '../../src/stack/registry';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

// Mock @actions/exec
jest.mock('@actions/exec', () => ({
  exec: jest.fn().mockResolvedValue(0),
}));

describe('Stack Modules', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-test-'));
    // Clear registry to prevent duplicate registration errors
    clearRegistry();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('TypeScript Module', () => {
    beforeEach(() => {
      // Re-register module after clearing
      const { typescriptStackModule: mod } = require('../../src/stack/modules/typescript');
      // Module auto-registers on import, but we cleared the registry
    });

    it('should have correct name and displayName', () => {
      expect(typescriptStackModule.name).toBe('typescript');
      expect(typescriptStackModule.displayName).toBe('TypeScript');
    });

    it('should detect from tsconfig.json', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      const result = await typescriptStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('typescript');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should return null when not detected', async () => {
      const result = await typescriptStackModule.detect(tempDir);
      expect(result).toBeNull();
    });

    it('should get build command with npm', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { build: 'tsc' } })
      );
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      const cmd = await typescriptStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('npm run build');
    });

    it('should get build command with yarn', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { build: 'tsc' } })
      );
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');

      const cmd = await typescriptStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('yarn build');
    });

    it('should get build command with pnpm', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { build: 'tsc' } })
      );
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');

      const cmd = await typescriptStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('pnpm build');
    });

    it('should get test command', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { test: 'jest' } })
      );

      const cmd = await typescriptStackModule.getTestCommand(tempDir);
      expect(cmd).toBe('npm test');
    });

    it('should return null for lint command (MVP)', async () => {
      const cmd = await typescriptStackModule.getLintCommand(tempDir);
      expect(cmd).toBeNull();
    });

    it('should return null for security command (MVP)', async () => {
      const cmd = await typescriptStackModule.getSecurityCommand(tempDir);
      expect(cmd).toBeNull();
    });
  });

  describe('Go Module', () => {
    it('should have correct name and displayName', () => {
      expect(goStackModule.name).toBe('go');
      expect(goStackModule.displayName).toBe('Go');
    });

    it('should detect from go.mod', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'go.mod'),
        'module github.com/test/project\n\ngo 1.21'
      );

      const result = await goStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('go');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should get build command', async () => {
      const cmd = await goStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('go build ./...');
    });

    it('should get test command', async () => {
      const cmd = await goStackModule.getTestCommand(tempDir);
      expect(cmd).toBe('go test ./...');
    });
  });

  describe('Rust Module', () => {
    it('should have correct name and displayName', () => {
      expect(rustStackModule.name).toBe('rust');
      expect(rustStackModule.displayName).toBe('Rust');
    });

    it('should detect from Cargo.toml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Cargo.toml'),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await rustStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('rust');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should get build command', async () => {
      const cmd = await rustStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('cargo build');
    });

    it('should get test command', async () => {
      const cmd = await rustStackModule.getTestCommand(tempDir);
      expect(cmd).toBe('cargo test');
    });
  });

  describe('Python Module', () => {
    it('should have correct name and displayName', () => {
      expect(pythonStackModule.name).toBe('python');
      expect(pythonStackModule.displayName).toBe('Python');
    });

    it('should detect from pyproject.toml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[project]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await pythonStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('python');
    });

    it('should detect from requirements.txt', async () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask==2.0.0\n');

      const result = await pythonStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.packageManager).toBe('pip');
    });

    it('should detect poetry package manager', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "test"'
      );

      const result = await pythonStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.packageManager).toBe('poetry');
    });

    it('should get build command with pip', async () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask\n');

      const cmd = await pythonStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('pip install -r requirements.txt');
    });

    it('should get build command with poetry', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "test"'
      );
      fs.writeFileSync(path.join(tempDir, 'poetry.lock'), '');

      const cmd = await pythonStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('poetry install');
    });

    it('should get test command with pytest', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[tool.pytest]\nminversion = "6.0"'
      );

      const cmd = await pythonStackModule.getTestCommand(tempDir);
      expect(cmd).toContain('pytest');
    });
  });

  describe('Terraform Module', () => {
    it('should have correct name and displayName', () => {
      expect(terraformStackModule.name).toBe('terraform');
      expect(terraformStackModule.displayName).toBe('Terraform');
    });

    it('should detect from main.tf', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'main.tf'),
        'resource "aws_instance" "example" {}'
      );

      const result = await terraformStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('terraform');
    });

    it('should get build command', async () => {
      const cmd = await terraformStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('terraform init && terraform validate');
    });

    it('should get test command', async () => {
      const cmd = await terraformStackModule.getTestCommand(tempDir);
      expect(cmd).toBe('terraform plan');
    });
  });

  describe('Docker Module', () => {
    it('should have correct name and displayName', () => {
      expect(dockerStackModule.name).toBe('docker');
      expect(dockerStackModule.displayName).toBe('Docker');
    });

    it('should detect from Dockerfile', async () => {
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM node:20');

      const result = await dockerStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('docker');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect from docker-compose.yml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'docker-compose.yml'),
        'version: "3"\nservices:\n  app:\n    build: .'
      );

      const result = await dockerStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.markers).toContain('docker-compose.yml');
    });

    it('should get build command for Dockerfile', async () => {
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM node:20');

      const cmd = await dockerStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('docker build .');
    });

    it('should get build command for docker-compose', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'docker-compose.yml'),
        'version: "3"\nservices:\n  app:\n    build: .'
      );

      const cmd = await dockerStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('docker compose -f docker-compose.yml build');
    });

    it('should return null for test command', async () => {
      const cmd = await dockerStackModule.getTestCommand(tempDir);
      expect(cmd).toBeNull();
    });
  });

  describe('Kubernetes Module', () => {
    it('should have correct name and displayName', () => {
      expect(kubernetesStackModule.name).toBe('kubernetes');
      expect(kubernetesStackModule.displayName).toBe('Kubernetes');
    });

    it('should detect from kustomization.yaml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'kustomization.yaml'),
        'resources:\n  - deployment.yaml'
      );

      const result = await kubernetesStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('kubernetes');
    });

    it('should detect from Chart.yaml (Helm)', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0'
      );

      const result = await kubernetesStackModule.detect(tempDir);

      expect(result).not.toBeNull();
      expect(result?.markers).toContain('Chart.yaml');
    });

    it('should get build command for Helm', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0'
      );

      const cmd = await kubernetesStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('helm lint .');
    });

    it('should get build command for Kustomize', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'kustomization.yaml'),
        'resources:\n  - deployment.yaml'
      );

      const cmd = await kubernetesStackModule.getBuildCommand(tempDir);
      expect(cmd).toBe('kubectl kustomize .');
    });

    it('should return null for test command', async () => {
      const cmd = await kubernetesStackModule.getTestCommand(tempDir);
      expect(cmd).toBeNull();
    });
  });
});
