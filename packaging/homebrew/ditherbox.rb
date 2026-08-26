# Formula Homebrew per DitherBox.
#
# Questo file non si installa da qui: Homebrew le formule le prende da un
# "tap", cioe' da un repo pubblico chiamato homebrew-<qualcosa>. Il README
# qui accanto spiega come montarlo, e sono dieci minuti.
#
# Le righe url, sha256 e version le riscrive `npm run release`: a mano
# l'impronta si sbaglia, e l'errore non lo vedi finche' qualcuno non prova
# a installare e Homebrew rifiuta il download.

class Ditherbox < Formula
  desc "Adjustable dithering for photos, with a terminal interface"
  homepage "https://github.com/Pricesswg/DitherBox"
  url "https://github.com/Pricesswg/DitherBox/archive/refs/tags/v0.3.3.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  version "0.3.3"
  license "MIT"

  head "https://github.com/Pricesswg/DitherBox.git", branch: "main"

  # Insegna a Homebrew dove guardare per sapere se e' uscita una versione
  # nuova. Senza, `brew livecheck ditherbox` non sa rispondere e gli
  # strumenti che aggiornano le formule da soli non hanno appigli.
  livecheck do
    url :stable
    strategy :github_latest
  end

  depends_on "node"

  def install
    # L'idioma standard per un programma Node: si installa dentro libexec
    # con le sue dipendenze e si mette in bin solo un collegamento. Le due
    # dipendenze (jpeg-js e pngjs) sono JavaScript puro, quindi non c'e'
    # niente da compilare e la formula non ha bisogno di altro.
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # --list non tocca file ne' vuole un terminale interattivo, e per
    # rispondere deve aver caricato motore, tavolozze, algoritmi e
    # traduzioni: e' il controllo piu' onesto che sia arrivato tutto.
    uscita = shell_output("#{bin}/ditherbox --list")
    assert_match "PALETTES", uscita
    assert_match "atkinson", uscita
    assert_match "megadrive", uscita

    # Che le traduzioni ci siano davvero, non solo l'inglese.
    assert_match "PALETTEN", shell_output("#{bin}/ditherbox --lang de --list")

    # E la prova che conta: si elabora davvero un'immagine. Il PNG qui
    # sotto e' una sfumatura di sedici per sedici, 132 byte, incorporata
    # perche' la prova non deve dipendere dalla rete ne' da file esterni.
    incorporato = <<~B64
      iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVR4AaXBAQ3AQBACsC45A/gX
      iYSfCNrP81JSUlJSUlJSUlJSUlJSUo5YHLE4YnHE4ojFEYsjFkcsjlgcsThiccTiiMURiyMWP43r
      EjuweAXxAAAAAElFTkSuQmCC
    B64
    # Decodificato da Ruby e non dal comando base64: le opzioni di quello
    # cambiano fra macOS e Linux, e la formula gira su tutti e due.
    (testpath/"in.png").binwrite(incorporato.unpack1("m"))

    system bin/"ditherbox", testpath/"in.png",
           "--palette", "gameboy", "--algorithm", "atkinson",
           "-o", testpath/"out.png"

    assert_predicate testpath/"out.png", :exist?
    # I primi otto byte sono la firma del formato: se il file c'e' ma non
    # e' un PNG, l'abbiamo scoperto qui e non l'utente.
    assert_equal "\x89PNG\r\n\x1a\n".b, (testpath/"out.png").binread(8)

    assert_match(/\d+\.\d+\.\d+/, shell_output("#{bin}/ditherbox --version"))
  end
end
