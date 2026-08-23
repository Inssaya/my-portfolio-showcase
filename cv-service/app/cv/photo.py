"""Pull the portrait out of an uploaded CV.

Most designed CVs carry a headshot, and a rebuild that drops it looks obviously
worse than the original. The photo is also the one thing on the page that no
amount of text extraction can recover, so it is worth handling deliberately.

Uses pypdf rather than PyMuPDF on purpose. PyMuPDF is the better PDF toolkit,
but it is AGPL: linking it into a hosted service obliges you to publish the
service's source to its users. This one is planned to become paid, so that is a
licence decision, not a preference. pypdf is BSD and does everything needed
here.

Nothing in this module trusts the file. An uploaded PDF is attacker-controlled
input: images are size-capped before decode, decoding is bounded, and every
failure is caught — a malformed image must cost the visitor their photo, not
the process.
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

# A portrait is never tiny — smaller than this is an icon, a logo or a bullet
# glyph, of which a designed CV has many.
MIN_EDGE_PX = 90

# Portraits are square-ish or slightly tall. Wider than 1.6 is a banner or a
# header strip; taller than 0.5 is a sidebar background.
MIN_RATIO, MAX_RATIO = 0.5, 1.6

# Decode guard. Pillow allocates width*height*channels on open, so an image
# claiming enormous dimensions is a memory bomb regardless of its file size.
MAX_PIXELS = 40_000_000

# Above this share of the page area an image is the page — a scan, not a
# portrait. Judged on the rendered placement, not the raster's own resolution.
PAGE_COVERAGE_LIMIT = 0.55

# Re-encode target. The renderer clips to a 44pt circle at 88pt across, so
# anything past a few hundred pixels is invisible weight in the output PDF.
TARGET_EDGE_PX = 512


def _decode(raw: bytes):
    """Open an embedded image defensively. Returns a PIL Image or None."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is declared
        return None
    try:
        image = Image.open(io.BytesIO(raw))
        width, height = image.size
        if width * height > MAX_PIXELS:
            logger.info("skipping %dx%d embedded image: over decode limit", width, height)
            return None
        image.load()
        return image
    except Exception:  # noqa: BLE001 — Pillow raises a wide family on bad data
        return None


def _looks_like_a_portrait(width: int, height: int) -> bool:
    if width < MIN_EDGE_PX or height < MIN_EDGE_PX:
        return False
    return MIN_RATIO <= width / height <= MAX_RATIO


def extract_portrait(pdf_bytes: bytes) -> bytes | None:
    """Return the most portrait-like image on page 1, re-encoded as PNG.

    Page 1 only: a headshot that appears first on page 2 is not the CV's
    portrait. Returns None when nothing qualifies, which is the common and
    entirely fine case — plenty of good CVs have no photo.
    """
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - pypdf is declared
        return None

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            return None
        page = reader.pages[0]
        page_area = float(page.mediabox.width) * float(page.mediabox.height)
        images = list(page.images)
    except Exception as exc:  # noqa: BLE001 — a broken PDF costs the photo only
        logger.info("could not read images from PDF: %s", type(exc).__name__)
        return None

    best = None
    best_score = 0.0

    for embedded in images[:40]:  # a designed CV has icons; bound the work
        image = _decode(getattr(embedded, "data", b""))
        if image is None:
            continue
        width, height = image.size
        if not _looks_like_a_portrait(width, height):
            continue

        # A page-sized image is a scan of the whole CV. Compare against the
        # page box rather than a fixed pixel count, so a high-resolution
        # headshot is not mistaken for one.
        if page_area > 0 and (width * height) / page_area > PAGE_COVERAGE_LIMIT * 1000:
            continue

        # Prefer larger and nearer to square: a headshot is both, while banners
        # and rules are neither.
        squareness = 1.0 - abs(1.0 - width / height)
        score = (width * height) ** 0.5 * max(squareness, 0.1)
        if score > best_score:
            best, best_score = image, score

    if best is None:
        return None

    return _to_png(best, TARGET_EDGE_PX)


# Vision input is billed per image tile, and a CV page is legible well below
# print resolution. 1400px on the long edge keeps body text readable while
# holding the tile count — and the cost — down.
VISION_EDGE_PX = 1400


