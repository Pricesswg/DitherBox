#!/usr/bin/env node
/**
 * Prepara una versione e allinea la formula Homebrew.
 *
 *   npm run release -- 0.2.0             prova a vuoto: non tocca git
 *   npm run release -- 0.2.0 --tag       crea e spinge il tag
 *   npm run release -- --formula-only    rifa' solo la formula sul tag attuale
 *   npm run release -- 0.2.0 --from-npm  punta al pacchetto npm invece che al tag
 *   npm run release -- 0.2.0 --tag --push-tap   e aggiorna anche il tap
 *
 * Il tap e' il pezzo che chi installa vede: `brew upgrade` prende quello
 * che c'e' li' dentro, non i tag di questo repo. Finche' la formula nel
 * tap resta indietro, la versione nuova non la vede nessuno.
 *
 * Perche' esiste: la formula deve portare l'impronta sha256 del tarball che
 * GitHub genera per quel tag. A mano si sbaglia, e l'errore non si vede
 * finche' qualcuno non prova a installare e Homebrew rifiuta il download.
 * Qui l'impronta si scarica, si scrive, e si ricontrolla scaricando di nuovo.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { aggiornaFormula, urlTarball, urlNpm, repoGitHub } from './homebrew-formula.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORMULA = join(ROOT, 'packaging', 'homebrew', 'ditherbox.rb');
const PKG = join(ROOT, 'package.json');
const MAIN = join(ROOT, 'src', 'cli', 'main.js');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const dimmi = (s) => process.stdout.write(`${s}\n`);

/**
 * Copia la formula nel tap e la spinge.
 *
 * Il tap si cerca accanto a questo repo, che e' dove finisce clonandolo
 * come dice il README. Non lo si clona da qui: se non c'e', si dice dove
 * dovrebbe essere e ci si ferma, invece di scaricare roba di nascosto.
 */
export function aggiornaTap(percorso, versione, formula = FORMULA) {
  if (!existsSync(percorso)) {
    throw new Error(
      `non trovo il tap in ${percorso}.\n`
      + '  Clonalo li accanto:\n'
      + `    git clone https://github.com/Pricesswg/homebrew-tap.git ${percorso}`,
    );
  }
  // Un'impronta segnaposto nel tap e' peggio di nessun tap: chi installa
  // riceve un errore di checksum, che sembra un download corrotto e manda
  // a cercare il problema dalla parte sbagliata.
  const sha = readFileSync(formula, 'utf8').match(/^\s*sha256 "([^"]+)"$/m)?.[1];
  if (!sha || /^0+$/.test(sha) || sha.length !== 64) {
    throw new Error(
      `la formula ha ancora l'impronta segnaposto (${sha}).\n`
      + '  Lancia prima `npm run release -- <versione>` perche la calcoli.',
    );
  }

  const nelTap = (...args) => execFileSync('git', args, { cwd: percorso, encoding: 'utf8' }).trim();
  mkdirSync(join(percorso, 'Formula'), { recursive: true });
  copyFileSync(formula, join(percorso, 'Formula', 'ditherbox.rb'));

  if (!nelTap('status', '--porcelain')) {
    dimmi('il tap ha gia la formula aggiornata, niente da spingere');
    return;
  }
  nelTap('add', 'Formula/ditherbox.rb');
  nelTap('commit', '-m', `ditherbox ${versione}`);
  nelTap('push');
  dimmi(`tap aggiornato e spinto: chi ha gia installato ora prende ${versione} con brew upgrade`);
}

/** Scarica un tarball e ne restituisce impronta e misura. */
async function impronta(url) {
  const risposta = await fetch(url, { redirect: 'follow' });
  if (!risposta.ok) {
    // Un 404 qui vuol dire due cose diverse e conviene dirle tutte e due:
    // in certe reti aziendali i tarball /archive/ di GitHub tornano 404
    // anche quando il tag esiste eccome.
    throw new Error(
      `${url} ha risposto ${risposta.status}.\n`
      + '  O il tag non c\'e\' ancora (con --tag lo si crea e si spinge),\n'
      + '  o la rete blocca questo indirizzo.',
    );
  }
  const byte = Buffer.from(await risposta.arrayBuffer());
  // Poche decine di byte sono quasi sempre una pagina di errore travestita:
  // meglio fermarsi che scrivere l'impronta di un messaggio di errore.
  if (byte.length < 1024) {
    throw new Error(`${url}: risposta di soli ${byte.length} byte, non e' un tarball`);
  }
  return { sha: createHash('sha256').update(byte).digest('hex'), byte: byte.length };
}

