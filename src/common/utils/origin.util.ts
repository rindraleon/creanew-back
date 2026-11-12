const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

function ruleToRegExp(rule: string): RegExp {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, (char) =>
    char === '*' ? '[^./]+' : `\\${char}`,
  );
  return new RegExp(`^${escaped}$`, 'i');
}

export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
  allowLocalhost: boolean,
): boolean {
  if (!origin || allowed.includes('*') || allowed.includes(origin)) {
    return true;
  }
  if (allowLocalhost && LOCAL_ORIGIN.test(origin)) {
    return true;
  }
  return allowed.some((rule) => rule.includes('*') && ruleToRegExp(rule).test(origin));
}
