/**
 * Lightweight, deterministic crisis check. This is a safety net, not a
 * diagnosis: if an entry contains explicit crisis language (or the model rates
 * stress at the top of the scale), we surface immediate human-help resources
 * regardless of what the LLM streams back.
 */
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill (myself|me)\b/i,
  /\bsuicid/i,
  /\bend (my|it all|my life)\b/i,
  /\bself[-\s]?harm/i,
  /\bhurt myself\b/i,
  /\bno (reason|point) (to|in) liv/i,
  /\bwant to die\b/i,
  /\bcan'?t go on\b/i,
];

export const CRISIS_RESOURCE_MESSAGE =
  "It sounds like you're carrying something really heavy right now, and you don't have to do it alone. " +
  'Please reach out to someone you trust, or contact a helpline right away — ' +
  'in India you can call Tele-MANAS at 14416 (24x7), or iCall at 9152987821. ' +
  'If you are in immediate danger, contact your local emergency number now.';

export function detectsCrisis(text: string, stressScore?: number): boolean {
  if (typeof stressScore === 'number' && stressScore >= 9) return true;
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}
