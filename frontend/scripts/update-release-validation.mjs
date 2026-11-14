export function validateSigningPayload(payload, repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !/^\d+$/.test(payload.runId || '') ||
      !/^[a-f0-9]{40}$/.test(payload.sourceSha || '') || !/^[a-f0-9]{64}$/.test(payload.sha256 || '') ||
      !/^\d+\.\d+\.\d+$/.test(payload.version || '') || typeof payload.signature !== 'string') throw new Error('Invalid public signing payload');
}
export function validateBuildProvenance(payload, repo, run, ref, config) {
  if (run.conclusion !== 'success' || run.head_sha !== payload.sourceSha || run.head_repository?.full_name !== repo ||
      run.path !== '.github/workflows/windows-installer.yml') throw new Error('Build run is not a verified Windows build from this source commit');
  if (ref.object?.type !== 'commit' || ref.object.sha !== payload.sourceSha) throw new Error('Release tag must point directly at the tested build commit');
  if (config.version !== payload.version) throw new Error('Build version does not match release');
}
export function assertIncreasingVersion(version, previousTag) {
  if (!previousTag) return;
  if (!/^v?\d+\.\d+\.\d+$/.test(previousTag)) throw new Error('Previous stable version is invalid');
  const newer = version.split('.').map(Number), old = previousTag.replace(/^v/, '').split('.').map(Number);
  const difference = newer.findIndex((part, index) => part !== old[index]);
  if (difference < 0 || newer[difference] < old[difference]) throw new Error('Stable release version must increase');
}
