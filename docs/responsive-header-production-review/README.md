# Responsive-header production visual refresh

This packet records the exact outward image delta from accepted baseline
`e14d9098f0daefebadf3c0637dbe14e6b5c937e9` after production compact C header
fitting was enabled. It is evidence refresh, not a new visual design.

The changed specimen, montage, and 390 px Technical Showcase images differ only
where compact visual title/subtitle fitting is now active. Scientific plot
geometry, the 13 accepted individual figure frames, the populated Python matrix,
paper evidence, and the Technical Showcase terminal motion frame remain
byte-identical. README montage A keeps its 4×2 composition and crop. Selected
social candidate C remains byte-identical because its three full-frame sources
are unchanged.

Regenerate the record after the accepted browser evidence and README derivatives
have been refreshed:

```sh
python docs/responsive-header-production-review/record_refresh.py
```
