import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.SITE_DATA ?? 'https://raw.githubusercontent.com/beetlebox-studios/beetlebox-studios.github.io/main/data';

async function load(name) {
  if (/^https?:/.test(source)) {
    const res = await fetch(`${source}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(join(source, name), 'utf8'));
}

const LINK_ORDER = ['personal', 'itch', 'github', 'twitter', 'newgrounds', 'youtube', 'linkedin'];

const STORE_LINKS = [
  { key: 'steam', label: 'Wishlist on Steam', color: '000000', logo: 'steam' },
  { key: 'itch', label: 'Play on itch.io', color: 'FA5C5C', logo: 'itchdotio' },
  { key: 'play', label: 'Play in browser', color: 'E77046' },
];

const STATUS_COLORS = { Released: '2EA043', 'In Development': 'D29922', Shelved: '6E7681' };
const DRAFT_COLOR = '8957E5';
const JAM_COLOR = 'E77046';
const GENRE_COLOR = '0969DA';
const YEAR_COLOR = '57606A';
const DEFAULT_THRESHOLD = 0.05;

function badge(text, color, { logo, logoColor } = {}) {
  const label = encodeURIComponent(text.replace(/-/g, '--').replace(/_/g, '__'));
  const params = ['style=for-the-badge'];
  if (logo) params.push(`logo=${logo}`, `logoColor=${logoColor ? `%23${logoColor}` : 'white'}`);
  return `![${text}](https://img.shields.io/badge/${label}-%23${color}.svg?${params.join('&')})`;
}

function byOrder(a, b) {
  return (a.order ?? Infinity) - (b.order ?? Infinity);
}

async function repoLanguages(repo) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/beetlebox-studios/${repo}/languages`, { headers });
  if (!res.ok) {
    console.warn(`${repo}: languages unavailable (HTTP ${res.status}), using its listed stack only`);
    return {};
  }
  return res.json();
}

function splitMeta(meta, tech) {
  const parts = (meta ?? '').split('·').map((t) => t.trim()).filter(Boolean);
  const techLabels = {};
  const genres = [];
  let year = null;
  for (const part of parts) {
    const entry = tech.find((t) => part.toLowerCase().startsWith(t.label.toLowerCase()));
    if (/^\d{4}$/.test(part)) year = part;
    else if (entry) techLabels[entry.id] = part;
    else genres.push(part);
  }
  return { techLabels, genres, year };
}

function stackFor(g, tech, languages, techLabels) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  const ids = new Set([...(g.stack ?? []), ...Object.keys(techLabels)]);
  for (const t of tech) {
    const bytes = (t.languages ?? []).reduce((sum, lang) => sum + (languages[lang] ?? 0), 0);
    if (bytes > 0 && total > 0 && bytes / total >= (t.threshold ?? DEFAULT_THRESHOLD)) ids.add(t.id);
  }
  return tech.filter((t) => ids.has(t.id));
}

function list(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

function team(people) {
  const rows = people.map((p) => {
    const key = LINK_ORDER.find((k) => p.links?.[k]);
    const name = key ? `<a href="${p.links[key]}">${p.name}</a>` : p.name;
    return [
      '  <tr>',
      `    <td><strong>${(p.roles ?? [p.role]).join(', ')}</strong></td>`,
      `    <td>${name}</td>`,
      `    <td>${p.founder ? 'Founding member' : 'Collaborator'}</td>`,
      '  </tr>',
    ].join('\n');
  });
  return ['<table>', ...rows, '</table>'].join('\n');
}

function project(g, tech, languages) {
  const out = [`### ${g.title}`, ''];
  const store = STORE_LINKS.find((s) => g.links?.[s.key]);
  const href = store ? g.links[store.key] : null;
  if (g.image) {
    const img = `<img src="${g.image}" alt="${g.title}" width="260"/>`;
    out.push(href ? `<a href="${href}">${img}</a>` : img, '');
  }
  const { techLabels, genres, year } = splitMeta(g.meta, tech);
  const details = [];
  if (g.status) details.push(badge(g.status, STATUS_COLORS[g.status] ?? YEAR_COLOR));
  if (g.draft) details.push(badge('Draft', DRAFT_COLOR));
  if (g.jam) details.push(badge(g.jam.label && g.jam.label !== 'JAM' ? `${g.jam.label} Jam` : 'Jam', JAM_COLOR));
  for (const genre of genres) details.push(badge(genre, GENRE_COLOR));
  if (year) details.push(badge(year, YEAR_COLOR));
  const stack = stackFor(g, tech, languages, techLabels).map((t) =>
    badge(techLabels[t.id] ?? t.label, t.color, { logo: t.logo, logoColor: t.logoColor }),
  );
  const lines = [];
  if (g.description) lines.push(g.description);
  if (g.credits?.length) lines.push(`By ${list(g.credits)}.`);
  if (details.length) lines.push(details.join(' '));
  if (stack.length) lines.push(stack.join(' '));
  if (store) lines.push(`[${badge(store.label, store.color, { logo: store.logo })}](${href})`);
  out.push(lines.join('<br>\n'));
  return out.join('\n');
}

const [games, people, tech] = await Promise.all([load('games.json'), load('people.json'), load('tech.json')]);
const ordered = games.slice().sort(byOrder);
const languages = Object.fromEntries(
  await Promise.all(ordered.filter((g) => g.repo).map(async (g) => [g.repo, await repoLanguages(g.repo)])),
);
const template = readFileSync(join(root, 'profile/README.template.md'), 'utf8');
const readme = template
  .replace('{{team}}', team(people))
  .replace('{{projects}}', ordered.map((g) => project(g, tech, languages[g.repo] ?? {})).join('\n\n'));
writeFileSync(join(root, 'profile/README.md'), readme);
console.log(`README built from ${games.length} projects and ${people.length} people`);