def extract_page_image(pdf_bytes: bytes) -> bytes | None:
    """Return page 1's dominant image, for the vision fallback.

    The mirror image of `extract_portrait`, and deliberately a separate
    function: that one *rejects* page-sized images because a headshot is never
    the whole page, which is exactly what a scanned CV is. Reusing it here
    would have meant vision never firing on the files that need it most.

    No rasterising of vector pages: this only recovers CVs that are already
    images, which is the case the text tier cannot handle. A page with real
    text never reaches here.
    """
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - pypdf is declared
        return None

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            return None
        images = list(reader.pages[0].images)
    except Exception as exc:  # noqa: BLE001
        logger.info("could not read page image: %s", type(exc).__name__)
        return None

    best = None
    best_area = 0
    for embedded in images[:40]:
        image = _decode(getattr(embedded, "data", b""))
        if image is None:
            continue
        area = image.size[0] * image.size[1]
        if area > best_area:
            best, best_area = image, area

    # A scan fills the page. Anything small is an icon and would tell vision
    # nothing, so it is not worth an API call.
    if best is None or min(best.size) < 400:
        return None
    return _to_png(best, VISION_EDGE_PX)


def extract_portrait_from_docx(data: bytes) -> bytes | None:
    """Same job as `extract_portrait`, for .docx.

    A .docx is a zip and its images sit unmodified in `word/media/`, so this
    needs no Word parsing at all — which is why it is worth having: without it,
    every CV written in Word loses its photo on rebuild, and Word is what most
    people write a CV in.
    """
    import zipfile

    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        names = [
            n for n in archive.namelist()
            if n.startswith("word/media/") and not n.endswith("/")
        ]
    except Exception as exc:  # noqa: BLE001 — a corrupt upload costs the photo only
        logger.info("could not open docx archive: %s", type(exc).__name__)
        return None

    best = None
    best_score = 0.0
    for name in names[:40]:
        try:
            # Guard the decompressed size: a zip bomb is cheap to author and
            # this file came from the public internet.
            info = archive.getinfo(name)
            if info.file_size > 25_000_000:
                continue
            raw = archive.read(name)
        except Exception:  # noqa: BLE001
            continue

        image = _decode(raw)
        if image is None:
            continue
        width, height = image.size
        if not _looks_like_a_portrait(width, height):
            continue
        squareness = 1.0 - abs(1.0 - width / height)
        score = (width * height) ** 0.5 * max(squareness, 0.1)
        if score > best_score:
            best, best_score = image, score

    return _to_png(best, TARGET_EDGE_PX) if best is not None else None


IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".bmp", ".gif")


def looks_like_an_image(filename: str) -> bool:
    """Route an upload by extension: a photo, or a CV to read?"""
    return (filename or "").lower().endswith(IMAGE_SUFFIXES)


class PhotoError(Exception):
    """The upload is not a usable portrait. Carries a message for the visitor."""


def prepare_uploaded_photo(data: bytes, filename: str) -> bytes:
    """Validate and normalise a portrait the visitor uploaded directly.

    Three things happen here that matter beyond "resize it":

    * **Orientation is applied.** A phone photo records its rotation in EXIF
      rather than in the pixels. Pillow does not apply it on open, so without
      this a portrait taken in the obvious way renders sideways on the CV — and
      the circular crop then cuts through the person's ear.
    * **EXIF is dropped.** Camera metadata routinely carries GPS coordinates of
      where the photo was taken, usually someone's home. Re-encoding strips it,
      so a CV sent to strangers does not carry a location with it.
    * **It is re-encoded, not passed through.** The bytes that reach the PDF are
      ones we produced from decoded pixels, so a malformed file that survived
      decode cannot be embedded verbatim.
    """
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:  # pragma: no cover - Pillow is declared
        raise PhotoError("Image support is not installed on the server.") from exc

    image = _decode(data)
    if image is None:
        raise PhotoError(
            "That image could not be read. Try a JPG or PNG — or if it came "
            "from an iPhone, share it as JPG rather than HEIC."
        )

    width, height = image.size
    if min(width, height) < 150:
        raise PhotoError(
            f"That image is only {width}x{height}. A portrait needs to be at "
            "least 150 pixels on its short side or it will look blurry in print."
        )

    try:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        image.thumbnail((TARGET_EDGE_PX, TARGET_EDGE_PX), Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
    except Exception as exc:  # noqa: BLE001
        raise PhotoError("That image could not be processed.") from exc


def _to_png(image, max_edge: int) -> bytes | None:
    """Flatten, downscale and encode. None if the image cannot be saved."""
    try:
        # Flatten to RGB: the renderer draws onto an opaque circle, and a
        # palette or CMYK source would otherwise fail to save as PNG.
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()
    except Exception as exc:  # noqa: BLE001
        logger.info("could not encode image: %s", type(exc).__name__)
        return None
