import path from 'node:path';

const readOption = (argv, name) => {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path value.`);
  return path.resolve(value);
};

export const readGateRoots = (argv = process.argv.slice(2), { candidateRequired = true } = {}) => {
  const trustedRoot = readOption(argv, '--trusted-root');
  const candidateRoot = readOption(argv, '--candidate-root');
  if (!trustedRoot) throw new Error('--trusted-root is required.');
  if (candidateRequired && !candidateRoot) throw new Error('--candidate-root is required.');
  if (candidateRoot && candidateRoot === trustedRoot) {
    throw new Error('Trusted gate and candidate roots must be distinct repository trees.');
  }
  return { trustedRoot, candidateRoot };
};
