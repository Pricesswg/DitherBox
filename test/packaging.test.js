/**
 * Controlli sulla formula Homebrew.
 *
 * Non possono installare niente: qui non c'e' un Mac e non c'e' brew. Ma
 * possono tenere la formula allineata al progetto e farle rispettare le
 * regole di `brew audit`, che sono la ragione piu' comune per cui una
 * formula viene rifiutata. Meglio scoprirlo qui che davanti a un tap.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggiornaFormula, leggiFormula, urlTarball, urlNpm, repoGitHub, CAMPI,
} from '../scripts/homebrew-formula.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERCORSO = join(ROOT, 'packaging', 'homebrew', 'ditherbox.rb');
const formula = readFileSync(PERCORSO, 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const campi = leggiFormula(formula);

test('la formula e Ruby valido', async (t) => {
  try {
    await promisify(execFile)('ruby', ['-c', PERCORSO]);
  } catch (err) {
    if (err.code === 'ENOENT') return t.skip('ruby non disponibile');
    assert.fail(`la formula non compila:\n${err.stderr}`);
  }
});

test('la formula parla dello stesso progetto del package.json', () => {
  assert.equal(campi.classe, 'Ditherbox', 'il nome della classe deve seguire il nome del file');
  assert.equal(campi.license, pkg.license);
  assert.equal(campi.homepage, pkg.homepage.replace(/#readme$/, ''));

  const { owner, repo } = repoGitHub(pkg);
  assert.equal(
    campi.url, urlTarball(owner, repo, `v${campi.version}`),
    'url e version non combaciano fra loro',
  );
});

test('la descrizione rispetta le regole di brew audit', () => {
  const d = campi.desc;
  assert.ok(d, 'manca desc');
  assert.ok(d.length <= 80, `desc lunga ${d.length}, il massimo e 80`);
  assert.doesNotMatch(d, /\.$/, 'desc non deve finire con un punto');
  assert.doesNotMatch(d, /^(a|an|the)\s/i, 'desc non deve cominciare con un articolo');
  assert.doesNotMatch(d, /^ditherbox\b/i, 'desc non deve cominciare col nome della formula');
  assert.match(d, /^[A-Z]/, 'desc comincia con la maiuscola');
});

test('la formula installa e prova quello che deve', () => {
  // L'idioma per un programma Node: dentro libexec, e in bin solo un
  // collegamento. Se qualcuno lo cambia in un `npm install -g` secco, i
  // file finiscono fuori dal prefisso e brew se ne lamenta.
  assert.match(formula, /system "npm", "install", \*std_npm_args/);
  assert.match(formula, /bin\.install_symlink Dir\["#\{libexec\}\/bin\/\*"\]/);
  assert.match(formula, /depends_on "node"/);

  // La prova deve elaborare davvero un'immagine, non limitarsi a stampare
  // l'aiuto: un pacchetto puo' benissimo stampare e poi morire sul lavoro.
  assert.match(formula, /out\.png/, 'il blocco test non produce nessun file');
  assert.match(formula, /assert_predicate testpath\/"out\.png", :exist\?/);
});

test('il PNG incorporato nella prova e davvero un PNG', () => {
  const b64 = formula.match(/incorporato = <<~B64\n([\s\S]*?)\n\s*B64/)?.[1];
  assert.ok(b64, 'non trovo il PNG incorporato nel blocco test');
  const byte = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
  assert.ok(byte.length > 100, `sono solo ${byte.length} byte`);
  assert.equal(
    byte.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
    'la firma non e quella di un PNG',
  );
});

test('aggiornaFormula riscrive i tre campi e non tocca il resto', () => {
  const nuova = aggiornaFormula(formula, {
    url: 'https://esempio.invalid/x-9.9.9.tar.gz',
    sha256: 'a'.repeat(64),
    version: '9.9.9',
  });
  const dopo = leggiFormula(nuova);
  assert.equal(dopo.url, 'https://esempio.invalid/x-9.9.9.tar.gz');
  assert.equal(dopo.sha256, 'a'.repeat(64));
  assert.equal(dopo.version, '9.9.9');

  // Tutto il resto deve essere rimasto identico: si confrontano le righe
  // che non sono fra quelle che la funzione ha il permesso di toccare.
  const intoccabili = (t) => t.split('\n')
    .filter((r) => !CAMPI.some((c) => new RegExp(`^\\s*${c} "`).test(r)));
  assert.deepEqual(intoccabili(nuova), intoccabili(formula));

  // E riapplicarla non deve cambiare altro ancora.
  const ancora = aggiornaFormula(nuova, {
    url: 'https://esempio.invalid/x-9.9.9.tar.gz',
    sha256: 'a'.repeat(64),
    version: '9.9.9',
  });
  assert.equal(ancora, nuova);
});

test('aggiornaFormula protesta se un campo non c e', () => {
  assert.throws(
    () => aggiornaFormula('class X < Formula\nend\n', { url: 'x' }),
    /non ha una riga url/,
  );
});

test('la versione della formula e quella che il programma dichiara', () => {
  const main = readFileSync(join(ROOT, 'src', 'cli', 'main.js'), 'utf8');
  const dichiarata = main.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(dichiarata, pkg.version, 'src/cli/main.js e package.json non concordano');
  assert.equal(campi.version, pkg.version, 'la formula e indietro rispetto al package.json');
});

test('gli indirizzi delle due sorgenti si costruiscono giusti', () => {
  assert.equal(
    urlTarball('Pricesswg', 'DitherBox', 'v1.2.3'),
    'https://github.com/Pricesswg/DitherBox/archive/refs/tags/v1.2.3.tar.gz',
  );
  assert.equal(
    urlNpm('ditherbox', '1.2.3'),
    'https://registry.npmjs.org/ditherbox/-/ditherbox-1.2.3.tgz',
  );
  // Con lo scope il nome del file lo perde, il percorso no.
  assert.equal(
    urlNpm('@tizio/caio', '0.1.0'),
    'https://registry.npmjs.org/@tizio/caio/-/caio-0.1.0.tgz',
  );
});

test('repoGitHub legge owner e repo, e protesta se non e GitHub', () => {
  assert.deepEqual(
    repoGitHub({ repository: { url: 'git+https://github.com/Tizio/Caio.git' } }),
    { owner: 'Tizio', repo: 'Caio' },
  );
  assert.deepEqual(
    repoGitHub({ repository: { url: 'git@github.com:Tizio/Caio.git' } }),
    { owner: 'Tizio', repo: 'Caio' },
  );
  assert.throws(() => repoGitHub({}), /non e un indirizzo GitHub/);
  assert.throws(
    () => repoGitHub({ repository: { url: 'https://gitlab.com/a/b.git' } }),
    /non e un indirizzo GitHub/,
  );
});
