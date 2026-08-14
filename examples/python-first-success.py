"""Figurestead Python first success: render one deterministic line figure."""

from figurestead import line


figure, axes = line([0, 1, 2], [[0, 1, 0]])
figure.savefig("figurestead-first-success.png", dpi=150)
print("Wrote figurestead-first-success.png")
