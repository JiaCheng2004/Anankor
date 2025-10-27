#!/usr/bin/env node
import { execSync } from 'node:child_process';

const services = ['apps/master', 'apps/worker'];

for (const service of services) {
  const [, name] = service.split('/');
  const tag = `anankor-${name}:local`;
  console.log(`Building ${service} as ${tag}`);
  execSync(`docker build -t ${tag} -f ${service}/Dockerfile .`, {
    stdio: 'inherit',
  });
}
