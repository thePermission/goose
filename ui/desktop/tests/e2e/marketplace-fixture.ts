import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Build a local git-repo Claude marketplace with one installable plugin ("demo"). */
export function createMarketplaceFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'goose-mp-e2e-'));

  mkdirSync(join(repo, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(repo, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'e2e-market',
      owner: { name: 'e2e' },
      plugins: [{ name: 'demo', source: './plugins/demo', description: 'a demo plugin' }],
    })
  );

  const demoMeta = join(repo, 'plugins', 'demo', '.claude-plugin');
  mkdirSync(demoMeta, { recursive: true });
  writeFileSync(
    join(demoMeta, 'plugin.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', description: 'a demo plugin' })
  );

  const skill = join(repo, 'plugins', 'demo', 'skills', 'x');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: x\ndescription: does x\n---\nBody.\n');

  const git = (args: string[]) => execFileSync('git', args, { cwd: repo });
  git(['init']);
  git(['config', 'user.email', 'e2e@example.com']);
  git(['config', 'user.name', 'e2e']);
  git(['add', '.']);
  git(['commit', '-m', 'init']);

  return repo;
}
