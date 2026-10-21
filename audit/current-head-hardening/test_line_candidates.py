"""Renderer-space candidate completeness and phase, with frozen a5 oracle.

The original algorithm is only a differential reference, not the sole oracle:
independent interior/phase checks reject intentionally wrong test-only mutants.
No timing threshold: the separate retained benchmark reports construction/draw.
"""
from io import BytesIO
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.path import Path as MplPath
from matplotlib.transforms import IdentityTransform
from matplotlib.collections import PathCollection
import numpy as np
from figurestead import line
from figurestead import _line_identity as subject
import _line_identity_reference as reference


def original_draw(artist, renderer):
    # The frozen class's zero-argument super() requires its original type.
    # Preserve that original delegation branch when borrowing its method for
    # a production instance; all protected-stroke work runs verbatim below.
    points=getattr(artist,"identity_points",None)
    if points is None or not points.get_visible() or points.get_alpha()==0:
        return Line2D.draw(artist,renderer)
    return reference.IdentityLine.draw(artist,renderer)


def fixtures():
    rng = np.random.default_rng(701)
    return {
        "walk": (np.arange(35.), rng.normal(size=35).cumsum()),
        "retrace": (np.r_[np.linspace(0, 10, 30), np.linspace(9.9, .1, 23)],
                    np.zeros(53)),
        "reverse": (np.r_[np.arange(15.), np.arange(14., -1., -1.)],
                    np.r_[np.arange(15.), np.arange(14., -1., -1.)]),
        "coincident": (np.r_[0., np.ones(10), 2., 3.], np.zeros(13)),
        "blob": (np.r_[rng.normal(0, .045, 34), 1., 2.],
                 np.r_[rng.normal(0, .045, 34), 1., 0.]),
        "gaps": (np.arange(35.), np.where(np.arange(35) % 7 == 3, np.nan,
                                        np.sin(np.arange(35.) / 4))),
    }


def figure(x, y, slot=0, stride=1, rhythm="solid", dpi=100, scale=None):
    fig, ax = line(x, y, series_slots=[slot], marker_stride=stride,
                   series_keys=["trace"], line_styles={"trace": rhythm})
    fig.set_size_inches(5, 3)
    fig.set_dpi(dpi)
    fig.set_facecolor("white"); ax.set_facecolor("white"); ax.set_axis_off()
    for text in fig.texts:
        text.set_visible(False)
    body = ax.lines[0]
    body.set_color("black"); body.set_alpha(1)
    body.set_path_effects([])
    body.identity_edge_width = 0
    body.identity_points.set_edgecolor("black")
    body.identity_points.set_path_effects([])
    if scale == "log":
        ax.set_yscale("log")
    if scale == "invert":
        ax.invert_xaxis()
    return fig, ax, body


def raster(fig, draw=None):
    with patch.object(subject.IdentityLine, "draw", draw or subject.IdentityLine.draw):
        fig.canvas.draw()
        return np.asarray(fig.canvas.buffer_rgba()).copy()


def hole_mask(fig, body, radius_factor=.12, extra=0):
    centers = body.identity_points.get_offset_transform().transform(body.identity_points.get_offsets())
    size = fig.canvas.get_renderer().points_to_pixels(np.sqrt(body.identity_points.get_sizes()[0]))
    rows, cols = np.indices((int(fig.bbox.height), int(fig.bbox.width)))
    # Renderer pixels sample at half-integer centers, origin lower left.
    px, py = cols + .5, fig.bbox.height - rows - .5
    mask = np.zeros(px.shape, bool)
    for center in centers:
        mask |= (px - center[0])**2 + (py - center[1])**2 < (size * radius_factor + extra)**2
    return mask


def interior_mask(fig, body):
    """Actual glyph interior, inset one display pixel for raster AA support."""
    centers=body.identity_points.get_offset_transform().transform(body.identity_points.get_offsets())
    size=fig.canvas.get_renderer().points_to_pixels(np.sqrt(body.identity_points.get_sizes()[0]))
    height,width=int(fig.bbox.height),int(fig.bbox.width)
    mask=np.zeros((height,width),bool)
    if body.identity_marker != "o":
        shape=subject.MarkerStyle(body.identity_marker)
        v=shape.get_path().transformed(shape.get_transform()).vertices[:-1]*size
    for center in centers:
        # Local raster ROI keeps this oracle linear in marker count too.
        left=max(0,int(np.floor(center[0]-size)))
        right=min(width,int(np.ceil(center[0]+size)))
        top=max(0,int(np.floor(fig.bbox.height-center[1]-size)))
        bottom=min(height,int(np.ceil(fig.bbox.height-center[1]+size)))
        rows,cols=np.mgrid[top:bottom,left:right]
        p=np.stack((cols+.5-center[0],fig.bbox.height-rows-.5-center[1]),axis=-1)
        if body.identity_marker=="o":
            inside=np.sum(p*p,axis=-1)<max(0,size/2-1)**2
        else:
            inside=np.ones(rows.shape,bool)
            for start,end in zip(v,np.roll(v,-1,axis=0)):
                e=end-start;q=p-start
                inside &= e[0]*q[:,:,1]-e[1]*q[:,:,0]>np.linalg.norm(e)
        mask[top:bottom,left:right] |= inside
    return mask


