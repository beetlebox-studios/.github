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
  { key: 'steam', label: 'Wishlist on Steam' },
  { key: 'itch', label: 'Play on itch.io' },
  { key: 'play', label: 'Play in browser' },
];

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

function project(g) {
  const out = [`### ${g.title}`, ''];
  const store = STORE_LINKS.find((s) => g.links?.[s.key]);
  const href = store ? g.links[store.key] : null;
  if (g.image) {
    const img = `<img src="${g.image}" alt="${g.title}" width="260"/>`;
    out.push(href ? `<a href="${href}">${img}</a>` : img, '');
  }
  const lines = [];
  if (g.description) lines.push(g.description);
  if (g.credits?.length) lines.push(`By ${list(g.credits)}.`);
  const facts = [g.meta, g.draft ? 'Draft' : null, g.status, g.jam ? 'Jam game' : null].filter(Boolean).join(' · ');
  if (facts) lines.push(`*${facts}*`);
  if (store) lines.push(`[${store.label}](${href})`);
  out.push(lines.join('<br>\n'));
  return out.join('\n');
}

const [games, people] = await Promise.all([load('games.json'), load('people.json')]);
const template = readFileSync(join(root, 'profile/README.template.md'), 'utf8');
const readme = template
  .replace('{{team}}', team(people))
  .replace('{{projects}}', games.map(project).join('\n\n'));
writeFileSync(join(root, 'profile/README.md'), readme);
console.log(`README built from ${games.length} projects and ${people.length} people`);
