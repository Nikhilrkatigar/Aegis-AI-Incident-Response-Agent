// Checks the agent's evidence against what the tools actually returned, so a confident
// conclusion cannot rest on numbers or messages the model invented.

// Concrete, checkable facts: timestamps, versions, measurements, ratios, CIDR ranges, quoted log text.
const FACT = /\b\d{1,2}:\d{2}:\d{2}Z?|\bv\d+\.\d+\.\d+\b|\b\d{2,}(?:\.\d+)?(?=\s?(?:%|ms|MiB|rps|\/min))|\b\d+\/\d+\b|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.0\/24\b/g;
const QUOTE = /['"‘“]([^'"’”]{12,})['"’”]/g;
const WEAK_GROUNDING = 0.5;
export const UNGROUNDED_CONFIDENCE_CAP = 0.55;

const normalise = (fact) => fact.replace(/Z$/, '');

export function extractFacts(text) {
  const facts = (text.match(FACT) || []).map(normalise);
  for (const [, quoted] of text.matchAll(QUOTE)) facts.push(quoted.slice(0, 40));
  return [...new Set(facts)];
}

/**
 * @param {string[]} evidence  the agent's evidence lines
 * @param {string[]} observations  raw tool outputs and alert text the agent actually saw
 */
export function checkGrounding(evidence, observations) {
  const haystack = observations.join('\n');
  let checked = 0;
  let grounded = 0;
  const items = evidence.map((text) => {
    const facts = extractFacts(text);
    if (!facts.length) return { text, status: 'unverifiable' };
    checked++;
    const found = facts.filter((f) => haystack.includes(f));
    const ok = found.length >= Math.ceil(facts.length / 2);
    if (ok) grounded++;
    return { text, status: ok ? 'grounded' : 'unmatched', missing: facts.filter((f) => !found.includes(f)) };
  });
  return { checked, grounded, weak: checked > 0 && grounded / checked < WEAK_GROUNDING, items };
}
