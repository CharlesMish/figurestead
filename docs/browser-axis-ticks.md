# Browser numeric and UTC axis ticks

Current source resolves numeric tick labels as a set before measuring or
painting them. Precision starts from tick spacing and increases until each label
reads back to the actual numeric tick value. Distinct strings alone are not
sufficient: ticks at 1040 and 1060 must not be labelled 1000 and 1100. Existing
compact labels remain unchanged when they already represent their values exactly.

UTC labels include the date/time components needed to identify the actual tick
instant at JavaScript Date's millisecond precision. An intraday axis therefore
includes time, and `Z` makes its UTC interpretation explicit. Longer ISO labels
can use two lines at the date/time boundary; joining those lines gives the full
resolved label. No local-time conversion is introduced.

Fractional-millisecond numeric tick coordinates cannot be faithfully formatted by
JavaScript Date. They now raise `RangeError` explicitly rather than silently
truncating distinct coordinates to the same timestamp. For example, the existing
generator produces distinct half-millisecond ticks on `[0, 2]`; those coordinates
are preserved, but their unsupported formatting rejects. This is separate from
the repeated-coordinate generator defect below; sub-millisecond UTC formatting
would require its own design.

Canvas and SVG consume the same measured numeric text plan. Numeric ticks do not
pass through categorical-label or legend abbreviation, and Canvas does not
compress them with `fillText`'s optional maximum width. Full text participates in
axis spacing. If it cannot fit without horizontal overlap or clipping (including
the extra height of multiline UTC ticks), resolution raises
`FiguresteadConfigError` with an `insufficient ... numeric tick space` message.
Increase the figure size in that case. This does not introduce general compact
layout support, automatic tick removal, or a new formatting option.

The public API, data, domains, generated tick coordinates and UTC interpretation
are unchanged. Category tick treatment, legends, and the existing scientific
semantics remain separate.

## Deferred tick-generation defect

The existing generator rounds coordinates to twelve significant digits. A
four-millisecond span around a modern epoch timestamp can consequently produce
repeated coordinates. Formatting cannot recover coordinates already lost by that
step. This correction deliberately preserves that behavior, records it in a
regression, and does not deduplicate, regenerate, or invent replacement ticks.
A separate coordinate-generation correction is required.
