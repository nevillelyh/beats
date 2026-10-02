export function lickPrefix(name) {
  const trimmed = name.trim();
  // Explicit numbering preserves digits in the series code (MGL1 #11).
  const explicit = trimmed.match(/^(\S+?)\s*[#<\[(]\s*[0-9]+/);
  let prefix = explicit ? explicit[1] : trimmed.split(/\s+/)[0];
  if (!explicit) {
    // Strip simple attached numbering, but keep mixed codes such as S2E2.
    prefix = prefix.replace(/^([^0-9]+)[0-9]+(?:\.[0-9]+)*$/, "$1");
  }
  prefix = prefix.replace(/[\s#<>\[\](){}:._-]+$/, "");
  return /\p{L}/u.test(prefix) ? prefix : "";
}

export function lickPrefixGroups(names) {
  const distinct = new Set(names);
  if (distinct.size < 25) return [];

  const groups = new Map();
  for (const name of distinct) {
    const prefix = lickPrefix(name);
    if (!prefix) continue;
    const key = prefix.toLowerCase();
    const group = groups.get(key) || { prefix, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const qualifying = [...groups.values()].filter((group) => group.count >= 5);
  return qualifying.length >= 2
    ? qualifying.sort((a, b) => a.prefix.localeCompare(b.prefix))
    : [];
}
