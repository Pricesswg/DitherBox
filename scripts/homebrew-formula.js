/**
 * La riscrittura della formula Homebrew, separata dallo script che la usa.
 *
 * Sta in un modulo suo perche' `release.js` fa cose appena viene caricato
 * (controlla il git, costruisce, lancia i test), e una funzione da provare
 * non puo' stare dentro un file cosi'.
 */

/** I tre campi che cambiano a ogni versione. */
export const CAMPI = ['url', 'sha256', 'version'];

/**
 * Riscrive url, sha256 e version dentro il testo della formula, lasciando
 * intatto tutto il resto: commenti, blocco install, blocco test.
 *
 * Sostituzione riga per riga e non rigenerazione del file intero, cosi'
 * quello che qualcuno ha scritto a mano nella formula non sparisce a
 * sorpresa alla prima versione nuova.
 */
export function aggiornaFormula(testo, { url, sha256, version }) {
  const valori = { url, sha256, version };
  let out = testo;
  for (const campo of CAMPI) {
    const valore = valori[campo];
    if (valore === undefined) continue;
    const re = new RegExp(`^(\\s*)${campo} "[^"]*"$`, 'm');
    if (!re.test(out)) throw new Error(`la formula non ha una riga ${campo}`);
    out = out.replace(re, `$1${campo} "${valore}"`);
  }
  return out;
}

/** Legge i campi dalla formula. La usano lo script e i controlli. */
export function leggiFormula(testo) {
  const preso = (campo) => testo.match(new RegExp(`^\\s*${campo} "([^"]*)"$`, 'm'))?.[1];
  return {
    desc: preso('desc'),
    homepage: preso('homepage'),
    url: preso('url'),
    sha256: preso('sha256'),
    version: preso('version'),
    license: preso('license'),
    classe: testo.match(/^class (\w+) < Formula$/m)?.[1],
  };
}

/** L'indirizzo del pacchetto pubblicato su npm. */
export function urlNpm(nome, versione) {
  // Lo "scope" va tolto dal nome del file ma non dal percorso: @tizio/caio
  // sta in /@tizio/caio/-/caio-1.0.0.tgz.
  const corto = nome.replace(/^@[^/]+\//, '');
  return `https://registry.npmjs.org/${nome}/-/${corto}-${versione}.tgz`;
}

/** L'indirizzo del tarball che GitHub genera per un tag. */
export function urlTarball(owner, repo, tag) {
  return `https://github.com/${owner}/${repo}/archive/refs/tags/${tag}.tar.gz`;
}

/** owner e repo ricavati dal campo repository del package.json. */
export function repoGitHub(pkg) {
  const url = pkg.repository?.url || '';
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error('package.json: repository.url non e un indirizzo GitHub');
  return { owner: m[1], repo: m[2] };
}
