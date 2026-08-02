# CV source

`yassine-sinif-cv.tex` is the LaTeX source for the CV. It reproduces the
original design exactly — colours, geometry and type sizes were measured off
the original PDF — but produces a **real text layer**, so CV parsers and
applicant tracking systems can read it.

## Build

```sh
xelatex yassine-sinif-cv.tex
```

XeLaTeX is required (not pdfLaTeX) because the document loads OpenType fonts
through `fontspec`.

### Dependencies

On Debian/Ubuntu:

```sh
sudo apt-get install texlive-xetex texlive-latex-extra \
                     texlive-fonts-recommended texlive-fonts-extra fonts-inter
```

| Font | Used for | Comes from |
|---|---|---|
| Inter | all body text, headings, sidebar | `fonts-inter` |
| Playfair Display | the name at the top | `texlive-fonts-extra` |

Both are referenced by absolute path at the top of the `.tex` file. If your
distribution installs them elsewhere, update the two `Path=` values.

## Things worth knowing before editing

**Do not remove `RawFeature={-calt}` from the Inter definitions.** Inter's
contextual alternates substitute a `+` glyph that carries no Unicode mapping,
so without this flag `+212 6 23 84 25 35` extracts as `212 6 23 84 25 35` and
`C++` extracts as `C` — silently breaking exactly the machine-readability this
document exists to provide. After any edit, verify with:

```sh
python3 -c "import fitz; t=fitz.open('yassine-sinif-cv.pdf')[0].get_text(); \
print('+212' in t, 'C++' in t)"
```

**The layout is positioned absolutely.** The sidebar and the main column are
`textpos` blocks placed at measured point coordinates, and the background band
plus the portrait are drawn in a TikZ layer anchored to the page corners. The
numbers in the geometry section are not arbitrary — they come from the original
document. Changing a font size will shift line breaks, so re-render and compare
against the original before shipping.

**Avoid `opacity=` in the background TikZ layer.** Inside
`\AddToShipoutPictureBG` the transparency resource is not registered, which
leaves a dangling `ExtGState` reference that some PDF viewers report as a
syntax error. The portrait ring uses a pre-blended solid colour instead.

## Output

The built PDF is copied to `../public/cv/yassine-sinif-cv.pdf`, which is what
the site serves and what the assistant's `send_cv` tool hands over.
