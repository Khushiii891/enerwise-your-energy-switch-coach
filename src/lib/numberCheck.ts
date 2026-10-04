// Guards AI explanations: every number in the text must come from the input payload.

function collect(v: unknown, out: number[]) {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") {
    for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, out));
}

/** Possible numeric readings of a token like "1,360", "318,10", "€301.20". */
function readings(tok: string): number[] {
  const res = new Set<number>();
  res.add(Number(tok.replace(/,/g, ""))); // English thousands
  res.add(Number(tok.replace(/\./g, "").replace(",", "."))); // Dutch decimal comma
  return [...res].filter(Number.isFinite);
}

/** Small integers (dates, counts, "3 sentences") and plausible years are always allowed. */
function alwaysOk(n: number) {
  return (Number.isInteger(n) && n >= 0 && n <= 31) || (Number.isInteger(n) && n >= 2020 && n <= 2040);
}

export function findUnknownNumbers(text: string, payload: unknown): string[] {
  const allowed: number[] = [];
  collect(payload, allowed);
  // monthly inputs often get restated yearly by the model — still disallowed (that's maths)
  const ok = (n: number) =>
    alwaysOk(n) ||
    allowed.some((a) => Math.abs(a - n) < 0.006 || Math.abs(a * 100 - n) < 0.006 /* €0.10 → 10 cents */ || (Number.isInteger(n) && Math.round(a) === n));
  const bad: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const tok = m[0];
    if (!readings(tok).some(ok)) bad.push(tok);
  }
  return bad;
}
