/**
 * La versione del programma, in un file per conto suo.
 *
 * Stava in main.js, che pero' importa la TUI: farla leggere anche alla TUI
 * avrebbe chiuso un ciclo fra i due moduli. Qui non importa niente e la
 * puo' leggere chiunque.
 *
 * La riscrive `npm run release`, cercando esattamente questa riga, e
 * test/packaging.test.js controlla che concordi con package.json e con la
 * formula Homebrew.
 */
export const VERSION = '0.2.0';
