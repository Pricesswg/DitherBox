# Formula Homebrew per DitherBox.
#
# Non va installata da qui: Homebrew le formule le prende da un "tap", cioe'
# da un repo pubblico che si chiama homebrew-<nome>. Le istruzioni per
# metterlo su stanno nel README qui accanto.

class Ditherbox < Formula
  desc "Adjustable dithering for photos, with a terminal interface"
  homepage "https://github.com/Pricesswg/DitherBox"
  license "MIT"

  # Finche' non c'e' una versione taggata si installa con --HEAD, che
  # compila direttamente dal ramo principale.
  head "https://github.com/Pricesswg/DitherBox.git", branch: "main"

  # Al primo tag, togliere il commento e riempire lo sha256 con:
  #   curl -sL https://github.com/Pricesswg/DitherBox/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
  #
  # url "https://github.com/Pricesswg/DitherBox/archive/refs/tags/v0.1.0.tar.gz"
  # sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  depends_on "node"

  def install
    # std_npm_args installa dentro libexec e ci porta le due dipendenze
    # (jpeg-js e pngjs), che sono JavaScript puro: niente da compilare.
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # --list non tocca file ne' terminale interattivo, e per rispondere deve
    # aver caricato motore, tavolozze, algoritmi e traduzioni: e' il controllo
    # piu' onesto che il programma sia stato installato per intero.
    uscita = shell_output("#{bin}/ditherbox --list")
    assert_match "PALETTES", uscita
    assert_match "atkinson", uscita

    # E che le traduzioni ci siano davvero, non solo l'inglese.
    assert_match "PALETTEN", shell_output("#{bin}/ditherbox --lang de --list")
  end
end