/** Allinea la versione dove il programma la dichiara. */
function allineaVersione(nuova) {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  if (pkg.version !== nuova) {
    pkg.version = nuova;
    writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
    dimmi(`package.json portato a ${nuova}`);
  }
  // Se questa resta indietro, `ditherbox --version` mente e la prova della
  // formula, che confronta le due, se ne accorge.
  const main = readFileSync(MAIN, 'utf8');
  const dichiarata = main.match(/const VERSION = '([^']+)'/)?.[1];
  if (dichiarata !== nuova) {
    writeFileSync(MAIN, main.replace(/const VERSION = '[^']+'/, `const VERSION = '${nuova}'`));
    dimmi(`src/cli/main.js: VERSION ${dichiarata} -> ${nuova}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const versione = argv.find((a) => /^\d+\.\d+\.\d+$/.test(a));
  const soloFormula = argv.includes('--formula-only');
  const conTag = argv.includes('--tag');

  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  const { owner, repo } = repoGitHub(pkg);
  const nuova = versione || pkg.version;
  const tag = `v${nuova}`;

  if (!soloFormula) {
    if (git('status', '--porcelain')) {
      throw new Error('ci sono modifiche non committate: una versione si taglia su un albero pulito');
    }
    const ramo = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (ramo !== 'main') throw new Error(`sei su "${ramo}": le versioni si tagliano su main`);

    allineaVersione(nuova);

    dimmi('costruisco dist/ e lancio i test...');
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.js')], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' });
  }

  if (conTag) {
    if (git('tag', '--list', tag)) {
      dimmi(`il tag ${tag} c'e' gia', non lo tocco`);
    } else {
      if (git('status', '--porcelain')) {
        git('add', '-A');
        git('commit', '-m', `Version ${nuova}`);
      }
      git('tag', '-a', tag, '-m', `DitherBox ${nuova}`);
      git('push', 'origin', 'main');
      git('push', 'origin', tag);
      dimmi(`tag ${tag} creato e spinto`);
    }
  } else if (!soloFormula) {
    dimmi('\n(prova a vuoto: niente tag, niente push. Aggiungi --tag per farlo davvero.)\n');
  }

  // Due sorgenti possibili. Il tarball del tag GitHub non chiede altro che
  // il tag; quello di npm chiede che il pacchetto sia pubblicato, ma e'
  // immutabile e passa da reti dove i tarball di GitHub non passano.
  const daNpm = argv.includes('--from-npm');
  const url = daNpm ? urlNpm(pkg.name, nuova) : urlTarball(owner, repo, tag);
  dimmi(`scarico ${url}`);
  const esito = await impronta(url);
  dimmi(`  ${esito.byte} byte, sha256 ${esito.sha}`);

  const prima = readFileSync(FORMULA, 'utf8');
  const dopo = aggiornaFormula(prima, { url, sha256: esito.sha, version: nuova });
  writeFileSync(FORMULA, dopo);
  dimmi('packaging/homebrew/ditherbox.rb aggiornata');

  // Ricontrollo: si riscarica e si confronta con quello che e' finito nel
  // file. Un'impronta sbagliata non si vede fino al primo che prova a
  // installare, e a quel punto e' un problema suo, non nostro.
  const verifica = await impronta(url);
  const scritta = dopo.match(/^\s*sha256 "([^"]+)"$/m)?.[1];
  if (verifica.sha !== scritta) {
    throw new Error(`l'impronta nella formula (${scritta}) non corrisponde al tarball (${verifica.sha})`);
  }
  dimmi("ricontrollata: l'impronta nella formula corrisponde al tarball.\n");

  const tapNome = owner.toLowerCase();
  const percorsoTap = resolve(ROOT, '..', 'homebrew-tap');

  if (argv.includes('--push-tap')) {
    aggiornaTap(percorsoTap, nuova);
    dimmi(`
Chi installa per la prima volta:

  brew tap ${tapNome}/tap
  brew install ${tapNome}/tap/ditherbox

Chi ce l'ha gia':

  brew update && brew upgrade ditherbox`);
    return;
  }

  dimmi(`Manca solo il tap, che e' quello che vede chi installa:

  npm run release -- ${nuova} --formula-only --push-tap

oppure a mano:

  cp packaging/homebrew/ditherbox.rb ${percorsoTap}/Formula/ditherbox.rb
  cd ${percorsoTap} && git commit -am "ditherbox ${nuova}" && git push`);
}

// Il corpo gira solo quando questo file e' il programma lanciato: cosi'
// le sue funzioni si possono importare da un test senza che parta un
// rilascio per sbaglio.
const lanciatoDaRiga = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

try {
  if (lanciatoDaRiga) await main();
} catch (err) {
  // Un messaggio, non uno stack: chi lancia questo script vuole sapere che
  // cosa fare, non in che riga di quale file e' successo.
  process.stderr.write(`\nrelease: ${err.message}\n`);
  if (/ha risposto|non e' un tarball/.test(err.message)) {
    process.stderr.write(
      '\nDue vie d\'uscita:\n'
      + '  - se il pacchetto e\' su npm, rilancia con --from-npm\n'
      + '  - oppure calcola l\'impronta a mano e incollala nella riga sha256:\n'
      + '      curl -sL <url qui sopra> | shasum -a 256\n',
    );
  }
  process.exit(1);
}
