import { readFileSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Thermal zone temps are reported in millidegrees Celsius (e.g. "57600" -> 57.6°C).
export function parseThermalZoneTemp(raw: string): number | null {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value / 1000 : null;
}

// sysfs isn't process-namespaced, so /sys/class/thermal is readable from inside this
// container with no extra mount (verified: same zones show up in other containers on
// this host). There's no single "package" zone on this hardware — every zone reports
// as generic "acpitz" — so the max across all zones is reported as the representative
// CPU/SoC temperature, the usual convention when no package-level sensor exists.
export function getCpuTemperatureC(): number | null {
  let zones: string[];
  try {
    zones = readdirSync('/sys/class/thermal').filter((name) => name.startsWith('thermal_zone'));
  } catch {
    return null;
  }

  let max: number | null = null;
  for (const zone of zones) {
    try {
      const temp = parseThermalZoneTemp(readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf-8'));
      if (temp !== null && (max === null || temp > max)) max = temp;
    } catch {
      // Zone disappeared or isn't readable — skip it.
    }
  }
  return max;
}

export async function getGpuTemperatureC(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=temperature.gpu',
      '--format=csv,noheader,nounits',
    ]);
    const value = Number.parseInt(stdout.split('\n')[0]?.trim() ?? '', 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    // nvidia-smi not on PATH (no GPU / toolkit not configured), or it errored out.
    return null;
  }
}
