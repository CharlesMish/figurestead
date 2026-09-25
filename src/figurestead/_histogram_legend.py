"""Dataset-owned histogram medians; private display formatting and paired key."""

import numpy as np
from matplotlib.legend_handler import HandlerBase
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle


def median_labels(values):
    """Six significant digits, with rounding disclosed and no distinct aliases.

    Collision groups use 17 digits (binary64 round-trip precision), as in the
    retained study. Extended NumPy precision, when available, must not silently
    collapse through Python's binary64 string formatting either.
    """
    def exact(text, value):
        return np.asarray(value, dtype=np.result_type(value, np.float64)).dtype.type(text) == value

    texts = [format(value, '.6g') for value in values]
    for i, value in enumerate(values):
        if np.isfinite(value) and (not np.isfinite(float(value)) or (float(value) == 0 and value != 0)):
            texts[i] = np.format_float_scientific(value, precision=5, unique=False, trim='-')
    for text in dict.fromkeys(texts):
        group = [i for i, rendered in enumerate(texts) if rendered == text]
        if len({values[i] for i in group}) > 1:
            for i in group:
                texts[i] = format(values[i], '.17g')
                if not exact(texts[i], values[i]):
                    texts[i] = np.format_float_scientific(values[i], unique=True, trim='-')
    return [('' if exact(text, value) else '≈ ') + text for text, value in zip(texts, values)]


class HistogramMedianLegend(HandlerBase):
    """One swatch from the actual dataset patch and its median vertical rule."""

    def create_artists(self, legend, pair, xd, yd, width, height, fontsize, trans):
        patch, line = pair
        fill = Rectangle((-xd, -yd), width, height)
        fill.update_from(patch)
        fill.set_zorder(patch.get_zorder())
        fill.set_transform(trans)
        fill.set_clip_on(False)
        rule = Line2D([width / 2 - xd] * 2, [-yd, height - yd])
        rule.update_from(line)
        rule.set_zorder(line.get_zorder())
        rule.set_transform(trans)
        rule.set_clip_on(False)
        return [fill, rule]


def histogram_legend(ax, theme, pairs, labels, medians):
    """Keep ordinary legend typography/frame while explicitly pairing ownership."""
    text = [f'{label} · {value}' for label, value in zip(labels, median_labels(medians))]
    # Some supported Matplotlib versions suppress underscore-prefixed explicit
    # labels. Set authored text after construction so every dataset has a row.
    legend = ax.legend(pairs, [''] * len(pairs), frameon=False, fontsize=7,
                       labelcolor=theme.label, handletextpad=0.5, borderaxespad=0.3,
                       loc='best', title='Dataset · median (vertical rule)',
                       title_fontsize=7, handler_map={tuple: HistogramMedianLegend()})
    for row, label in zip(legend.get_texts(), text):
        row.set_text(label)
    legend.get_title().set_color(theme.label)
    return legend
