# Installing on macOS with Homebrew

Homebrew does not know about DitherBox, and it will not until someone tells it.
There are two ways to do that.

## A personal tap (ten minutes, works today)

A tap is nothing more than a public GitHub repo whose name starts with
`homebrew-`. Homebrew looks inside it for a `Formula` folder.

1. Create a public repo called **`homebrew-tap`** under the same account,
   so `github.com/Pricesswg/homebrew-tap`.

2. Put the formula in it:

   ```sh
   git clone https://github.com/Pricesswg/homebrew-tap.git
   cd homebrew-tap
   mkdir -p Formula
   curl -o Formula/ditherbox.rb \
     https://raw.githubusercontent.com/Pricesswg/DitherBox/main/packaging/homebrew/ditherbox.rb
   git add Formula/ditherbox.rb
   git commit -m "Add ditherbox"
   git push
   ```

3. That is it. Anyone on macOS can now run:

   ```sh
   brew tap pricesswg/tap
   brew install --HEAD pricesswg/tap/ditherbox
   ```

   `--HEAD` builds from the main branch. It is needed only because there is no
   tagged release yet.

### When you tag a release

Once there is a `v0.1.0` tag, the formula can install a fixed version instead
of the moving branch, which is what most people want.

```sh
# in the DitherBox repo
git tag v0.1.0
git push origin v0.1.0

# get the checksum of the tarball GitHub generates for the tag
curl -sL https://github.com/Pricesswg/DitherBox/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
```

Then in `Formula/ditherbox.rb`, uncomment the `url` and `sha256` lines and
paste the checksum in. From that moment `brew install pricesswg/tap/ditherbox`
works without `--HEAD`, and upgrading is a matter of bumping the tag and the
checksum.

### Checking the formula before pushing it

```sh
brew install --build-from-source --HEAD ./ditherbox.rb
brew test ditherbox
brew audit --strict --new ditherbox
```

## Homebrew's own catalogue (later, if ever)

Getting into `homebrew-core`, so that plain `brew install ditherbox` works with
no tap at all, is a different thing. They will not take a package unless the
project has a real following behind it: their rule of thumb is something like
seventy-five stars, forks or watchers, plus a stable release history and no
duplicate of something already packaged.

There is also a rule that matters here: `homebrew-core` does not accept
formulae that are just a wrapper around an npm package. The argument they make
is that `npm install -g` already does that job. A tap has no such rule, which
is the other reason to stay on one.

So: tap now, catalogue only if the thing takes off.
