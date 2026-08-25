# Installing on macOS with Homebrew

Homebrew does not know about DitherBox, and it will not until someone tells
it. This folder holds the formula and the steps.

## Where these commands run

In the ordinary macOS Terminal, from inside a local clone of this
repository. Nothing else: no special shell, no container.

From nothing, on a Mac:

```sh
brew install node                 # if node --version says nothing

mkdir -p ~/progetti && cd ~/progetti
git clone https://github.com/Pricesswg/DitherBox.git
cd DitherBox
npm install --omit=dev            # two packages, nothing to compile
```

`--omit=dev` skips Playwright, which is only there for the browser layout
checks. Without it `npm test` runs 118 tests and skips the 7 that need a
browser, which is all `npm run release` requires. Leave the flag off if you
want to run those too, and expect a browser download.

The tap wants to sit **next to** this repo, because that is where
`--push-tap` looks for it:

```
~/progetti/
  DitherBox/        <- you run the commands here
  homebrew-tap/     <- --push-tap writes here
```

One npm quirk worth knowing: the `--` in `npm run release -- 0.1.0` is what
makes npm pass `0.1.0` through to the script instead of eating it. Without it
the script sees no version and falls back to whatever is in `package.json`.

## The short version

Once, to set the tap up:

```sh
# in the DitherBox repo
npm run release -- 0.1.0 --tag
```

Then copy `ditherbox.rb` into a public repo of yours named `homebrew-tap`,
under `Formula/`, and push. From that moment anyone on a Mac can run:

```sh
brew tap pricesswg/tap
brew install pricesswg/tap/ditherbox
```

The rest of this file explains each of those steps and what can go wrong.

## 1. Tag a version

Homebrew installs a fixed version, not a moving branch, so there has to be a
tag and the formula has to carry the fingerprint of exactly that tag's
tarball. `npm run release` does the whole thing:

```sh
npm run release -- 0.1.0 --tag
```

It refuses to run on a dirty tree or off `main`, sets the version in
`package.json`, in `src/cli/version.js` and in the formula so `ditherbox
--version` does not lie,
rebuilds `dist/`, runs the tests, creates and pushes the tag, downloads the
tarball GitHub generates for it, writes `url`, `sha256` and `version` into the
formula, and then downloads the tarball a second time to check that what
landed in the file really matches. A wrong fingerprint is invisible until
somebody tries to install and Homebrew refuses the download, which is a bad
place to find out.

Without `--tag` it does everything except touching git, which is the way to
see what it would do.

### If the download fails

Two things produce the same 404 and it is worth knowing which you have: the
tag genuinely is not there yet, or the network will not fetch it. Some
corporate proxies return 404 for every `github.com/.../archive/...` path even
when the tag exists, so the script names both possibilities rather than
guessing.

There are two ways round it. If the package is published on npm, use that
tarball instead, which is immutable and served from a different host:

```sh
npm run release -- 0.1.0 --from-npm
```

Otherwise compute the fingerprint by hand and paste it into the `sha256` line:

```sh
curl -sL https://github.com/Pricesswg/DitherBox/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
```

## 2. Create the tap

A tap is nothing more than a public GitHub repo whose name starts with
`homebrew-`. Homebrew looks inside it for a `Formula` folder. The name after
the dash is what people type, so `homebrew-tap` becomes `pricesswg/tap`.

```sh
# create a public repo called homebrew-tap, then:
git clone https://github.com/Pricesswg/homebrew-tap.git
cd homebrew-tap
mkdir -p Formula
cp ../DitherBox/packaging/homebrew/ditherbox.rb Formula/ditherbox.rb
git add Formula/ditherbox.rb
git commit -m "ditherbox 0.1.0"
git push
```

That is the whole tap. There is no registration, no review, nothing to wait
for.

## 3. Check it before telling anyone

On a Mac, from inside the tap:

```sh
brew install --build-from-source ./Formula/ditherbox.rb
brew test ditherbox
brew audit --strict --new ditherbox
```

`brew test` runs the block at the bottom of the formula. It does not just
print the help: it decodes a sixteen-pixel PNG embedded in the formula itself,
runs it through the Game Boy palette with Atkinson, and checks that a real PNG
comes out the other end. A package that installs and then falls over on the
first actual job would be caught here.

`brew audit` is the one that finds the small stuff: a description that starts
with an article, a trailing full stop, files landing outside the prefix. Some
of its rules are already checked by `npm test` in `test/packaging.test.js`, so
most of the surprises are gone before you get here.

## Later versions, and who has to do what

Worth being clear about this, because it is easy to get the wrong idea from
the fact that a formula names one fixed version.

Homebrew does not watch your tags. What it watches is the **tap**: `brew
update` is a `git pull` on every tap, and `brew upgrade` then installs
whatever is newer there than what is on the machine. So the update is
automatic on the installing side and manual on yours. Until the formula in
the tap is bumped, a new tag might as well not exist.

Which makes bumping the tap the step that must not be forgotten, so it is
part of the script:

```sh
npm run release -- 0.2.0 --tag --push-tap
```

That tags, updates the formula, copies it into `../homebrew-tap`, commits and
pushes. It expects the tap cloned next to this repo, and says so if it is not
there rather than cloning things behind your back. It will not make an empty
commit if the formula has not changed.

Anyone who already has it installed then gets the new version with:

```sh
brew update && brew upgrade ditherbox
```

The formula also carries a `livecheck` block, which is how you ask Homebrew
whether you are behind without installing anything:

```sh
brew livecheck ditherbox
```

### Doing it from CI instead

If you would rather the tap updated itself when you push a tag, a GitHub
Actions workflow in this repo can do it: check out the tap with a personal
access token that has write access to it, run
`npm run release -- --formula-only --push-tap`, done. It needs one secret,
which is the only reason it is not here already: a token with write access to
another repo is worth deciding on deliberately rather than inheriting from a
README.

## What the formula does

```ruby
system "npm", "install", *std_npm_args
bin.install_symlink Dir["#{libexec}/bin/*"]
```

Those two lines are the standard shape for a Node program in Homebrew. The
package and its dependencies go inside `libexec`, and only a symlink goes in
`bin`, so nothing scatters into the Homebrew prefix. `depends_on "node"` means
Homebrew installs Node itself if the machine has not got it, which is the
whole reason to prefer this over `npm install -g` for someone who does not
otherwise want Node around.

The two dependencies, `jpeg-js` and `pngjs`, are pure JavaScript. There is
nothing to compile, no native module, no build toolchain.

## Why not plain `brew install ditherbox`

That would mean getting into `homebrew-core`, Homebrew's own catalogue, and
they will not take this. Their rules on what is acceptable rule out software
that is already installable through a language's own package manager, which
covers anything that is an npm package underneath, and separately they ask for
a project with a real following rather than one its author has just submitted.

A tap has neither rule. The cost to whoever installs is one extra `brew tap`
line, once.
