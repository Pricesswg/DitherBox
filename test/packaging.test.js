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
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggiornaFormula, leggiFormula, urlTarball, urlNpm, repoGitHub, CAMPI,
  IMPRONTA_DA_CALCOLARE,
} from '../scripts/homebrew-formula.js';
import { allineaVersione } from '../scripts/release.js';
import { tempDir } from './helpers.js';

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
  const sorgente = readFileSync(join(ROOT, 'src', 'cli', 'version.js'), 'utf8');
  const dichiarata = sorgente.match(/const VERSION = '([^']+)'/)?.[1];
  assert.equal(dichiarata, pkg.version, 'src/cli/version.js e package.json non concordano');
  assert.equal(campi.version, pkg.version, 'la formula e indietro rispetto al package.json');
});

/**
 * Preparare una versione deve portare avanti anche la formula.
 *
 * Non e' pignoleria: il test qui sopra pretende che la formula dichiari la
 * stessa versione del programma, e `npm run release` lancia i test dopo
 * aver scritto la versione nuova e prima di creare il tag. Con la formula
 * lasciata indietro il rilascio si fermava li', versione gia' scritta e
 * nessun tag, e succedeva solo dal secondo rilascio in poi.
 */
test('allineare la versione porta avanti package.json, version.js e la formula', (t) => {
  const dir = tempDir(t);
  const percorsi = {
    pkg: join(dir, 'package.json'),
    versione: join(dir, 'version.js'),
    formula: join(dir, 'ditherbox.rb'),
    dillo: () => {},
  };
  // Si parte dai file veri, non da finzioni: e' la loro forma che conta.
  writeFileSync(percorsi.pkg, readFileSync(join(ROOT, 'package.json'), 'utf8'));
  writeFileSync(percorsi.versione, readFileSync(join(ROOT, 'src', 'cli', 'version.js'), 'utf8'));
  writeFileSync(percorsi.formula, formula);

  allineaVersione('9.9.9', percorsi);

  const nuovoPkg = JSON.parse(readFileSync(percorsi.pkg, 'utf8'));
  const nuovaVersione = readFileSync(percorsi.versione, 'utf8');
  const nuovaFormula = leggiFormula(readFileSync(percorsi.formula, 'utf8'));

  assert.equal(nuovoPkg.version, '9.9.9');
  assert.equal(nuovaVersione.match(/const VERSION = '([^']+)'/)?.[1], '9.9.9');
  assert.equal(nuovaFormula.version, '9.9.9', 'la formula e rimasta indietro');
  assert.match(nuovaFormula.url, /v9\.9\.9\.tar\.gz$/);
  // L'impronta di quel tarball non esiste ancora: il tag non c'e'.
  assert.equal(nuovaFormula.sha256, IMPRONTA_DA_CALCOLARE);
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

test('aggiornaTap copia la formula, committa e spinge', async (t) => {
  const { aggiornaTap } = await import('../scripts/release.js');
  const { mkdtempSync, writeFileSync: scrivi, readFileSync: leggi, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const esegui = promisify(execFile);

  const base = mkdtempSync(join(tmpdir(), 'tap-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  // Un "remoto" vero ma locale, cosi' il push si puo' provare davvero
  // invece di fidarsi che funzioni.
  const remoto = join(base, 'remoto.git');
  const tap = join(base, 'homebrew-tap');
  await esegui('git', ['init', '--bare', '-b', 'main', remoto]);
  await esegui('git', ['clone', remoto, tap]);
  const nelTap = (...a) => esegui('git', a, { cwd: tap });
  await nelTap('config', 'user.email', 'prova@esempio.invalid');
  await nelTap('config', 'user.name', 'Prova');
  scrivi(join(tap, 'README.md'), '# tap\n');
  await nelTap('add', '-A');
  await nelTap('commit', '-m', 'primo');
  await nelTap('push', '-u', 'origin', 'main');

  const finta = join(base, 'ditherbox.rb');
  const corpo = (sha) => `class Ditherbox < Formula\n  sha256 "${sha}"\n  version "9.9.9"\nend\n`;

  // Con l'impronta segnaposto non deve spingere niente: nel tap
  // diventerebbe un errore di checksum per chi installa.
  scrivi(finta, corpo('0'.repeat(64)));
  assert.throws(() => aggiornaTap(tap, '9.9.9', finta), /impronta segnaposto/);

  scrivi(finta, corpo('b'.repeat(64)));

  aggiornaTap(tap, '9.9.9', finta);

  // La formula e' arrivata dove deve, con il contenuto giusto.
  assert.match(leggi(join(tap, 'Formula', 'ditherbox.rb'), 'utf8'), /9\.9\.9/);

  // E soprattutto e' arrivata nel remoto: e quello che vede chi installa.
  const { stdout } = await esegui('git', ['show', 'main:Formula/ditherbox.rb'], { cwd: remoto });
  assert.match(stdout, /version "9\.9\.9"/, 'la formula non e stata spinta');
  const { stdout: log } = await esegui('git', ['log', '-1', '--format=%s', 'main'], { cwd: remoto });
  assert.equal(log.trim(), 'ditherbox 9.9.9');

  // Rilanciarla senza cambiamenti non deve fare un commit vuoto.
  aggiornaTap(tap, '9.9.9', finta);
  const { stdout: quanti } = await esegui('git', ['rev-list', '--count', 'main'], { cwd: remoto });
  assert.equal(quanti.trim(), '2', 'ha fatto un commit di troppo');
});

test('aggiornaTap dice dove clonare il tap se non lo trova', async () => {
  const { aggiornaTap } = await import('../scripts/release.js');
  assert.throws(
    () => aggiornaTap('/percorso/che/non/esiste', '1.0.0'),
    /non trovo il tap[\s\S]*git clone/,
  );
});
