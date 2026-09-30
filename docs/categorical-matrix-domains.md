# Categorical matrix authored domains — current source

This source correction is not part of the published Python `0.9.0a3` artifact.
It does not migrate the categorical matrix's retained color ramp or add an API.

`figurestead.extensions.matrix.categorical_matrix` keeps its explicit
`valueScale.domain`. The lower and upper bounds map to the existing ramp's
endpoints, including for distinct adjacent or subnormal floating-point bounds.
Creating a colorbar must not widen that scientific domain. Constant observations
retain their position within the authored domain rather than triggering a new
data-derived range.

Ordinary domains retain the existing Matplotlib colorbar, formatting and image
path. When Matplotlib would broaden the bounds, the colorbar alone uses stable
display coordinates from 0 to 1 and two labels in the original units. The labels
retain enough precision to distinguish the authored endpoints and run vertically
beside the bar to avoid truncating digits at the figure edge; percent labels
still express the same values multiplied by 100. This fallback also avoids
overflow in colorbar midpoint arithmetic for otherwise representable domains.
It uses the same unchanged colormap through a separate display mappable: its
unit norm is not the scientific domain stored on the matrix image. The colorbar
remains owned by that image (`image.colorbar` and `colorbar.mappable`) and follows
`set_cmap`, `set_clim`, norm changes and explicit `update_normal` calls. Each
update selects ordinary or unit display coordinates from the current norm;
endpoint labels and tick layout follow that selection. Removing the colorbar
disconnects its image callback through Matplotlib's native lifecycle. Ordinary
colormap/limit changes retain custom tick locators and formatters. The image's
numeric array, domain, masks and annotations remain intact. Nearest-neighbor
RGBA resampling on this path preserves colors already computed from the exact
values on older Matplotlib versions too.

Resetting to an unbounded `Normalize()` or `None` can trigger native autoscaling
and nested change notifications. Endpoint formatting uses the settled colorbar
norm after those updates complete, without requiring a second manual update.
`autoscale` and `autoscale_None` retain the installed Matplotlib version's
normalization behavior; the colorbar describes the resulting image domain.

An authored span that cannot be represented as a positive finite float fails
with a domain-specific `ValueError` before creating a figure or modifying a
caller-owned axes. The data normalizer's input grammar is unchanged. This is
not an arbitrary minimum-span or maximum-magnitude restriction, and no bounds
are substituted or expanded to make an unrepresentable span render.

Category order, keyed cell identity, observed zero, missing/insufficient status
patches, authored labels and status legends are unchanged. The correction does
not introduce nominal/ordinal cell encodings, a diverging center, a new ramp,
or new accessibility or print qualifications. Historical artifacts are retained.

Focused checks:

```sh
python audit/current-head-hardening/test_matrix_domains.py
```

The suite checks all six themes, narrow and ordinary domains, caller-owned
figure preservation on failure, colorbar fills and endpoint labels, annotations,
status cells, repeated renders and PNG/SVG/PDF exports. Colorbar display
coordinates are inspected separately from the image's scientific norm.
Mutation checks cover repeated ordinary/exceptional transitions, colormap and
norm replacement, exported pixels/labels, custom ticks and colorbar removal.
They also cover unbounded/partially bounded norm resets, both autoscale methods,
and caller observers that make nested colormap/limit changes.

This is not universal finite-domain qualification. The preexisting
`[-8e307, 8e307]` image/tick arithmetic limitation remains separate: minimum
Matplotlib can lose cell colors despite a representable span, and current
Matplotlib can emit overflow warnings. This repair does not change that case.
