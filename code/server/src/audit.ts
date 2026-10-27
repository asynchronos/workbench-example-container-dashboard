export type AuditAction = 'start' | 'stop' | 'restart' | 'remove';
export type AuditResult = 'success' | 'failure';

export function auditLog(
  containerId: string,
  containerName: string,
  action: AuditAction,
  result: AuditResult
): void {
  const timestamp = new Date().toISOString();
  console.log(
    `${timestamp} container=${containerId} name=${containerName} action=${action} result=${result}`
  );
}