def adjacency_mutant(self, a, b):
    # Wrong on purpose: only endpoint markers may hide a segment.
    c = self.centers
    return c[np.all(c == a, axis=1) | np.all(c == b, axis=1)]


def compound_mutant(self, renderer):
    """Wrong on purpose: each MOVETO restarts dash phase in renderer.draw_path."""
    p = self.identity_points
    centers = p.get_offset_transform().transform(p.get_offsets())
    size = renderer.points_to_pixels(np.sqrt(p.get_sizes()[0]))
    padding = renderer.points_to_pixels(self.get_linewidth()) / 2
    vertices = self.get_transform().transform(self.get_xydata())
    vv, codes = [], []
    for a, b in zip(vertices, vertices[1:]):
        if not (np.isfinite(a).all() and np.isfinite(b).all()):
            continue
        for lo, hi in reference.visible_intervals(a, b, centers, self.identity_marker, size, padding):
            vv.extend((a + lo * (b-a), a + hi * (b-a)))
            codes.extend((MplPath.MOVETO, MplPath.LINETO))
    if vv:
        gc = renderer.new_gc()
        gc.set_foreground(self.get_color())
        gc.set_linewidth(self.get_linewidth())
        gc.set_alpha(self.get_alpha())
        gc.set_capstyle("butt")
        gc.set_dashes(*self._dash_pattern)
        self._set_gc_clip(gc)
        renderer.draw_path(gc, MplPath(vv, codes), IdentityTransform())
        gc.restore()


class LineCandidateTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_segment_intervals_match_original_for_adversarial_display_geometry(self):
        # Separate geometric oracle: all candidates that actually remove ink
        # must survive the broad phase, for every current glyph and clearance.
        for name, (x, y) in fixtures().items():
            vertices = np.column_stack((x, y)) * [30, 20]
            for stride in (1, 5, 7):
                centers = vertices[subject.line_marker_indices(y, stride)]
                for marker, size in subject.LINE_IDENTITIES:
                    for padding in (0., 1.5, 5.):
                        index = subject._MarkerCandidates(centers, marker, size, padding)
                        for a, b in zip(vertices, vertices[1:]):
                            if not np.isfinite([a,b]).all():
                                continue
                            expected = list(reference.visible_intervals(a,b,centers,marker,size,padding))
                            actual = list(subject.visible_intervals(a,b,index.for_segment(a,b),marker,size,padding))
                            self.assertEqual(actual, expected, (name,stride,marker,padding,a,b))

    def test_adversarial_rasters_exact_original_and_clear_interiors_at_two_dpis(self):
        for name, (x,y) in fixtures().items():
            for stride in (1,5,7):
                for dpi in (72,160):
                    for slot in range(4):
                        for rhythm in ("solid","dash"):
                            with self.subTest(fixture=name,stride=stride,dpi=dpi,slot=slot,rhythm=rhythm):
                                fig,ax,body=figure(x,y,slot,stride,rhythm,dpi)
                                np.testing.assert_array_equal(raster(fig),raster(fig,original_draw))
                                body.identity_points.set_edgecolor("none")
                                pixels=raster(fig)
                                self.assertFalse(np.any(pixels[:,:,:3][interior_mask(fig,body)] != 255))
                                plt.close(fig)

    def test_transform_resize_and_export_recompute_display_candidates(self):
        x=np.linspace(1,100,27);y=np.exp(np.sin(x/20)+2)
        for transform in ("log","invert",None):
            for rhythm in ("solid","dash","dot","dash-dot"):
                fig,ax,body=figure(x,y,2,7,rhythm,72,transform)
                for size,dpi in (((4.2,2.6),72),((6.1,3.2),160),((4.2,2.6),72)):
                    fig.set_size_inches(*size);fig.set_dpi(dpi)
                    np.testing.assert_array_equal(raster(fig),raster(fig,original_draw))
                for fmt in ("png","svg","pdf"):
                    # Fixed metadata/hashsalt removes only backend metadata
                    # variance, not any geometry, clipping or rhythm content.
                    metadata={"Date":None} if fmt=="svg" else ({"CreationDate":None,"ModDate":None} if fmt=="pdf" else {})
                    with matplotlib.rc_context({"svg.hashsalt":"identity-candidates"}):
                        candidate=BytesIO();fig.savefig(candidate,format=fmt,dpi=300,metadata=metadata)
                        with patch.object(subject.IdentityLine,"draw",original_draw):
                            control=BytesIO();fig.savefig(control,format=fmt,dpi=300,metadata=metadata)
                    self.assertEqual(candidate.getvalue(),control.getvalue(),(transform,rhythm,fmt))
                plt.close(fig)

    def test_rhythm_continues_outside_holes_and_mutant_is_detected(self):
        # A horizontal path has no solid-join ambiguities. Compare against
        # one unmasked whole Line2D, independently of the frozen reference.
        # Integer display vertices/clearance at 72/144 DPI remove subpixel Agg
        # snapping variance. Arbitrary transform/DPI rasters above compare
        # exactly with the original, and the separate scalar oracle tests phase.
        mutant_differences=[]
        for dpi in (72,144):
            for rhythm in ("dash","dot","dash-dot"):
                for stride in (1,5):
                    fig,ax,body=figure(np.arange(29.),np.zeros(29),0,stride,rhythm,dpi)
                    body.identity_points.set_edgecolor("none")
                    fig.set_size_inches(10,3)
                    ax.set_position([.1,.25,.7,.5]);ax.set_xlim(0,28)
                    body.set_linewidth(2)
                    current=raster(fig)
                    mask=hole_mask(fig,body,.6,3)
                    with patch.object(subject.IdentityLine,"draw",Line2D.draw):
                        no_holes=raster(fig)
                    delta=np.any(current!=no_holes,axis=2)&~mask
                    self.assertLessEqual(int(delta.sum()),3,(dpi,rhythm,stride))
                    mutant=raster(fig,compound_mutant)
                    mismatch=np.any(mutant!=no_holes,axis=2)&~mask
                    mutant_differences.append(int(mismatch.sum()))
                    self.assertGreater(int(mismatch.sum()),3,(dpi,rhythm,stride))
                    plt.close(fig)
        self.assertEqual(len(mutant_differences),12)

    def test_adjacency_mutant_leaks_on_retrace_and_blob(self):
        for name in ("retrace","blob"):
            x,y=fixtures()[name]
            fig,ax,body=figure(x,y,0,1,"solid",160)
            body.identity_points.set_edgecolor("none")
            correct=raster(fig)
            mask=interior_mask(fig,body)
            self.assertFalse(np.any(correct[:,:,:3][mask]!=255))
            with patch.object(subject._MarkerCandidates,"for_segment",adjacency_mutant):
                wrong=raster(fig)
            self.assertTrue(np.any(wrong[:,:,:3][mask]!=255),name)

    def test_resolved_piece_phase_matches_display_distance(self):
        # Scalar oracle independent of the reference draw implementation.
        # Capture every actual renderer proxy and verify its phase against
        # run-start distance, including nonzero offsets and linewidth scaling.
        x=np.arange(14.);y=np.zeros(14);y[6:8]=np.nan
        fig,ax,body=figure(x,y,0,5,"dash",160)
        body.set_linestyle((1.7,(3.7,1.6)))
        fig.canvas.draw()
        vertices=body.get_transform().transform(body.get_xydata())
        finite=subject.finite_runs(y)
        calls=[]
        draw=Line2D.draw
        def record(artist,renderer):
            if artist is not body and artist.get_color()==body.get_color() and artist.get_alpha()==1:
                points=np.asarray(artist.get_xydata())
                if points.shape==(2,2) and isinstance(artist.get_transform(),IdentityTransform):
                    calls.append((points.copy(),artist._unscaled_dash_pattern))
            return draw(artist,renderer)
        with patch.object(Line2D,"draw",record):
            fig.canvas.draw()
        self.assertTrue(calls)
        px=fig.canvas.get_renderer().points_to_pixels(1)
        for piece,(offset,dashes) in calls:
            start=next(start for start,stop in finite if vertices[start,0]-1e-9<=piece[0,0]<=vertices[stop-1,0]+1e-9)
            distance=piece[0,0]-vertices[start,0]
            expected=(1.7+distance/px/body.get_linewidth())%sum(dashes)
            self.assertAlmostEqual(offset,expected,places=9)

    def test_legend_identity_transform_clear_interior_and_both_sides(self):
        for rhythm in ("solid","dash","dot","dash-dot"):
            fig,ax=line([0,1],[[0,0],[1,1]],labels=["First","Second"],
                        series_keys=["a","b"],line_styles={"a":rhythm,"b":rhythm})
            legend=ax.get_legend();fig.canvas.draw()
            handles=getattr(legend,"legend_handles",None)
            if handles is None: handles=legend.legendHandles
            fig.set_facecolor("white");ax.set_facecolor("white");ax.set_axis_off()
            for child in ax.lines:
                child.set_visible(False);child.identity_points.set_visible(False)
            for text in ax.texts:
                text.set_visible(False)
            for sample in handles:
                sample.set_color("black");sample.set_alpha(1);sample.set_path_effects([])
                sample.identity_edge_width=0
                sample.identity_points.set_edgecolor("none");sample.identity_points.set_path_effects([])
            for handle in handles:
                # Render actual handler output under its handle-box transform;
                # remove other artists to independently inspect the sample.
                np.testing.assert_array_equal(raster(fig),raster(fig,original_draw))
                points=handle.identity_points
                center=points.get_offset_transform().transform(points.get_offsets())[0]
                size=fig.canvas.get_renderer().points_to_pixels(np.sqrt(points.get_sizes()[0]))
                verts=handle.get_transform().transform(handle.get_xydata())
                clear=fig.canvas.get_renderer().points_to_pixels(handle.get_linewidth()+getattr(handle,"identity_edge_width",0))/2
                candidate=subject._MarkerCandidates(np.array([center]),handle.identity_marker,size,clear)
                intervals=list(subject.visible_intervals(*verts,candidate.for_segment(*verts),handle.identity_marker,size,clear))
                self.assertEqual(len(intervals),2)
                self.assertLess(intervals[0][1],.5);self.assertGreater(intervals[1][0],.5)
                pixels=raster(fig)
                self.assertFalse(np.any(pixels[:,:,:3][interior_mask(fig,handle)]!=255))
                row=int(fig.bbox.height-center[1]);lo=int(verts[0,0]);hi=int(verts[-1,0])
                left=pixels[row-2:row+3,lo:int(center[0]-size*.6),:3]
                right=pixels[row-2:row+3,int(center[0]+size*.6):hi,:3]
                self.assertTrue(np.any(left<255),(rhythm,"left"))
                self.assertTrue(np.any(right<255),(rhythm,"right"))
            plt.close(fig)

    def test_body_edge_weights_and_identity_legend_remain_exact(self):
        # Preserve actual themed path effects rather than only a black test
        # stroke; widths, inverse/log transforms and resize are draw-local.
        for theme in ("lavender_fog_notebook","ultraviolet_laboratory","registration_ink"):
            fig,ax=line([1,2,3,2,4],[[1,3,2,4,5],[3,1,4,2,5]],
                theme=theme,labels=["Measured","Predicted"],series_keys=["a","b"],line_styles={"b":"dash-dot"})
            for body in ax.lines:
                body.set_linewidth(3.2)
            ax.set_yscale("log");ax.invert_xaxis()
            for dpi in (72,160):
                fig.set_dpi(dpi)
                np.testing.assert_array_equal(raster(fig),raster(fig,original_draw))
            plt.close(fig)

    def test_phase_restarts_only_at_true_gaps(self):
        # Exactly reproduce each independent finite run with the same axes.
        for rhythm in ("dash","dot","dash-dot"):
            x=np.arange(20.);y=np.zeros(20);y[7:11]=np.nan
            fig,ax,body=figure(x,y,0,5,rhythm,160)
            expected=raster(fig)
            body.set_visible(False);body.identity_points.set_visible(False)
            for start,stop in subject.finite_runs(y):
                run=subject.IdentityLine(x[start:stop],y[start:stop]);run.update_from(body)
                run.set_visible(True);run.set_transform(ax.transData)
                pts=body.identity_points
                offsets=pts.get_offsets();mask=(offsets[:,0]>=start)&(offsets[:,0]<stop)
                collection=PathCollection(pts.get_paths(),sizes=pts.get_sizes(),offsets=offsets[mask],
                    offset_transform=ax.transData,facecolors="none",edgecolors=pts.get_edgecolors(),
                    linewidths=pts.get_linewidths(),alpha=1,zorder=pts.get_zorder())
                collection.set_transform(IdentityTransform());ax.add_collection(collection)
                run.identity_points=collection;run.identity_marker=body.identity_marker;run.identity_edge_width=0
                ax.add_line(run)
            np.testing.assert_array_equal(expected,raster(fig))


if __name__=="__main__":
    unittest.main()
